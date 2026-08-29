// 磁盘层：目录句柄的持久化、权限、扫描、读写。
// 两套实现：浏览器走 File System Access API，桌面壳（Tauri）走绝对路径。
// 两者共用下面的 DirHandle / FileHandle 接口——浏览器原生句柄天然满足它，
// 所以上层（main / tree / images / global-search）拿到的东西长得一模一样，不必分支。

import {
  readDir,
  readFile,
  writeFile as writeBytes,
  mkdir,
  exists,
  stat,
} from "@tauri-apps/plugin-fs";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { t } from "./i18n";
import { parseAnchor, type DocAnchor } from "./anchor";
import { isDesktop } from "./env";
import { parseZoom, stateGet, stateSet } from "./store";

// 单独一个 env 模块是为了断开循环引用：store 也要判断跑在哪儿，
// 而 fs 要用 store。从这里再导出一次，上层的 import 路径一个都不用改
export { isDesktop };

export interface FileHandle {
  readonly kind: "file";
  readonly name: string;
  /**
   * 判断是不是同一个东西。浏览器原生自带，桌面版比绝对路径。
   * 参数放宽成 any 是必须的：原生签名收 FileSystemHandle，比这里宽，
   * 写死成本项目的类型会因为参数逆变而判定不兼容。
   */
  isSameEntry?(other: any): Promise<boolean>;
  getFile(): Promise<File>;
  /**
   * 磁盘现状（见文件末尾的 DiskStamp）。桌面端实现成只 stat 不读内容；
   * 浏览器句柄没有这个方法，readStamp() 会退回 getFile() 拿元数据。
   */
  stamp?(): Promise<DiskStamp>;
  createWritable(): Promise<{
    write(data: string | Blob | BufferSource): Promise<void>;
    close(): Promise<void>;
  }>;
}

export interface DirHandle {
  readonly kind: "directory";
  readonly name: string;
  /** 桌面壳下是绝对路径；浏览器句柄没有这东西，所以是可选的 */
  readonly path?: string;
  isSameEntry?(other: any): Promise<boolean>;
  values(): AsyncIterableIterator<DirHandle | FileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
}

// Windows 两种分隔符都得认：系统对话框给回来的是反斜杠，我们自己拼的是正斜杠。
const SEPARATORS = /[\\/]/;

function childPath(dir: string, name: string): string {
  return /[\\/]$/.test(dir) ? `${dir}${name}` : `${dir}/${name}`;
}

