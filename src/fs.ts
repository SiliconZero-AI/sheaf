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
import { t } from "./i18n";

/** 在桌面壳里跑还是在浏览器里跑。Tauri 2 会往 window 上注入 __TAURI_INTERNALS__ */
export const isDesktop =
  typeof window !== "undefined" &&
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !== undefined;

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

// 库名保持旧值：这是持久化标识，改了等于把已经授权过的文件夹记录全丢掉，
// 每个工作区都要重新授权一遍。名字换成 Sheaf 不值得让人付这个代价。
const DB_NAME = "writing-desk";
const STORE = "handles";
const ROOT_KEY = "root";
const ROOTS_KEY = "roots";
const LAST_FILE_KEY = "last-file";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/**
 * 记住打开过的文件夹，重开时取回。存的是数组——可以同时开多个。
 *
 * 两套存法不一样：浏览器句柄本身可结构化克隆，直接塞进去；
 * 桌面版存的是 DiskDir 实例，塞进 IndexedDB 会被拍平成没有方法的普通对象，
 * 所以只存绝对路径，取回时重建。这也正是桌面版能真正「记住」的原因——
 * 路径不会像浏览器授权那样关掉程序就失效。
 */
export function rememberRoots(handles: DirHandle[]): Promise<void> {
  if (isDesktop) {
    const paths = handles
      .map((handle) => (handle instanceof DiskDir ? handle.path : null))
      .filter((path): path is string => path !== null);
    return idbSet(ROOTS_KEY, paths);
  }
  return idbSet(ROOTS_KEY, handles);
}

export async function recallRoots(): Promise<DirHandle[]> {
  if (isDesktop) {
    const stored = await idbGet<unknown>(ROOTS_KEY);
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
  const list = await idbGet<DirHandle[]>(ROOTS_KEY);
  if (Array.isArray(list)) return list;
  // 旧版本只存一个句柄。读回来接着用，别让已经在用的人开一次就发现工作区没了
  const single = await idbGet<DirHandle>(ROOT_KEY);
  return single ? [single] : [];
}

/** 上次打开的那篇：记在第几个工作区里、相对该工作区的路径 */
export interface LastFile {
  index: number;
  path: string;
}

export function rememberLastFile(last: LastFile): Promise<void> {
  return idbSet(LAST_FILE_KEY, last);
}

export async function recallLastFile(): Promise<LastFile | null> {
  const value = await idbGet<LastFile | string>(LAST_FILE_KEY);
  // 旧格式只存了一个路径字符串
  if (typeof value === "string") return value ? { index: 0, path: value } : null;
  return value ?? null;
}

/**
 * 从 IndexedDB 取回的句柄权限通常回落到 prompt，必须重新确认。
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
