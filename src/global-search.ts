// 跨文件搜索：在所有挂着的文件夹里找一句话。
//
// 这是单文件编辑器结构上给不了的东西——多文件夹工作区才有「跨文件」这个概念。
// 实现上刻意保持笨而稳：边读边出结果，不建索引、不写任何文件。

import { readTextFromFile, type DirNode, type FileNode } from "./fs";
import { onLangChange, t } from "./i18n";

export interface SearchTarget {
  spaceId: string;
  spaceName: string;
  tree: DirNode;
}

export interface Hit {
  spaceId: string;
  spaceName: string;
  node: FileNode;
  /** 命中所在行（原文），前后不截断，交给界面处理 */
  line: string;
  /** 关键词在这一行里的起始位置 */
  at: number;
}

interface Cached {
  lastModified: number;
  size: number;
  text: string;
}

/** 每篇稿子最多列几条，免得一个词在同一篇里出现两百次把面板刷满 */
const PER_FILE = 5;

export class GlobalSearch {
  /** 读过的内容按「文件路径」缓存，靠 lastModified + size 判新旧，避免每次搜索重读整个文件夹 */
  private cache = new Map<string, Cached>();
  /** 每次搜索自增，旧的那轮拿到结果也不再往界面上写 */
  private round = 0;

  constructor(
    private ui: {
      panel: HTMLElement;
      input: HTMLInputElement;
      status: HTMLElement;
      list: HTMLElement;
      close: HTMLButtonElement;
    },
    private getTargets: () => SearchTarget[],
    private onOpen: (hit: Hit, query: string) => void,
  ) {
    let timer = 0;
    this.ui.input.addEventListener("input", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void this.run(), 220);
    });
    this.ui.input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.hide();
    });
    this.ui.close.addEventListener("click", () => this.hide());
    this.ui.list.addEventListener("click", (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>("[data-hit]");
      if (!row) return;
      const hit = this.hits[Number(row.dataset.hit)];
      if (hit) this.onOpen(hit, this.ui.input.value.trim());
    });
    onLangChange(() => this.refreshLang());
  }

  /** 面板关着就什么都不做；开着的话有词就重搜一遍（读盘有缓存，不重），没词就把状态行换成当前语言 */
  private refreshLang(): void {
    if (this.ui.panel.hidden) return;
    if (this.ui.input.value.trim()) {
      void this.run();
      return;
    }
    this.ui.status.textContent = this.getTargets().length === 0 ? t().globalSearch.noFolders : "";
  }

  private hits: Hit[] = [];

  show(): void {
    this.ui.panel.hidden = false;
    this.ui.input.focus();
    this.ui.input.select();
    if (this.ui.input.value.trim()) void this.run();
  }

  hide(): void {
    this.ui.panel.hidden = true;
  }

  isOpen(): boolean {
    return !this.ui.panel.hidden;
  }

  private async run(): Promise<void> {
    const query = this.ui.input.value.trim();
    const mine = ++this.round;
    this.hits = [];
    this.ui.list.textContent = "";

    if (!query) {
      this.ui.status.textContent = "";
      return;
    }

    const targets = this.getTargets();
    if (targets.length === 0) {
      this.ui.status.textContent = t().globalSearch.noFolders;
      return;
    }

    const files: { spaceId: string; spaceName: string; node: FileNode }[] = [];
    for (const target of targets) {
      collect(target.tree, (node) =>
        files.push({ spaceId: target.spaceId, spaceName: target.spaceName, node }),
      );
    }

    this.ui.status.textContent = t().globalSearch.scanningStart(files.length);
    const needle = query.toLowerCase();
    let scanned = 0;
    let matched = 0;

    for (const item of files) {
      if (mine !== this.round) return; // 用户又改了关键词，这一轮作废
      scanned += 1;
      let text: string;
      try {
        text = await this.read(item.spaceId, item.node);
      } catch {
        continue; // 单篇读不动就跳过，不能让整次搜索失败
      }
      if (!text.toLowerCase().includes(needle)) continue;

      matched += 1;
      const lines = text.split("\n");
      let listed = 0;
      for (const line of lines) {
        const at = line.toLowerCase().indexOf(needle);
        if (at < 0) continue;
        this.hits.push({ ...item, line, at });
        listed += 1;
        if (listed >= PER_FILE) break;
      }
      this.paint(query, matched, scanned, files.length);
    }

    if (mine !== this.round) return;
    this.paint(query, matched, scanned, files.length, true);
  }

  /** 内容缓存：同一个文件没改过就不重读 */
  private async read(spaceId: string, node: FileNode): Promise<string> {
    const key = `${spaceId} ${node.path}`;
    const file = await node.handle.getFile();
    const hit = this.cache.get(key);
    if (hit && hit.lastModified === file.lastModified && hit.size === file.size) return hit.text;
    // 走跟打开稿子同一套编码识别，GBK 旧稿也能搜到
    const loaded = await readTextFromFile(file);
    this.cache.set(key, { lastModified: file.lastModified, size: file.size, text: loaded.text });
    return loaded.text;
  }

  private paint(query: string, matched: number, scanned: number, total: number, done = false): void {
    this.ui.status.textContent = done
      ? this.hits.length === 0
        ? t().globalSearch.notFound(query)
        : t().globalSearch.found(matched, this.hits.length)
      : t().globalSearch.scanning(matched, scanned, total);

    this.ui.list.textContent = "";
    let lastFile = "";
    this.hits.forEach((hit, index) => {
      const fileKey = `${hit.spaceId} ${hit.node.path}`;
      if (fileKey !== lastFile) {
        lastFile = fileKey;
        const head = document.createElement("div");
        head.className = "gs-file";
        head.textContent = hit.node.name.replace(/\.(md|markdown)$/i, "");
        const where = document.createElement("small");
        where.textContent = hit.spaceName;
        head.append(where);
        this.ui.list.append(head);
      }

      const row = document.createElement("button");
      row.type = "button";
      row.className = "gs-hit";
      row.dataset.hit = String(index);
      // 命中处前后各留一点上下文，太长的行不铺满整栏
      const from = Math.max(0, hit.at - 24);
      const before = (from > 0 ? "…" : "") + hit.line.slice(from, hit.at);
      const mid = hit.line.slice(hit.at, hit.at + query.length);
      const after = hit.line.slice(hit.at + query.length, hit.at + query.length + 48);
      const b = document.createElement("span");
      b.textContent = before;
      const m = document.createElement("mark");
      m.textContent = mid;
      const a = document.createElement("span");
      a.textContent = after;
      row.append(b, m, a);
      this.ui.list.append(row);
    });
  }
}

function collect(node: DirNode, take: (node: FileNode) => void): void {
  for (const child of node.children) {
    if (child.kind === "file") take(child);
    else collect(child, take);
  }
}