/** 从绝对路径里取最后一段，就是左栏组头要显示的文件夹名 */
function baseName(path: string): string {
  const parts = path.split(SEPARATORS).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** 桌面壳里的一个文件。拿绝对路径说话，没有授权、也不会过期 */
class DiskFile implements FileHandle {
  readonly kind = "file" as const;
  constructor(readonly path: string, readonly name: string) {}

  async isSameEntry(other: unknown): Promise<boolean> {
    return other instanceof DiskFile && other.path === this.path;
  }

  /**
   * 造一个真的 File 出来。这样上层的 readTextFromFile（编码识别）、
   * URL.createObjectURL（图片预览）、lastModified/size（搜索缓存）全部原样可用，
   * 不必为桌面端另写一套——那正是当年漏掉编码保护丢过稿的路数。
   */
  async getFile(): Promise<File> {
    const bytes = await readFile(this.path);
    let lastModified = 0;
    try {
      const info = await stat(this.path);
      lastModified = info.mtime ? info.mtime.getTime() : 0;
    } catch {
      // 拿不到修改时间不影响读内容，只是搜索缓存会多重读一次
    }
    return new File([bytes as BlobPart], this.name, { lastModified });
  }

  /** 只问元数据，不读内容——自动保存前每次都要问一遍，不能顺带把整篇读进来 */
  async stamp(): Promise<DiskStamp> {
    const info = await stat(this.path);
    return { mtime: info.mtime ? info.mtime.getTime() : 0, size: info.size ?? -1 };
  }

  async createWritable() {
    const chunks: BlobPart[] = [];
    return {
      write: async (data: string | Blob | BufferSource) => {
        chunks.push(data as BlobPart);
      },
      // 攒齐再一次落盘：中途失败就整篇不写，不留半截文件
      close: async () => {
        const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
        await writeBytes(this.path, bytes);
      },
    };
  }
}

/** 桌面壳里的一个目录 */
class DiskDir implements DirHandle {
  readonly kind = "directory" as const;
  constructor(readonly path: string, readonly name: string) {}

  async isSameEntry(other: unknown): Promise<boolean> {
    return other instanceof DiskDir && other.path === this.path;
  }

  async *values(): AsyncIterableIterator<DirHandle | FileHandle> {
    for (const entry of await readDir(this.path)) {
      const full = childPath(this.path, entry.name);
      yield entry.isDirectory ? new DiskDir(full, entry.name) : new DiskFile(full, entry.name);
    }
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle> {
    const full = childPath(this.path, name);
    if (!(await exists(full))) {
      if (!options?.create) throw new Error(t().fsError.dirNotFound(full));
      await mkdir(full, { recursive: true });
    }
    return new DiskDir(full, name);
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle> {
    const full = childPath(this.path, name);
    if (!(await exists(full))) {
      if (!options?.create) throw new Error(t().fsError.fileNotFound(full));
      await writeBytes(full, new Uint8Array());
    }
    return new DiskFile(full, name);
  }
}

/** 操作系统把一个 .md 文件路径传进来时（双击、右键「打开方式」、命令行）用这个造句柄 */
export function fileHandleFromPath(path: string): FileHandle {
  return new DiskFile(path, baseName(path));
}

/**
 * 一篇散篇所在的目录。单独拆成纯函数是为了把 Windows 盘符、UNC 与正反斜杠测清楚；
 * 算错的话，双击打开的稿子会去错误目录找相对图片。
 */
export function parentPathOf(path: string): string | null {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const slash = normalized.lastIndexOf("/");
  if (slash < 0) return null;
  if (slash === 0) return "/";
  const parent = normalized.slice(0, slash);
  // `C:` 不是一个可直接读的绝对目录，盘符根必须保留斜杠。
  return /^[a-z]:$/i.test(parent) ? `${parent}/` : parent;
}

/**
 * 桌面版单开一篇时，用它的父目录作为只读图片上下文。
 * 不把目录挂进左栏，也不改变「打开单篇」的产品含义；浏览器句柄拿不到绝对路径，返回 null。
 */
export function containingDirOf(handle: FileHandle): DirHandle | null {
  if (!(handle instanceof DiskFile)) return null;
  const path = parentPathOf(handle.path);
  return path ? new DiskDir(path, baseName(path)) : null;
}

/** 选文件夹。返回 null = 用户自己取消了，不是错误 */
export async function pickDirectory(): Promise<DirHandle | null> {
  if (isDesktop) {
    const picked = await openDialog({ directory: true, multiple: false });
    return typeof picked === "string" ? new DiskDir(picked, baseName(picked)) : null;
  }
  const picker = window.showDirectoryPicker;
  if (typeof picker !== "function") throw new Error("NO_PICKER");
  return await picker({ mode: "readwrite" });
}

/** 选单篇 .md。返回 null = 用户自己取消了 */
export async function pickFile(): Promise<FileHandle | null> {
  if (isDesktop) {
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    return typeof picked === "string" ? new DiskFile(picked, baseName(picked)) : null;
  }
  const picker = window.showOpenFilePicker;
  if (typeof picker !== "function") throw new Error("NO_PICKER");
  const [handle] = await picker({
    types: [{ description: "Markdown", accept: { "text/markdown": [".md", ".markdown"] } }],
    multiple: false,
  });
  return handle ?? null;
}

/**
 * 把内容存成一个新文件，用户自己选路径。
 * 浏览器版靠 <a download> 骗浏览器的下载管理器；Tauri 的 WebView2 没有独立下载管理器，
 * 这套把戏在桌面壳里会静默失败——点了没反应、不报错也不提示。桌面壳必须走原生保存对话框 + 真实写盘。
 */
export async function saveAs(
  filename: string,
  data: string | Blob,
  filters: { name: string; extensions: string[] }[],
): Promise<void> {
  if (isDesktop) {
    const path = await saveDialog({ defaultPath: filename, filters });
    if (!path) return; // 用户自己取消
    const bytes =
      typeof data === "string"
        ? new TextEncoder().encode(data)
        : new Uint8Array(await data.arrayBuffer());
    await writeBytes(path, bytes);
    return;
  }
  const blob = typeof data === "string" ? new Blob([data]) : data;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  // 要在文档里才保证触发（Firefox 硬性要求）
  document.body.append(link);
  link.click();
  link.remove();
  // 千万别在这里同步 revoke：下载还没来得及读这个地址就被撤销，
  // 结果是文件名退化成一串 UUID、下下来也打不开。
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const ROOT_KEY = "root";
const ROOTS_KEY = "roots";
const LAST_FILE_KEY = "last-file";
const POSITIONS_KEY = "positions";

/**
 * 记住打开过的文件夹，重开时取回。存的是数组——可以同时开多个。
 *
 * 两套存法不一样：浏览器句柄本身可结构化克隆，直接塞进 IndexedDB；
 * 桌面版存的是 DiskDir 实例，带着方法存不进配置文件（也存不进 IndexedDB，
 * 会被拍平成普通对象），所以只存绝对路径，取回时重建。
 * 这也正是桌面版能真正「记住」的原因——路径不会像浏览器授权那样关掉程序就失效。
 */
export function rememberRoots(handles: DirHandle[]): Promise<void> {
  if (isDesktop) {
    const paths = handles
      .map((handle) => (handle instanceof DiskDir ? handle.path : null))
      .filter((path): path is string => path !== null);
    return stateSet(ROOTS_KEY, paths);
  }
  return stateSet(ROOTS_KEY, handles);
}

export async function recallRoots(): Promise<DirHandle[]> {
  if (isDesktop) {
    const stored = await stateGet<unknown>(ROOTS_KEY);
    const paths = Array.isArray(stored)
      ? stored.filter((item): item is string => typeof item === "string")
      : [];
    const alive: DirHandle[] = [];
    for (const path of paths) {
      // 文件夹可能已经被挪走、删掉或在移动硬盘上，跳过它，别让整个恢复流程崩掉
      try {
        if (await exists(path)) alive.push(new DiskDir(path, baseName(path)));
      } catch {
        // 读不到就当它不在
      }
    }
    return alive;
  }
  const list = await stateGet<DirHandle[]>(ROOTS_KEY);
  if (Array.isArray(list)) return list;
  // 旧版本只存一个句柄。读回来接着用，别让已经在用的人开一次就发现工作区没了
  const single = await stateGet<DirHandle>(ROOT_KEY);
  return single ? [single] : [];
}

/**
 * 上次打开的那篇。有两种，靠 kind 分：
 * - space：属于某个工作区的一篇，记「第几个工作区」+ 相对该工作区的路径
 * - loose：不属于任何工作区的散篇（顶栏「打开单篇」、拖进来、双击 .md），记绝对路径
 *
 * 散篇为什么只能记绝对路径：它没有工作区可挂靠，index 无从谈起。
 * 也因此只有桌面壳存得住——浏览器句柄关掉标签页授权就失效，记了也开不回来。
 */
export type LastFile =
  | { kind: "space"; index: number; path: string }
  | { kind: "loose"; path: string };

export function rememberLastFile(last: LastFile): Promise<void> {
  return stateSet(LAST_FILE_KEY, last);
}

/**
 * 把存着的东西认成 LastFile。单独拆出来是为了能测——
 * 真正容易出错的是「认不认得老格式」，而那跟存在哪儿无关。
 *
 * 两种老格式都得认，否则老用户升上来会发现「上次那篇」没了：
 * 最早只存一个路径字符串；后来是没有 kind 字段的 { index, path }。
 * 认不出来一律给 null——回到欢迎页，总好过拿一个半残的记录去开文件。
 */
export function parseLastFile(value: unknown): LastFile | null {
  if (typeof value === "string") return value ? { kind: "space", index: 0, path: value } : null;
  if (!value || typeof value !== "object") return null;
  const raw = value as { kind?: unknown; index?: unknown; path?: unknown };
  if (typeof raw.path !== "string" || raw.path === "") return null;
  if (raw.kind === "loose") return { kind: "loose", path: raw.path };
  return { kind: "space", index: typeof raw.index === "number" ? raw.index : 0, path: raw.path };
}

export async function recallLastFile(): Promise<LastFile | null> {
  return parseLastFile(await stateGet<unknown>(LAST_FILE_KEY));
}

// ---------- 每篇上次读到哪 ----------
//
// 记的是内容锚点（见 anchor.ts），不是像素也不是全局字符数——
// 那两样在「AI 从外面改了文件」之后全废，而那正是 Sheaf 的主场景。

export interface FilePosition {
  /** 上次滚到哪 */
  scroll: DocAnchor | null;
  /** 上次光标停在哪 */
  cursor: DocAnchor | null;
  /** 记下的时刻，用来淘汰最老的 */
  at: number;
}

export type PositionMap = Record<string, FilePosition>;

/** 最多记这么多篇，超了淘汰最久没碰的。不封顶的话这张表会越用越大 */
export const POSITION_CAP = 200;

/**
 * 一篇稿子在这张表里的键。
 * 工作区里的篇按「工作区序号 + 相对路径」，散篇按绝对路径——跟 LastFile 两种 kind 对齐。
 * 散篇的路径要归一化：同一个文件被系统用不同大小写报回来时，不能记成两条。
 */
export function positionKey(last: LastFile): string {
  return last.kind === "loose"
    ? `loose:${normalizePath(last.path)}`
    : `space:${last.index}:${last.path}`;
}

/** 认不出来的一律丢掉——拿半残的记录去跳位置，比不跳更糟 */
export function parsePositions(value: unknown): PositionMap {
  if (!value || typeof value !== "object") return {};
  const out: PositionMap = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const scroll = parseAnchor(raw.scroll);
    const cursor = parseAnchor(raw.cursor);
    if (!scroll && !cursor) continue;
    out[key] = { scroll, cursor, at: typeof raw.at === "number" ? raw.at : 0 };
  }
  return out;
}

/** 超过上限就把最久没碰的丢掉，留下最近的 cap 条 */
export function trimPositions(map: PositionMap, cap: number = POSITION_CAP): PositionMap {
  const keys = Object.keys(map);
  if (keys.length <= cap) return map;
  const kept = keys
    .sort((a, b) => (map[b].at ?? 0) - (map[a].at ?? 0))
    .slice(0, cap);
  const out: PositionMap = {};
  for (const key of kept) out[key] = map[key];
  return out;
}

export async function recallPositions(): Promise<PositionMap> {
  return parsePositions(await stateGet<unknown>(POSITIONS_KEY));
}

/**
 * 记住某一篇的位置。存不进去（隐私模式、配额满、磁盘写不动）不该影响正在写的东西，
 * 所以吞掉错误——大不了下次开这篇回到开头。
 */
export async function rememberPosition(key: string, position: FilePosition): Promise<void> {
  try {
    const all = await recallPositions();
    all[key] = position;
    await stateSet(POSITIONS_KEY, trimPositions(all));
  } catch (error) {
    console.warn("[Sheaf] 记不住阅读位置", error);
  }
}

// ---------- 正文缩放到多大 ----------
//
// WebView2 的缩放是运行期属性，关掉重开一律回到 100%，它自己不记。
// 只有桌面壳需要这个：浏览器里 Ctrl+ +/- 是浏览器自己的事，我们不该插手。

const ZOOM_KEY = "zoom";

export async function recallZoom(): Promise<number | null> {
  if (!isDesktop) return null;
  try {
    return parseZoom(await stateGet<unknown>(ZOOM_KEY));
  } catch (error) {
    console.warn("[Sheaf] 读不出缩放比例", error);
    return null;
  }
}

/** 记不住缩放比例是小事，绝不能因此打断正在写的东西 */
export async function rememberZoom(factor: number): Promise<void> {
  if (!isDesktop) return;
  const value = parseZoom(factor);
  if (value === null) return;
  try {
    await stateSet(ZOOM_KEY, value);
  } catch (error) {
    console.warn("[Sheaf] 记不住缩放比例", error);
  }
}

/**
 * 这个散篇句柄记得住吗——记得住就返回它的绝对路径。
 * 只有桌面壳造的句柄有路径；浏览器句柄返回 null，调用方据此跳过记忆。
 */
export function loosePathOf(handle: FileHandle): string | null {
  return handle instanceof DiskFile ? handle.path : null;
}

/**
 * 恢复散篇用：路径还指着一个真文件，才给句柄。
 * 文件被删了、挪走了、在拔掉的移动硬盘上，就当没记过——
 * 启动时甩一句「打开失败」，用户既修不了也不想看。
 */
export async function fileHandleIfExists(path: string): Promise<FileHandle | null> {
  if (!isDesktop) return null;
  try {
    return (await exists(path)) ? new DiskFile(path, baseName(path)) : null;
  } catch {
    return null;
  }
}

/**
 * 把一篇稿子挪进系统回收站。**不是永久删除**。
 *
 * 走的是 src-tauri 里自己开的 `move_to_trash` 命令，不是 `@tauri-apps/plugin-fs`
 * 的 `remove()`——那个只能永久删，删完连回收站里都没有。因为不经 fs 插件，
 * `capabilities/default.json` 一个字都不用改。
 *
 * 浏览器模式直接拒绝：那边没有回收站，能做的只有永久删，而这个函数承诺的是可还原。
 * 左栏的删除入口本来也只在桌面壳出现，这里是第二道闸。
 */
export async function moveToTrash(path: string): Promise<void> {
  if (!isDesktop) throw new Error("TRASH_UNAVAILABLE");
  await invoke("move_to_trash", { path });
}

/**
 * 把刚扔进回收站的那个文件捞回原处。给「删错了按 Ctrl+Z」用。
 *
 * **Windows / Linux 独有**：列举和还原回收站的能力 macOS 那边没有
 * （`trash` crate 的 `os_limited` 模块自己就是这么划的）。打 mac 包时这条一定失败，
 * 撤销入口届时要跟着收掉——见 ROADMAP 第 9 条。
 *
 * 还原不成的情形都是真事：文件已被人从回收站清掉、原位置又出现了同名文件、
 * 回收站被禁用。一律抛出去让调用方提示用户，**绝不静默当成功**——
 * 那会让人以为文件回来了，过一会儿才发现没有。
 */
export async function restoreFromTrash(originalPath: string): Promise<void> {
  if (!isDesktop) throw new Error("TRASH_UNAVAILABLE");
  await invoke("restore_from_trash", { originalPath });
}

/**
 * `abs` 落在 `root` 里面就返回相对路径，否则 null。用来判断一个绝对路径
 * 到底是「某个工作区里的一篇」还是真散篇——判错的后果不是不高亮那么轻：
 * 误判成散篇，spaceId 和相对路径都会留空，那篇里所有相对路径的图会全变裂图。
 *
 * 两种分隔符都得认（系统对话框和双击给回来的是反斜杠，扫树时拼的是正斜杠）；
 * Windows 盘符和目录名不区分大小写，所以只拿小写去比，**返回的仍是原样大小写**
 * 的相对路径——findFile 要拿它跟扫树时记下的 path 逐字比对。
 *
 * 必须卡在分隔符上：`D:/note` 不能把 `D:/notebook/a.md` 认成自己的。
 */
export function relativePathInside(root: string, abs: string): string | null {
  const r = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const f = abs.replace(/\\/g, "/");
  if (r === "") return null;
  if (!f.toLowerCase().startsWith(`${r.toLowerCase()}/`)) return null;
  const rel = f.slice(r.length + 1);
  return rel === "" ? null : rel;
}

/**
 * 把一个绝对路径压成能拿来比对的样子：反斜杠换成正斜杠、去掉结尾斜杠、全小写。
 * Windows 上同一个文件能有好几种写法（`D:\a\B.md`、`d:/a/b.md`），
 * 逐字比会把同一个文件当成两个——监听那边一旦比错，外部改动就同步不过来。
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** 两个路径指的是不是同一个文件 */
export function samePath(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return normalizePath(a) === normalizePath(b);
}

/**
 * 监听回调报来的这一批路径里，有没有碰到我们正开着的那篇。
 *
 * 为什么连「碰到」都要单独成一个函数：AI 工具改文件常用「先写一份临时文件、
 * 再把它改名盖掉原来那份」，这一串动作报上来的路径里，原文件名可能出现在
 * 任意一条事件上（rename 的 from/to 都算）。只要这批里出现过它，就该去看一眼。
 */
export function hitsWatchedFile(eventPaths: string[], target: string | null): boolean {
  if (!target) return false;
  return eventPaths.some((path) => samePath(path, target));
}

/**
 * 这个路径的变动会不会改变左栏的长相。
 *
 * 单独成一个函数是因为它挡的是一笔真实开销：AI 落盘路上会甩出临时文件
 * （`稿子.md.tmp`）和插图（`images/x.png`），每一个都触发一次全目录递归重扫的话，
 * AI 连着写十个文件就是十次扫盘。左栏本来也只列 `.md`。
 *
 * 目录要算进来——新建/删除文件夹得反映到左栏，而目录名没有扩展名。
 * 判「没有扩展名就是目录」会把 `LICENSE` 这类无扩展名文件也算进来，
 * 代价只是多扫一次；反过来漏判目录，用户新建的文件夹就不出现，那才是 bug。
 */
export function affectsTree(path: string): boolean {
  const name = path.replace(/\\/g, "/").split("/").pop() ?? "";
  if (/\.(md|markdown)$/i.test(name)) return true;
  return name !== "" && !name.includes(".");
}

// AI 流式落盘时，一秒能写好几次。每落一次就整篇重渲染一次，画面就是在抖
// （2026-08-25 真机实测：7 秒内触发约 46 次重载，肉眼可见连续闪动）。
//
// 光把「攒多久再处理」的窗口调大治不了本：真实写入间隔不固定，窗口调多大都能被绕过。
// 靠谱的判据是磁盘自己——**连续安静一小会儿**才算这一轮写完。
// 副作用还是好的：AI 写到一半的内容本来也不该给人看。

/** 磁盘连续这么久没再变，就算这一轮写完了 */
export const SETTLE_QUIET_MS = 250;
/** 兜底上限：对面一直写个不停，也不能让用户永远看着旧内容 */
export const SETTLE_MAX_MS = 5000;

/**
 * 已经等了 elapsedMs 还在等磁盘安静，现在该继续等还是直接显示。
 * 跟 missingStep 同构：判定拆出来单独测，等待本身留在调用方。
 */
export function settleStep(elapsedMs: number): { verdict: "wait" | "go"; waitMs: number } {
  if (elapsedMs >= SETTLE_MAX_MS) return { verdict: "go", waitMs: 0 };
  // 最后一次别睡过头，正好停在上限
  return { verdict: "wait", waitMs: Math.min(SETTLE_QUIET_MS, SETTLE_MAX_MS - elapsedMs) };
}

// 文件忽然 stat 不到了，不代表它真没了——「写临时文件再改名」那一瞬间有个真实空窗：
// 旧的已经拿走、新的还没放上。这时候下结论就会把用户正开着的稿子判成「文件没了」，
// 是这个功能最容易翻车的地方。所以看不见时先等一等，等够了才认。

/** 最多等这么久再下结论 */
export const MISSING_GRACE_MS = 2000;
/** 等待期间每隔这么久回头看一眼 */
export const MISSING_RETRY_MS = 400;

/**
 * 已经等了 elapsedMs 毫秒还是看不见文件，现在该怎么办。
 * 判错的后果是「用户的稿子看起来凭空消失」，所以拆成纯函数单独测。
 */
export function missingStep(elapsedMs: number): {
  verdict: "wait" | "gone";
  retryInMs: number;
} {
  if (elapsedMs >= MISSING_GRACE_MS) return { verdict: "gone", retryInMs: 0 };
  // 最后一次别睡过头，正好停在宽限期末尾
  const retryInMs = Math.min(MISSING_RETRY_MS, MISSING_GRACE_MS - elapsedMs);
  return { verdict: "wait", retryInMs };
}

/**
 * 浏览器里取回的句柄权限通常回落到 prompt，必须重新确认。
 * request=true 时会弹窗，因此只能在用户手势里调用。
 */
export async function ensurePermission(
  handle: DirHandle | FileHandle,
  request: boolean,
): Promise<boolean> {
  // 桌面壳握的是绝对路径，本来就有权限，也不存在关掉程序就失效
  if (isDesktop) return true;
  const native = handle as unknown as FileSystemHandle;
  const query = native.queryPermission?.bind(native);
  if (!query) return true;
  if ((await query({ mode: "readwrite" })) === "granted") return true;
  const ask = native.requestPermission?.bind(native);
  if (!request || !ask) return false;
  return (await ask({ mode: "readwrite" })) === "granted";
}

export interface FileNode {
  kind: "file";
  name: string;
  /** 相对根目录的路径，如「稿件/草稿.md」 */
  path: string;
  handle: FileHandle;
}

export interface DirNode {
  kind: "dir";
  name: string;
  path: string;
  handle: DirHandle;
  children: TreeNode[];
}

export type TreeNode = FileNode | DirNode;

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "target", "__pycache__"]);
const MAX_DEPTH = 5;

function isMarkdown(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

function hasMarkdown(node: DirNode): boolean {
  return node.children.some((child) => child.kind === "file" || hasMarkdown(child));
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

/** 只收 .md，空目录不进树 */
export async function scanTree(
  dir: DirHandle,
  path = "",
  depth = 0,
): Promise<DirNode> {
  const children: TreeNode[] = [];
  if (depth < MAX_DEPTH) {
    // 单个子目录读不动（权限、被删、坏链接）不该让整棵树消失，跳过它继续扫
    try {
      for await (const entry of dir.values()) {
        if (entry.name.startsWith(".")) continue;
        const childPath = path ? `${path}/${entry.name}` : entry.name;
        if (entry.kind === "directory") {
          if (SKIP_DIRS.has(entry.name)) continue;
          try {
            const sub = await scanTree(entry as DirHandle, childPath, depth + 1);
            if (hasMarkdown(sub)) children.push(sub);
          } catch (error) {
            console.warn(`[Sheaf] 跳过读不动的目录 ${childPath}`, error);
          }
        } else if (isMarkdown(entry.name)) {
          children.push({
            kind: "file",
            name: entry.name,
            path: childPath,
            handle: entry as FileHandle,
          });
        }
      }
    } catch (error) {
      // 根目录本身就读不动时要让调用方知道，不能假装扫出一棵空树
      if (depth === 0) throw error;
      console.warn(`[Sheaf] 目录 ${path} 读到一半失败`, error);
    }
  }
  return {
    kind: "dir",
    name: dir.name,
    path,
    handle: dir,
    children: sortNodes(children),
  };
}

export function findFile(node: DirNode, path: string): FileNode | null {
  for (const child of node.children) {
    if (child.kind === "file") {
      if (child.path === path) return child;
    } else {
      const hit = findFile(child, path);
      if (hit) return hit;
    }
  }
  return null;
}

export function firstFile(node: DirNode): FileNode | null {
  for (const child of node.children) {
    if (child.kind === "file") return child;
    const hit = firstFile(child);
    if (hit) return hit;
  }
  return null;
}

/** 把整棵树按左栏里看到的先后顺序摊平成一列文件。目录本身不进列表——它不可打开 */
export function flattenFiles(node: DirNode): FileNode[] {
  const out: FileNode[] = [];
  for (const child of node.children) {
    if (child.kind === "file") out.push(child);
    else out.push(...flattenFiles(child));
  }
  return out;
}

/**
 * 删掉 `path` 这一篇之后，该把哪一篇顶上来。
 *
 * **传进来的树必须是删除之前的那棵**——判据是「它原来排在谁后面」，
 * 重扫之后那一篇已经不在了，无从谈起。所以顺序是：先算好接班的是谁，再删、再重扫。
 *
 * 取「下一篇」而不是「上一篇」：连着删几篇时，光标跟着往下走，
 * 手不用动就能接着删；取上一篇的话每删一次都在往回跳。
 * 排到最后一篇了才回头取上一篇；整个工作区被删空就返回 null，由调用方清空画布。
 *
 * 按摊平后的全局顺序找，不限定同一个目录：目录里最后一篇删掉后，
 * 下一个自然是下个目录的第一篇——跟左栏里眼睛看到的顺序一致。
 */
export function nextAfterDelete(tree: DirNode, path: string): FileNode | null {
  const files = flattenFiles(tree);
  const at = files.findIndex((file) => file.path === path);
  // 压根不在这棵树里：不该发生，但真发生了也不能瞎顶一篇上来
  if (at < 0) return null;
  return files[at + 1] ?? files[at - 1] ?? null;
}

export type TextEncoding = "utf-8" | "utf-8-bom" | "utf-16le" | "utf-16be" | "legacy";

export interface LoadedText {
  text: string;
  encoding: TextEncoding;
  /** false = 这份内容写回去就会改变文件编码，不能自动保存 */
  writable: boolean;
}

/**
 * File.text() 一律按 UTF-8 解码，非法字节静默变成 U+FFFD，既不报错也没有失败信号。
 * 拿这份乱码去自动保存，磁盘上的原文当场被覆盖——所以必须先认编码，认不出就不许写回去。
 */
export async function readTextFromFile(file: File): Promise<LoadedText> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return {
      text: new TextDecoder("utf-8").decode(bytes.subarray(3)),
      encoding: "utf-8-bom",
      writable: true,
    };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {
      text: new TextDecoder("utf-16le").decode(bytes.subarray(2)),
      encoding: "utf-16le",
      writable: false,
    };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return {
      text: new TextDecoder("utf-16be").decode(bytes.subarray(2)),
      encoding: "utf-16be",
      writable: false,
    };
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
      writable: true,
    };
  } catch {
    // 不是合法 UTF-8。中文环境下多半是 GBK/GB18030，能显示出来，但浏览器只能编码回 UTF-8，
    // 所以这篇只读——宁可不让写，也不能把人家的原文换掉编码。
    return {
      text: new TextDecoder("gb18030").decode(bytes),
      encoding: "legacy",
      writable: false,
    };
  }
}

