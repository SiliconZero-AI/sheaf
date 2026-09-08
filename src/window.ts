// 多窗口。同时开好几个 Sheaf 窗口，各写各的，能并排摆。
//
// 为什么是「多窗口」而不是「标签页」：标签页一次仍然只显示一篇，解决不了
// 「两篇并排对照着改」；而且只有独立的操作系统窗口才能跟 Chrome、Word 并排。
//
// 实现上刻意选了最省事的一条路——每个窗口加载的是同一个 index.html，
// 靠 URL 参数告诉它「你该开哪篇」。窗口之间不通信、不共享内存，
// 各自跑一份完整的前端状态。唯一的公共资源是 state.json，那部分的并发在 store.ts 处理。

import { isDesktop } from "./env";

/**
 * 主窗口的 label。tauri.conf.json 里那个窗口没写 label，Tauri 默认给 "main"；
 * capabilities/default.json 和 Rust 那边的 get_webview_window 都按这个名字找它。
 * 改名要三处一起改。
 */
export const MAIN_LABEL = "main";

/**
 * 文档窗口 label 的前缀。capabilities/default.json 里授权的是 `doc-*`，
 * **改这个前缀必须同时改那份权限清单**——不匹配的话新窗口一个 API 都调不了
 * （读不了文件、存不了盘），而且不会报权限错，只会表现成「新窗口是个死的」。
 */
const DOC_PREFIX = "doc-";

/** 打开一篇具体稿子的窗口：前缀 + f + 路径指纹 */
const BY_FILE = `${DOC_PREFIX}f`;
/** 空白新窗口：前缀 + n + 时间戳。跟 BY_FILE 用不同字母隔开，两者永不撞车 */
const BY_NEW = `${DOC_PREFIX}n`;

/**
 * 路径规范化。Windows 路径不分大小写、两种分隔符都可能出现，
 * 同一个文件被不同来源（命令行参数 / 文件树扫描 / 拖放）报回来时字面并不相同。
 *
 * 跟 fs.ts 的 normalizePath 与 Rust 那边 restore_from_trash 的 normalize 是同一套规矩，
 * 三处必须一致——不一致的话「这篇是不是已经开着了」会答错，同一篇就被开出两个窗口，
 * 而两个窗口编辑同一个文件正是最容易互相覆盖的场景。
 */
export function normalizeWindowPath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

/**
 * 从文件路径算窗口 label。
 *
 * Tauri 规定 label 只能含字母数字和 `-` `/` `:` `_`，中文路径直接塞进去是非法的，
 * 所以这里不追求「label 可读」，只要「同一个路径永远算出同一个 label」。
 * 这正是「同一篇不开第二个窗口」的实现方式：不用维护一张已开窗口表，
 * 问一句 getByLabel(labelForPath(p)) 就知道它开没开。
 *
 * FNV-1a 32 位。选它不因为它抗碰撞（这里不需要密码学强度），而是因为它够短、
 * 实现只有四行、不依赖任何库。同时开着的窗口最多几十个，32 位绰绰有余；
 * 真撞上了的后果也只是「点开第二篇却跳到了第一篇」，不会丢数据。
 */
