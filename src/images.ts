// 图片双向映射：磁盘上的相对路径 ⇄ 画布里的 blob 地址。
//
// 读盘：稿件里的 ./images/x.png 读成 blob 地址，画布才看得见。
// 存盘：先把新插入的图写进磁盘 images/，再把 blob 地址换回相对路径。
// 稿件里永远只留相对路径，不留 blob，也不留 Base64。

import { resolveFile, uniqueName, writeFile, resolveDir, type DirHandle } from "./fs";

// alt 里允许一层嵌套方括号和反斜杠转义：`![头图[定稿]](x.png)` 这种写法必须认得出来。
// 只有 hydrate 依赖它——认不出最多是图显示不出来，绝不会改写用户的稿件。
const IMAGE_RE = /!\[((?:[^[\]\\]|\\.|\[[^[\]]*\])*)\]\(\s*<?([^)>\s]+)>?((?:\s+"[^"]*")?)\s*\)/g;

function isExternal(url: string): boolean {
  return /^(https?:|data:|blob:|file:)/i.test(url);
}

function decode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** 把 ./images/x.png 这类写法解析成相对根目录的完整路径 */
function joinPath(baseDir: string, rel: string): string {
  const parts = baseDir ? baseDir.split("/") : [];
  for (const segment of rel.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

function safeName(name: string): string {
  const base = name.replace(/[^\w.一-鿿-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
  return /\.[a-z0-9]+$/i.test(base) ? base : `${base}.png`;
}

function extFromType(type: string): string {
  const known: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
  };
  return known[type] ?? ".png";
}

export class ImageStore {
  /** blob 地址 → 稿件里该写的相对路径（已落盘的图） */
  private toRel = new Map<string, string>();
  /** blob 地址 → 还没写进磁盘的二进制 */
  private pending = new Map<string, Blob>();
  /** blob 地址 → 建议文件名 */
  private names = new Map<string, string>();
  /** blob 地址 → 落盘前的预定相对路径。没有它，未落盘的图会把 blob 地址写进稿件 */
  private planned = new Map<string, string>();

  /** 切稿时清空，顺手回收 blob，避免一天写下来攒一堆 */
  reset(): void {
    for (const url of this.toRel.keys()) URL.revokeObjectURL(url);
    for (const url of this.pending.keys()) URL.revokeObjectURL(url);
    this.toRel.clear();
    this.pending.clear();
    this.names.clear();
    this.planned.clear();
  }

  /** 画布里插入一张本地图，先给个 blob 地址顶上，保存时才落盘 */
  track(blob: Blob, suggested: string): string {
    const url = URL.createObjectURL(blob);
    const name = safeName(suggested || `paste${extFromType(blob.type)}`);
    this.pending.set(url, blob);
    this.names.set(url, name);
    this.planned.set(url, `./images/${name}`);
    return url;
  }


  /** 读盘后：相对路径 → blob 地址，画布才显示得出图 */
  async hydrate(
    markdown: string,
    root: DirHandle | null,
    docPath: string,
  ): Promise<string> {
    if (!root) return markdown;
    const baseDir = dirOf(docPath);
    const jobs: Array<{ raw: string; full: string }> = [];
    for (const match of markdown.matchAll(IMAGE_RE)) {
      const raw = match[2];
      if (isExternal(raw)) continue;
      jobs.push({ raw, full: joinPath(baseDir, decode(raw)) });
    }
    if (jobs.length === 0) return markdown;

    const rendered = new Map<string, string>();
    for (const job of jobs) {
      if (rendered.has(job.raw)) continue;
      const handle = await resolveFile(root, job.full);
      if (!handle) continue;
      try {
        const file = await handle.getFile();
        const url = URL.createObjectURL(file);
        this.toRel.set(url, job.raw);
        rendered.set(job.raw, url);
      } catch {
        // 读不到就保持原样，让稿件里的路径继续摆在那，不吞掉用户内容
      }
    }
    if (rendered.size === 0) return markdown;

    return markdown.replace(IMAGE_RE, (whole, alt: string, url: string, title: string) => {
      const blob = rendered.get(url);
      return blob ? `![${alt}](${blob}${title})` : whole;
    });
  }

  /**
   * 存盘前：把当前稿件里用到的新图写进 <稿件目录>/images/，
   * 并登记它们最终的相对路径。稿件里没用到的 pending 图不落盘。
   */
  async flush(
    markdown: string,
    root: DirHandle | null,
    docPath: string,
  ): Promise<void> {
    if (!root || this.pending.size === 0) return;
    // 按 blob 地址原样查找，不解析 markdown 语法：
    // blob 地址是唯一串，正则认不认得 alt 里的方括号都不影响落盘。
    const used = new Set<string>();
    for (const url of this.pending.keys()) {
      if (markdown.includes(url)) used.add(url);
    }
    if (used.size === 0) return;

    const baseDir = dirOf(docPath);
    const segments = baseDir ? [...baseDir.split("/"), "images"] : ["images"];
    const imagesDir = await resolveDir(root, segments, true);
    if (!imagesDir) return;

    for (const url of used) {
      const blob = this.pending.get(url);
      if (!blob) continue;
      const name = await uniqueName(imagesDir, this.names.get(url) ?? "image.png");
      const handle = await imagesDir.getFileHandle(name, { create: true });
      await writeFile(handle, blob);
      this.pending.delete(url);
      this.names.delete(url);
      this.planned.delete(url);
      this.toRel.set(url, `./images/${name}`);
    }
  }

  /**
   * 写盘的正文：blob 地址一律换回相对路径。
   *
   * 走纯字符串替换而不是正则改写——blob 地址本身就是唯一串，
   * 既不用解析 markdown 语法，也就不存在「正则漏掉一处、blob 死链被写进稿件」的风险。
   * planned 是没落盘成功时的兜底：稿件里宁可留一条相对路径，也绝不能留 blob 地址。
   */
  dehydrate(markdown: string): string {
    let out = markdown;
    for (const [url, rel] of this.toRel) {
      if (out.includes(url)) out = out.split(url).join(rel);
    }
    for (const [url, rel] of this.planned) {
      if (out.includes(url)) out = out.split(url).join(rel);
    }
    return out;
  }

  /** 还在画布上、但磁盘上还没有的图。大于 0 时不许写盘，否则稿件里就是死链 */
  pendingCount(markdown: string): number {
    let count = 0;
    for (const url of this.pending.keys()) {
      if (markdown.includes(url)) count += 1;
    }
    return count;
  }
}

/** 写进正文的 alt 一律清洗：app 自己生成的 markdown 必须是自己解析得了的 */
export function safeAlt(text: string): string {
  return text
    .replace(/[[\]()\\\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export { safeName, extFromType };