export async function readText(handle: FileHandle): Promise<LoadedText> {
  return readTextFromFile(await handle.getFile());
}

export async function writeFile(
  handle: FileHandle,
  data: string | Blob,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(data);
  await writable.close();
}

/** 顺着相对路径逐级取目录；create=true 时不存在就建 */
export async function resolveDir(
  root: DirHandle,
  segments: string[],
  create = false,
): Promise<DirHandle | null> {
  let dir = root;
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    try {
      dir = await dir.getDirectoryHandle(segment, { create });
    } catch {
      return null;
    }
  }
  return dir;
}

export async function resolveFile(
  root: DirHandle,
  path: string,
  create = false,
): Promise<FileHandle | null> {
  const segments = path.split("/").filter((part) => part && part !== ".");
  const name = segments.pop();
  if (!name) return null;
  const dir = await resolveDir(root, segments, create);
  if (!dir) return null;
  try {
    return await dir.getFileHandle(name, { create });
  } catch {
    return null;
  }
}

/** 目录里已有同名文件就加数字后缀，绝不覆盖 */
export async function uniqueName(
  dir: DirHandle,
  name: string,
): Promise<string> {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let candidate = name;
  for (let i = 2; i < 500; i += 1) {
    try {
      await dir.getFileHandle(candidate);
    } catch {
      return candidate;
    }
    candidate = `${stem}-${i}${ext}`;
  }
  return `${stem}-${Date.now()}${ext}`;
}