export function labelForPath(path: string): string {
  const text = normalizeWindowPath(path);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    // >>> 0 保住无符号：JS 位运算结果是有符号 32 位，不转会算出负数，
    // toString(36) 出来就带个减号，而 `-` 虽然是合法 label 字符，却会让指纹长得不一致
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${BY_FILE}${hash.toString(36)}`;
}

/** 这个 label 是不是主窗口 */
export function isMainLabel(label: string): boolean {
  return label === MAIN_LABEL;
}

/** 新开一个空白窗口时用的 label。同一毫秒连开两个也不撞：后面补一段随机 */
export function newBlankLabel(now: number = Date.now()): string {
  const salt = Math.floor(Math.random() * 36 ** 4).toString(36);
  return `${BY_NEW}${now.toString(36)}-${salt}`;
}

/** 新窗口要开的东西，从 URL 参数里读出来的样子 */
export interface OpenTarget {
  /** 指名要打开的那一篇（绝对路径）。null = 没指名 */
  path: string | null;
  /**
   * 空白窗口：照常恢复挂着的文件夹，但**不要**自动打开「上次那篇」。
   * 不加这条的话，Ctrl+Shift+N 开出来的窗口会跟主窗口开着同一篇，
   * 两个窗口编辑同一个文件——正是这批要避免的事。
   */
  blank: boolean;
}

/**
 * 解析 index.html 后面跟的参数。任何畸形输入都当「没指名」处理，
 * 绝不抛——这个函数跑在 boot() 的第一段，抛出去就是窗口开不起来。
 */
export function parseOpenTarget(search: string): OpenTarget {
  try {
    const params = new URLSearchParams(search);
    const path = params.get("open");
    return {
      path: path && path.trim() !== "" ? path : null,
      blank: params.get("blank") === "1",
    };
  } catch {
    return { path: null, blank: false };
  }
}

/** 拼新窗口要加载的地址。路径里有中文、空格、`&`，必须编码 */
export function buildWindowUrl(target: OpenTarget): string {
  const params = new URLSearchParams();
  if (target.path) params.set("open", target.path);
  if (target.blank) params.set("blank", "1");
  const query = params.toString();
  return query ? `index.html?${query}` : "index.html";
}

/**
 * 新窗口摆在哪。跟当前窗口错开一点，不然新窗口正好压在旧的上面，
 * 用户会以为「没反应」——而这个功能的全部意义就是同时看见两个窗口。
 *
 * 每多开一个再多错开一档，并且到第 8 档回头，免得一直往右下走出屏幕。
 */
export const CASCADE_STEP = 36;
export function cascadeFrom(x: number, y: number, depth: number): { x: number; y: number } {
  const step = CASCADE_STEP * ((depth % 8) + 1);
  return { x: Math.max(0, Math.round(x + step)), y: Math.max(0, Math.round(y + step)) };
}

// ---------- 真正去开窗口（只在桌面壳成立） ----------

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** 本窗口的 label。浏览器里没有窗口这个概念，一律当主窗口 */
export function currentLabel(): string {
  if (!isDesktop) return MAIN_LABEL;
  try {
    return getCurrentWindow().label;
  } catch {
    // 取不到就按主窗口办：主窗口那条路是功能最全的，退化到它不会少做事
    return MAIN_LABEL;
  }
}

/** 本窗口是不是主窗口。查更新、领冷启动参数这类「全程序只该干一次」的事按它分流 */
export function isMainWindow(): boolean {
  return isMainLabel(currentLabel());
}

/**
 * 量一下当前窗口的位置和大小，好让新窗口跟它错开、并继承尺寸。
 * 量不到就返回 null，调用方回落到「居中 + 默认尺寸」——
 * 这条路必须存在：位置摆不出来不该拦住开窗口。
 */
async function currentGeometry(): Promise<{ x: number; y: number; w: number; h: number } | null> {
  try {
    const win = getCurrentWindow();
    // 位置和大小的原始值都是物理像素，高 DPI 屏上跟逻辑像素差一个缩放倍数；
    // 而 WebviewWindow 的 x/y/width/height 收的是逻辑像素。不换算的话，
    // 在 150% 缩放的屏幕上新窗口会跑到右下角很远的地方、并且大出一圈
    const scale = await win.scaleFactor();
    const pos = (await win.outerPosition()).toLogical(scale);
    const size = (await win.innerSize()).toLogical(scale);
    return { x: pos.x, y: pos.y, w: size.width, h: size.height };
  } catch (error) {
    console.warn("[Sheaf] 量不到当前窗口的位置，新窗口用默认摆法", error);
    return null;
  }
}

/**
 * 开一个新窗口，或者把已经开着的那个提到前面来。
 *
 * 返回 true 表示「新开了一个」，false 表示「它本来就开着，只是提到前面」——
 * 调用方据此决定要不要提示。
 */
async function spawn(label: string, target: OpenTarget, title: string): Promise<boolean> {
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    // 已经开着就别开第二个。两个窗口编辑同一个文件是这批最想避免的事：
    // 两边各存各的，后存的直接盖掉先存的，而用户看不出发生了什么
    await existing.unminimize().catch(() => {});
    await existing.show().catch(() => {});
    await existing.setFocus().catch(() => {});
    return false;
  }

  const geo = await currentGeometry();
  const depth = (await getAllWebviewWindows().catch(() => [])).length;
  const spot = geo ? cascadeFrom(geo.x, geo.y, depth) : null;

  const win = new WebviewWindow(label, {
    url: buildWindowUrl(target),
    title,
    width: geo?.w ?? 1200,
    height: geo?.h ?? 800,
    minWidth: 720,
    minHeight: 480,
    ...(spot ? { x: spot.x, y: spot.y } : { center: true }),
    // 主窗口在 tauri.conf.json 里关掉了这个（拖放由前端自己接管，见 main.ts 的拖放提示层），
    // 新窗口跑的是同一份前端代码，不关的话拖 .md 进去会走系统的默认处理，行为跟主窗口不一致
    dragDropEnabled: false,
    // Ctrl+ +/- 缩放。这个开关不会从主窗口继承，每个窗口都得自己开一次——
    // 漏了的话新窗口按缩放键毫无反应，而用户不会想到这是「窗口不同」造成的
    zoomHotkeysEnabled: true,
  });

  // 建窗口是异步的，失败了要让调用方知道，不能一声不响
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    void win.once("tauri://created", () => {
      settled = true;
      resolve();
    });
    void win.once("tauri://error", (event) => {
      settled = true;
      reject(new Error(String(event.payload)));
    });
    // 兜底：两个事件一个都没来的话别把调用方永远挂住。
    // 5 秒是「慢机器上开窗口」的宽松上限，真超时了窗口多半也已经出来了，
    // 所以这里 resolve 而不是 reject——报一个假的失败比不报更糟
    window.setTimeout(() => {
      if (!settled) resolve();
    }, 5000);
  });
  return true;
}

/** 在新窗口里打开某一篇稿子。已经开着就跳过去 */
export async function openPathInNewWindow(path: string, title: string): Promise<boolean> {
  return spawn(labelForPath(path), { path, blank: false }, title);
}

/** 开一个空白的新窗口：文件夹照常恢复，但不自动打开任何一篇 */
export async function openBlankWindow(title: string): Promise<boolean> {
  return spawn(newBlankLabel(), { path: null, blank: true }, title);
}

/**
 * 找出正开着某一篇的那个窗口（如果有）。
 * 双击 .md 时用它决定该把文件送给谁——那篇已经开着的话，
 * 应该跳到那个窗口，而不是在主窗口里再开一份。
 */
export async function windowShowing(path: string): Promise<WebviewWindow | null> {
  try {
    return await WebviewWindow.getByLabel(labelForPath(path));
  } catch {
    return null;
  }
}