// ---------- 外部改动识别 ----------
//
// 「Sheaf 开着旧内容 → 外部把文件改了 → 自动保存把外部改动整个盖掉」是丢稿级路径。
// 堵它需要一个能回答「磁盘上这篇还是不是我们上次看到的那份」的凭据。
// 用 mtime + 字节数两个维度：mtime 是主信号，size 兜住「同一毫秒内改完、时间戳撞上」的漏网。

export interface DiskStamp {
  /** 最后修改时间（毫秒）。0 = 拿不到 */
  mtime: number;
  /** 字节数。-1 = 拿不到 */
  size: number;
}

/** 读不出磁盘状态时用它，语义是「无从判断」，不是「没变过」 */
export const UNKNOWN_STAMP: DiskStamp = { mtime: 0, size: -1 };

function isUnknown(stamp: DiskStamp): boolean {
  return stamp.mtime === 0 && stamp.size < 0;
}

/**
 * 磁盘上这篇是不是已经不是我们上次看到的那一份。
 *
 * mtime 用不等号而不是大于号：外部工具完全可能写回一个更旧的时间戳
 * （从备份还原、同步盘拉回旧版都是这样），那同样是「不是我们那份」。
 *
 * 任一侧读不出来就一律当没变——宁可漏报一次，也不能因为拿不到时间戳
 * 就让用户从此存不了盘。存不了盘比盖掉外部改动更糟。
 */
export function stampChanged(recorded: DiskStamp, disk: DiskStamp): boolean {
  if (isUnknown(recorded) || isUnknown(disk)) return false;
  return recorded.mtime !== disk.mtime || recorded.size !== disk.size;
}

/**
 * 取磁盘现状。桌面端走 stat，不读文件内容；
 * 浏览器端 getFile() 只拿元数据，同样不读内容，两边都便宜。
 */
export async function readStamp(handle: FileHandle | null): Promise<DiskStamp> {
  if (!handle) return UNKNOWN_STAMP;
  try {
    if (handle.stamp) return await handle.stamp();
    const file = await handle.getFile();
    return { mtime: file.lastModified, size: file.size };
  } catch {
    // 文件被删掉、权限没了都会走到这里。当作无从判断，由上层各自处理
    return UNKNOWN_STAMP;
  }
}
