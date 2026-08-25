// 顺序有意义：editor 会带进 vditor 自己的 index.css，我们的样式必须排在它后面，
// 否则同名选择器（.vditor 的变量块、.vditor-reset 的表格/引用/代码）一律被它盖掉。
import { applyEditorTheme, createEditor } from "./editor";
import "./styles.css";
import { FileTree } from "./tree";
import { Outline, type Heading } from "./outline";
import { Search } from "./search";
import { EmojiPicker } from "./emoji";
import { GlobalSearch } from "./global-search";
import { TableToolbar } from "./table-toolbar";
import { HelpPanel } from "./help";
import { currentTheme, setupTheme } from "./theme";
import { ImageStore, safeAlt } from "./images";
import { applyStaticI18n, currentLang, onLangChange, t } from "./i18n";
import { setupLang } from "./lang";
import type Vditor from "vditor";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ensurePermission,
  findFile,
  firstFile,
  readText,
  readTextFromFile,
  recallLastFile,
  recallRoots,
  rememberLastFile,
  rememberRoots,
  scanTree,
  uniqueName,
  writeFile,
  type DirNode,
  type FileNode,
  type TextEncoding,
  isDesktop,
  pickDirectory as chooseDirectory,
  pickFile as chooseFile,
  saveAs,
  fileHandleFromPath,
  readStamp,
  stampChanged,
  UNKNOWN_STAMP,
  type DiskStamp,
  type DirHandle,
  type FileHandle,
} from "./fs";

function need<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`页面骨架缺少 ${selector}`);
  return el;
}

const dom = {
  canvas: need<HTMLElement>(".canvas"),
  editor: need<HTMLDivElement>("#editor"),
  dropzone: need<HTMLDivElement>("#dropzone"),
  toolbarSlot: need<HTMLDivElement>("#toolbar-slot"),
  body: need<HTMLDivElement>("#body"),
  tree: need<HTMLDivElement>("#tree"),
  outline: need<HTMLDivElement>("#outline"),
  openDir: need<HTMLButtonElement>("#btn-open-dir"),
  openBtn: need<HTMLButtonElement>("#btn-open"),
  openMenu: need<HTMLDivElement>("#open-menu"),
  newFile: need<HTMLButtonElement>("#btn-new"),
  saveBtn: need<HTMLButtonElement>("#btn-save"),
  exportBtn: need<HTMLButtonElement>("#btn-export"),
  exportMenu: need<HTMLDivElement>("#export-menu"),
  toggleLeft: need<HTMLButtonElement>("#btn-toggle-left"),
  toggleRight: need<HTMLButtonElement>("#btn-toggle-right"),
  theme: need<HTMLButtonElement>("#btn-theme"),
  lang: need<HTMLButtonElement>("#btn-lang"),
  fileLabel: need<HTMLSpanElement>("#file-label"),
  saveLabel: need<HTMLSpanElement>("#save-label"),
  hintLabel: need<HTMLSpanElement>("#hint-label"),
  countLabel: need<HTMLSpanElement>("#count-label"),
  searchBar: need<HTMLDivElement>("#search-bar"),
  searchInput: need<HTMLInputElement>("#search-input"),
  searchCount: need<HTMLSpanElement>("#search-count"),
  searchPrev: need<HTMLButtonElement>("#search-prev"),
  searchNext: need<HTMLButtonElement>("#search-next"),
  searchClose: need<HTMLButtonElement>("#search-close"),
  imageInput: need<HTMLInputElement>("#image-file"),
  fileInput: need<HTMLInputElement>("#file-input"),
  gsPanel: need<HTMLDivElement>("#gs-panel"),
  gsInput: need<HTMLInputElement>("#gs-input"),
  gsStatus: need<HTMLDivElement>("#gs-status"),
  gsList: need<HTMLDivElement>("#gs-list"),
  gsClose: need<HTMLButtonElement>("#gs-close"),
  helpBtn: need<HTMLButtonElement>("#btn-help"),
  helpPanel: need<HTMLDivElement>("#help-panel"),
  helpClose: need<HTMLButtonElement>("#help-close"),
  conflictMask: need<HTMLDivElement>("#conflict-mask"),
  conflictBody: need<HTMLParagraphElement>("#conflict-body"),
  conflictClose: need<HTMLButtonElement>("#conflict-close"),
  conflictKeepMine: need<HTMLButtonElement>("#conflict-keep-mine"),
  conflictKeepDisk: need<HTMLButtonElement>("#conflict-keep-disk"),
  conflictLater: need<HTMLButtonElement>("#conflict-later"),
};

// 首帧启动就把静态标记里的 data-i18n 系列属性填成当前语言；语言切换时 applyLanguage() 会再跑一遍
applyStaticI18n();

/** 一个挂在左栏的文件夹 */
interface Workspace {
  id: string;
  handle: DirHandle;
  tree: DirNode;
}

interface State {
  /** 可以同时挂多个文件夹 */
  spaces: Workspace[];
  file: FileHandle | null;
  /** 当前这篇属于哪个工作区；空串 = 单开的一篇，不属于任何工作区 */
  spaceId: string;
  /** 相对所属工作区的路径 */
  path: string;
  name: string;
  dirty: boolean;
  saving: boolean;
  savedAt: Date | null;
  loading: boolean;
  encoding: TextEncoding;
  /** false = 这篇不是 UTF-8，写回去会换掉编码，所以整篇只读 */
  writable: boolean;
  /** 上次读到／写完这篇时磁盘上的样子。跟当下一比，就知道外面有没有人动过 */
  stamp: DiskStamp;
  /** 已认出外部改动、用户还没选留哪份。为 true 时一律不写盘 */
  conflict: boolean;
}

const state: State = {
  spaces: [],
  file: null,
  spaceId: "",
  path: "",
  name: "",
  dirty: false,
  saving: false,
  savedAt: null,
  loading: false,
  encoding: "utf-8",
  writable: true,
  stamp: UNKNOWN_STAMP,
  conflict: false,
};

let nextSpaceId = 1;
/** 上次开着、但权限还没续上的文件夹句柄——左栏会列出来等用户点一下 */
let pendingHandles: DirHandle[] = [];

const images = new ImageStore();
let ready = false;
let saveTimer = 0;
/** 保存排队执行：并发的保存请求依次落盘，各自拿到自己那次的结果 */
let saveChain: Promise<boolean> = Promise.resolve(true);
/** 打开也排队：两趟 openFile 并发时，后一趟的 images.reset() 会清掉前一趟刚登记的图映射 */
let openChain: Promise<void> = Promise.resolve();
/** 图片落不了盘的提示只弹一次，别每两秒刷一遍 */
let warnedStuck = false;

/** true 后才允许挂容器级监听——recreateValue 有值代表这是语言切换触发的重建，不是第一次挂载 */
let containerListenersAttached = false;

/** 语言切换时 applyLanguage() 会销毁重建，所以是 let 不是 const */
let editor: Vditor;

/**
 * 挂一个新的 Vditor 实例进 #editor。首次启动不传参，走 boot() 那一整套恢复逻辑；
 * 语言切换时传入要保回去的正文，跳过 boot()，只重放当前内容。
 * 编辑器这一层是切语言时唯一需要销毁重建的部分——Vditor 工具栏的提示、标题下拉这些
 * 内部文案是它自己按 lang 选项在构造时决定的，没有官方 API 能在实例存活期间热切换语言。
 */
function mountEditor(recreateValue?: string): void {
  const isFirst = recreateValue === undefined;
  editor = createEditor(dom.editor, {
    onReady: () => {
      ready = true;
      // Vditor 要等 lute 加载完才建好内部实例，主题得等到这时候才敢往里塞
      applyEditorTheme(editor, currentTheme());
      dom.toolbarSlot.textContent = "";
      const bar = dom.editor.querySelector(".vditor-toolbar");
      if (bar) dom.toolbarSlot.append(bar);
      if (!containerListenersAttached) {
        containerListenersAttached = true;
        dom.editor.addEventListener("scroll", onScroll, true);
        // 纯移动光标（点别的格子、方向键）不会触发 onInput，得单独盯着
        dom.editor.addEventListener("mouseup", () => tableToolbar.refresh());
        dom.editor.addEventListener("keyup", () => tableToolbar.refresh());
      }
      if (isFirst) {
        void boot();
      } else {
        editor.setValue(recreateValue, true);
        // 新实例默认可编辑——只读文件（非 UTF-8 编码）的锁定状态不会跟着 setValue 一起保回来
        if (!state.writable) editor.disabled();
        refreshMeta();
      }
    },
    onInput: () => {
      if (state.loading) return;
      markDirty();
      refreshMeta();
      scheduleSave();
    },
    onPickImage: () => {
      if (ensureImageTarget()) dom.imageInput.click();
    },
    onSearch: () => search.show(),
    onEmoji: (button) => emoji.toggle(button),
    trackImage: (blob, suggested) => (ensureImageTarget() ? images.track(blob, suggested) : null),
  });
}

mountEditor();

const tree = new FileTree(
  dom.tree,
  (spaceId, node) => void openFile(spaceId, node),
  (spaceId) => void removeSpace(spaceId),
  () => void pickDirectory(),
  () => void resumePending(),
);
const outline = new Outline(dom.outline, jumpToHeading);
const globalSearch = new GlobalSearch(
  {
    panel: dom.gsPanel,
    input: dom.gsInput,
    status: dom.gsStatus,
    list: dom.gsList,
    close: dom.gsClose,
  },
  () =>
    state.spaces.map((space) => ({
      spaceId: space.id,
      spaceName: space.tree.name,
      tree: space.tree,
    })),
  (hit, query) => {
    globalSearch.hide();
    void openFile(hit.spaceId, hit.node).then(() => {
      // 打开之后再用单篇查找定位过去，省得自己再写一套滚动逻辑
      dom.searchInput.value = query;
      search.show();
    });
  },
);
const emoji = new EmojiPicker((char) => {
  editor.insertValue(char);
  markDirty();
  refreshMeta();
  scheduleSave();
});
const search = new Search(
  {
    bar: dom.searchBar,
    input: dom.searchInput,
    count: dom.searchCount,
    prev: dom.searchPrev,
    next: dom.searchNext,
    close: dom.searchClose,
  },
  () => dom.editor.querySelector<HTMLElement>(".vditor-ir .vditor-reset"),
);
const tableToolbar = new TableToolbar(dom.canvas, () =>
  dom.editor.querySelector<HTMLElement>(".vditor-ir .vditor-reset"),
);
const help = new HelpPanel({ panel: dom.helpPanel, close: dom.helpClose });

// ---------- 状态栏 ----------

function countChars(text: string): number {
  return [...text.replace(/\s/g, "")].length;
}

function two(n: number): string {
  return String(n).padStart(2, "0");
}

function renderStatus(): void {
  dom.fileLabel.textContent = state.name || t().status.noFile;
  if (!state.file) {
    dom.saveLabel.textContent = "";
    dom.saveLabel.dataset.tone = "idle";
  } else if (state.conflict) {
    // 排在只读/保存中之前：自动保存已经停了，这是此刻最要紧的状态
    dom.saveLabel.textContent = t().status.conflict;
    dom.saveLabel.dataset.tone = "conflict";
  } else if (!state.writable) {
    dom.saveLabel.textContent = t().status.readonly(encodingLabel(state.encoding));
    dom.saveLabel.dataset.tone = "dirty";
  } else if (state.saving) {
    dom.saveLabel.textContent = t().status.saving;
    dom.saveLabel.dataset.tone = "busy";
  } else if (state.dirty) {
    dom.saveLabel.textContent = t().status.unsaved;
    dom.saveLabel.dataset.tone = "dirty";
  } else if (state.savedAt) {
    dom.saveLabel.textContent = t().status.savedAt(`${two(state.savedAt.getHours())}:${two(state.savedAt.getMinutes())}`);
    dom.saveLabel.dataset.tone = "idle";
  } else {
    dom.saveLabel.textContent = "";
    dom.saveLabel.dataset.tone = "idle";
  }
}

function refreshMeta(): void {
  if (!ready) return;
  const text = editor.getValue();
  dom.countLabel.textContent = t().meta.charCount(countChars(text));
  outline.update(readHeadings());
  search.refresh();
  tableToolbar.refresh();
  const pending = images.pendingCount(text);
  // 不认 alt，只看链接部分：alt 里带方括号也不会漏判
  const hasRelative = /\]\(\s*\.{0,2}\//.test(text);
  if (pending > 0) {
    dom.hintLabel.textContent = t().meta.pendingImages(pending);
  } else if (!state.path && hasRelative) {
    dom.hintLabel.textContent = t().meta.relativeImages;
  } else {
    dom.hintLabel.textContent = "";
  }
}

function markDirty(): void {
  if (state.dirty) return;
  state.dirty = true;
  renderStatus();
}

/**
 * 没有工作区就没有 images/ 可落脚，插进来的图只会变成死链，还会把这篇稿子卡在存不了也切不走的死角。
 * 所以从源头拦住，而不是等到保存时才拒绝。
 */
function ensureImageTarget(): boolean {
  if (currentSpace() && state.path) return true;
  editor.tip(t().tip.noWorkspaceForImage, 7000);
  return false;
}

// ---------- 保存 ----------

function scheduleSave(): void {
  if (!state.file) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void save(), 2000);
}

/** 返回 true 表示磁盘上的这篇稿子已经跟画布一致 */
function save(): Promise<boolean> {
  saveChain = saveChain.then(doSave, doSave);
  return saveChain;
}

async function doSave(): Promise<boolean> {
  if (!ready || !state.file || state.loading) return !state.dirty;
  // 非 UTF-8 的稿子已经设成只读了，这里再兜一道：绝不把别人的编码换掉
  if (!state.writable) return true;
  // 冲突没解决之前一个字都不许落盘，否则就是在盖掉外部改动——本函数存在的全部意义
  if (state.conflict) return false;
  if (!state.dirty) return true;
  window.clearTimeout(saveTimer);
  state.saving = true;
  renderStatus();
  let blocked = false;
  try {
    const value = editor.getValue();
    // path 为空 = 这篇稿子不在已打开的工作区里，图片没有正确的落脚点，不能瞎写
    const space = currentSpace();
    const workspace = space && state.path ? space.handle : null;
    await images.flush(value, workspace, state.path);
    const stuck = images.pendingCount(value);
    if (stuck > 0) {
      // 宁可这次不保存，也不把指向不存在文件的死链写进稿件
      blocked = true;
      if (!warnedStuck) {
        warnedStuck = true;
        editor.tip(t().tip.imagesStuck(stuck), 7000);
      }
      return false;
    }
    // 安全闸：写之前先看一眼磁盘。跟我们上次见到的对不上，说明外面有人改过，
    // 这时候写下去就是把别人的改动整个盖掉——停手，交给用户决定留哪份。
    if (stampChanged(state.stamp, await readStamp(state.file))) {
      blocked = true;
      enterConflict();
      return false;
    }
    const payload = images.dehydrate(value);
    // 原文件带 BOM 就把 BOM 写回去，别悄悄改掉文件的字节开头
    await writeFile(state.file, state.encoding === "utf-8-bom" ? `﻿${payload}` : payload);
    // 立刻把基准换成我们自己刚写出来的样子，否则下一轮自动保存会把自己的写入当成外部改动
    state.stamp = await readStamp(state.file);
    state.savedAt = new Date();
    // 写盘这一小会儿里用户可能又敲了字，不能一律把 dirty 抹掉，否则那几个字就没了
    state.dirty = editor.getValue() !== value;
    warnedStuck = false;
    return !state.dirty;
  } catch (error) {
    console.error("[Sheaf] 保存失败", error);
    editor.tip(t().tip.saveFailed, 4000);
    return false;
  } finally {
    state.saving = false;
    renderStatus();
    refreshMeta();
    // 落不了盘就别每两秒重试一次刷屏，等用户把文件夹打开
    if (!blocked && state.dirty) scheduleSave();
  }
}

// ---------- 外部改动 ----------
//
// 「Sheaf 开着 A → 外部（AI、别的编辑器、同步盘）把 A 改了」这件事有两条路要走：
//   · 画布上没有未保存改动 → 直接换成磁盘那份，不打扰用户（②）
//   · 画布上有未保存改动   → 两份都是真的，机器猜不出留哪份，停下来问（①）
// 问的期间自动保存整个冻结，这是丢稿路径上最后一道闸。

/** 把画布内容换成磁盘上的那份，并尽量把用户正在看的位置留在原地 */
async function reloadFromDisk(): Promise<boolean> {
  if (!state.file) return false;
  const scroller = dom.editor.querySelector<HTMLElement>(".vditor-ir .vditor-reset");
  const keepScroll = scroller?.scrollTop ?? 0;
  state.loading = true;
  try {
    const loaded = await readText(state.file);
    images.reset();
    const space = state.spaces.find((item) => item.id === state.spaceId) ?? null;
    const hydrated = await images.hydrate(loaded.text, space?.handle ?? null, state.path);
    const stamp = await readStamp(state.file);
    // 复用 setDoc 而不是零散赋值：它顺带清掉 dirty/conflict 并复位只读态，少一处漏改
    setDoc(state.file, state.spaceId, state.path, state.name, loaded, stamp);
    // 撤销栈必须清：这些内容不是用户敲出来的，留着撤销会把外部那份「撤」成旧内容
    editor.setValue(hydrated, true);
    // 换完内容再滚回去。setValue 是同步的，但 Vditor 的渲染排到下一帧，早了会被重置
    if (scroller && keepScroll > 0) {
      // 不自己夹上界：内容变短时浏览器会 clamp 到底部，比拿一个可能还没算完的
      // scrollHeight 去算更稳
      requestAnimationFrame(() => {
        scroller.scrollTop = keepScroll;
      });
    }
    return true;
  } catch (error) {
    console.error("[Sheaf] 重新读取失败", error);
    editor.tip(t().conflict.reloadFailed, 5000);
    return false;
  } finally {
    state.loading = false;
    refreshMeta();
    renderStatus();
  }
}

function enterConflict(): void {
  state.conflict = true;
  window.clearTimeout(saveTimer);
  renderStatus();
  showConflict();
}

/** 正文带文件名，是唯一拼出来的一句，静态 data-i18n 覆盖不到，切语言时要单独重刷 */
function renderConflictBody(): void {
  dom.conflictBody.textContent = t().conflict.body(state.name || t().status.noFile);
}

function showConflict(): void {
  renderConflictBody();
  dom.conflictMask.hidden = false;
  dom.conflictKeepMine.focus();
}

function hideConflict(): void {
  dom.conflictMask.hidden = true;
}

/** 留用户这份：把画布写回磁盘，盖掉外部改动。这是用户明说要的，不再拦 */
async function resolveKeepMine(): Promise<void> {
  hideConflict();
  state.conflict = false;
  // 认下磁盘现状当新基准，安全闸才不会立刻又拦一次
  state.stamp = await readStamp(state.file);
  state.dirty = true;
  if (await save()) editor.tip(t().conflict.resolvedMine, 4000);
  renderStatus();
}

/** 用磁盘那份：放弃画布上的改动 */
async function resolveKeepDisk(): Promise<void> {
  hideConflict();
  state.conflict = false;
  if (await reloadFromDisk()) editor.tip(t().conflict.resolvedDisk, 4000);
  else {
    // 读不回来就别假装解决了，冲突原样挂着，自动保存继续冻结
    state.conflict = true;
    renderStatus();
  }
}

/**
 * 回到 Sheaf 窗口时对一次表。没未保存改动就无声换掉，有就问。
 * 保存中／加载中／已经在问了都跳过，避免自己跟自己打架。
 */
async function checkExternalChange(): Promise<void> {
  if (!ready || !state.file || state.loading || state.saving || state.conflict) return;
  const disk = await readStamp(state.file);
  if (!stampChanged(state.stamp, disk)) return;
  if (state.dirty) {
    enterConflict();
    return;
  }
  if (await reloadFromDisk()) editor.tip(t().conflict.reloaded, 3000);
}

/** 稿件名去掉扩展名，给导出的文件用 */
function stem(): string {
  return (state.name || t().export.untitled).replace(/\.(md|markdown)$/i, "");
}

async function downloadCurrent(): Promise<void> {
  const text = images.dehydrate(editor.getValue());
  await saveAs(`${stem()}.md`, text, [{ name: t().export.mdFilterName, extensions: ["md"] }]);
}

/**
 * 导出成一个能直接双击打开的网页。
 * 正文样式内联进去——不然换台机器打开就是一堆没排版的黑字。
 * 图片走 dehydrate 换回相对路径：它是按 blob 地址做纯字符串替换的，对 HTML 一样管用。
 */
async function exportHtml(): Promise<void> {
  const body = images.dehydrate(editor.getHTML());
  const title = stem();
  const page = `<!DOCTYPE html>
<html lang="${currentLang() === "zh" ? "zh-CN" : "en-US"}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body {
    margin: 0 auto; max-width: 720px; padding: 48px 24px;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 17px; line-height: 1.9; color: #1b2320; background: #ffffff;
  }
  h1 { font-size: 1.75em; line-height: 1.25; margin: 0 0 .7em; }
  h2 { font-size: 1.25em; margin: 1.7em 0 .5em; }
  h3 { font-size: 1.08em; margin: 1.35em 0 .4em; }
  p, li { margin: 0 0 .85em; }
  a { color: #2f8b76; }
  img { max-width: 100%; height: auto; display: block; margin: 1.4em 0; }
  blockquote { margin: 1.2em 0; padding: 0 0 0 1em; border-left: 2.5px solid #cbdfd9; color: #5d6b66; }
  code { background: #f1f6f4; border-radius: 5px; padding: .15em .42em; font-size: .85em; }
  pre { background: #f1f6f4; border-radius: 10px; padding: 13px 15px; overflow: auto; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1.2em 0; }
  th, td { border: 1px solid #e8efec; padding: 7px 10px; text-align: left; }
  hr { border: 0; height: 1px; background: #e8efec; margin: 2em 0; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
  await saveAs(`${title}.html`, page, [{ name: t().export.htmlFilterName, extensions: ["html"] }]);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

// ---------- 新建 ----------

async function createNewFile(): Promise<void> {
  const space = currentSpace() ?? state.spaces[0] ?? null;
  if (!space) {
    editor.tip(t().tip.needFolderForNewFile, 5000);
    return;
  }
  // 上一篇没存成功就别切走，跟切稿走同一条规矩
  if (state.dirty && state.file && !(await save())) {
    editor.tip(t().tip.unsavedBeforeNew, 5000);
    return;
  }
  try {
    const name = await uniqueName(space.handle, `${t().export.untitled}.md`);
    const handle = await space.handle.getFileHandle(name, { create: true });
    await writeFile(handle, `# ${name.replace(/\.md$/i, "")}\n\n`);
    await rescan(space);
    const node = findFile(space.tree, name);
    if (node) await openFile(space.id, node);
  } catch (error) {
    console.error("[Sheaf] 新建失败", error);
    editor.tip(t().tip.newFileFailed, 5000);
  }
}

// ---------- 打开 ----------

/** 当前这篇稿子属于哪个工作区。单开一篇时没有工作区，返回 null */
function currentSpace(): Workspace | null {
  return state.spaces.find((space) => space.id === state.spaceId) ?? null;
}

function pushTree(): void {
  tree.setSpaces(
    state.spaces.map((space) => ({ id: space.id, tree: space.tree })),
    pendingHandles.map((handle) => ({ name: handle.name })),
  );
  tree.setActive(state.spaceId, state.path);
}

/**
 * 记住当前挂了哪些文件夹。
 * 存不进去（隐私模式、配额满）不该把「已经打开的文件夹」也一起废掉——
 * 内存里它是好好的，只是下次要重新打开而已。
 */
let warnedNoMemory = false;

async function saveSpaces(): Promise<void> {
  try {
    await rememberRoots(state.spaces.map((space) => space.handle));
  } catch (error) {
    console.warn("[Sheaf] 记不住工作区列表", error);
    if (!warnedNoMemory) {
      warnedNoMemory = true;
      editor.tip(t().tip.workspaceMemoryFailed, 6000);
    }
  }
}

/** 重扫某个工作区的目录树（新建、删除文件之后要刷新） */
async function rescan(space: Workspace): Promise<void> {
  space.tree = await scanTree(space.handle);
  pushTree();
}

/**
 * 挂上一个文件夹。同一个文件夹重复挂就跳到已有的那个，不做重复项。
 * 注意是**追加**：需求是同时开几个目录，不是每次把上一个顶掉。
 */
async function addSpace(
  handle: DirHandle,
  preferPath?: string | null,
): Promise<void> {
  for (const exist of state.spaces) {
    if (await exist.handle.isSameEntry?.(handle)) {
      editor.tip(t().tip.alreadyInList(handle.name), 3000);
      return;
    }
  }
  const space: Workspace = { id: `ws-${nextSpaceId++}`, handle, tree: await scanTree(handle) };
  state.spaces.push(space);
  pendingHandles = pendingHandles.filter((item) => item.name !== handle.name);
  await saveSpaces();
  pushTree();

  const target = (preferPath && findFile(space.tree, preferPath)) || firstFile(space.tree);
  if (target) {
    await openFile(space.id, target);
  } else if (state.dirty) {
    // 空文件夹不能顶掉画布上没保存的东西——那是无声丢字，beforeunload 都拦不住
    editor.tip(t().tip.noMdInFolderUnsaved(handle.name), 6000);
  } else if (!state.file) {
    editor.tip(t().tip.noMdInFolder(handle.name), 5000);
  }
}

/** 左栏点「点一下继续用」：这时才是用户手势，可以弹授权框 */
async function resumePending(): Promise<void> {
  if (pendingHandles.length === 0) return;
  const all = await recallRoots();
  await restoreSpaces(all.length > 0 ? all : pendingHandles, true);
}

/** 只从列表里拿掉，绝不碰磁盘上的文件 */
async function removeSpace(id: string): Promise<void> {
  const index = state.spaces.findIndex((space) => space.id === id);
  if (index < 0) return;
  const [gone] = state.spaces.splice(index, 1);
  pendingHandles = pendingHandles.filter((handle) => handle.name !== gone.tree.name);
  await saveSpaces();
  // 当前这篇正好在被移出的工作区里：画布留着内容，但不再属于任何工作区
  if (state.spaceId === id) {
    state.spaceId = "";
    state.path = "";
    renderStatus();
  }
  pushTree();
  editor.tip(t().tip.removedFromList(gone.tree.name), 4000);
}

function setDoc(
  handle: FileHandle | null,
  spaceId: string,
  path: string,
  name: string,
  loaded?: { encoding: TextEncoding; writable: boolean },
  stamp: DiskStamp = UNKNOWN_STAMP,
): void {
  state.file = handle;
  state.spaceId = spaceId;
  state.path = path;
  state.name = name;
  state.dirty = false;
  state.savedAt = null;
  state.encoding = loaded?.encoding ?? "utf-8";
  state.writable = loaded?.writable ?? true;
  // 换了一篇就是一个全新的对照基准，上一篇没解决的冲突不能跟着传过来
  state.stamp = stamp;
  state.conflict = false;
  hideConflict();
  // 存不回去的编码就不让改：改了也保存不了，不如从一开始就说清楚
  if (state.writable) editor.enable();
  else {
    editor.disabled();
    editor.tip(t().tip.readonlyEncoding(encodingLabel(state.encoding)), 8000);
  }
  renderStatus();
}

function encodingLabel(encoding: TextEncoding): string {
  if (encoding === "legacy") return "GBK/GB18030";
  if (encoding === "utf-16le" || encoding === "utf-16be") return "UTF-16";
  return "UTF-8";
}

function openFile(spaceId: string, node: FileNode): Promise<void> {
  const run = () => doOpenFile(spaceId, node);
  openChain = openChain.then(run, run);
  return openChain;
}

async function doOpenFile(spaceId: string, node: FileNode): Promise<void> {
  // 上一篇没存成功就别切走，否则那些改动会被 setValue 直接盖掉
  if (state.dirty && state.file && !(await save())) {
    editor.tip(t().tip.unsavedBeforeSwitch, 5000);
    return;
  }
  state.loading = true;
  try {
    // 先取 stamp 再读内容：万一读的这一瞬间文件正被改，stamp 会「偏旧」，
    // 下次对表就多重载一次；反过来取会「偏新」，那是真的会漏掉外部改动
    const stamp = await readStamp(node.handle);
    const loaded = await readText(node.handle);
    // 读成功之后才清旧映射：读失败时画布上还是上一篇，图不能提前撤成裂图
    images.reset();
    // 图片按这篇稿子所属的那个工作区来找，别拿错文件夹
    const space = state.spaces.find((item) => item.id === spaceId) ?? null;
    const hydrated = await images.hydrate(loaded.text, space?.handle ?? null, node.path);
    setDoc(node.handle, spaceId, node.path, node.name, loaded, stamp);
    editor.setValue(hydrated, true);
    tree.setActive(spaceId, node.path);
    const index = state.spaces.findIndex((item) => item.id === spaceId);
    if (index >= 0) await rememberLastFile({ index, path: node.path });
  } catch (error) {
    console.error("[Sheaf] 打开失败", error);
    editor.tip(t().tip.openFailed, 3000);
  } finally {
    state.loading = false;
    refreshMeta();
    renderStatus();
  }
}

/**
 * 系统文件框一次只能开一个，而且它可能弹到别的窗口后面去。
 * 所以：点下去先说一声、同时只允许开一个、失败一定要出声——
 * 绝不能再出现「点了完全没反应」这种什么都不说的状态。
 */
let picking = false;

async function withPicker<T>(
  hint: string,
  open: () => Promise<T>,
  use: (value: T) => Promise<void>,
): Promise<void> {
  if (picking) {
    editor.tip(t().tip.pickerBusy, 5000);
    return;
  }
  picking = true;
  if (hint) editor.tip(hint, 4000);
  try {
    const value = await open();
    // 框已经关掉了，把「正在打开…」收走，别让它继续挂在那儿让人以为卡住
    editor.tip("", 1);
    await use(value);
  } catch (error) {
    // 用户自己在框里点了取消，这是正常操作，不用报错
    if (error instanceof DOMException && error.name === "AbortError") {
      editor.tip("", 1);
      return;
    }
    if (error instanceof Error && error.message === "NO_PICKER") {
      editor.tip(t().tip.pickerUnsupported, 5000);
      return;
    }
    console.error("[Sheaf] 打开失败", error);
    const name = error instanceof Error ? error.name : t().tip.unknownError;
    const message = error instanceof Error ? error.message : String(error);
    editor.tip(t().tip.pickerFailed(name, message), 9000);
  } finally {
    picking = false;
  }
}

async function pickDirectory(): Promise<void> {
  await withPicker(
    // Tauri 原生对话框是模态置顶，不会被挡；这条提示只在浏览器/PWA 路径上还有意义
    isDesktop ? "" : t().tip.pickerOpeningDir,
    () => chooseDirectory(),
    // 桌面壳里用户点取消是拿到 null，不像浏览器那样抛 AbortError
    async (root) => {
      if (root) await addSpace(root);
    },
  );
}

/**
 * 打开一篇不属于任何工作区的稿子（顶栏「打开单篇」，或直接拖一个 .md 进来）。
 * 单开、选择器、拖拽三条路都走这里——之前每条路各写一遍，
 * 8 月 15 号就是在其中一条上漏了编码保护和 images.reset() 的时序，丢过稿。
 */
async function openLooseFile(handle: FileHandle): Promise<void> {
  if (state.dirty && state.file && !(await save())) {
    editor.tip(t().tip.unsavedBeforeOpen, 5000);
    return;
  }
  state.loading = true;
  try {
    const stamp = await readStamp(handle);
    const file = await handle.getFile();
    const loaded = await readTextFromFile(file);
    // 读成功之后才清旧映射，否则读失败时上一篇的图会全变裂图
    images.reset();
    // spaceId / path 都留空：这篇不在任何工作区里，图片没有可靠的落脚点
    setDoc(handle, "", "", file.name, loaded, stamp);
    editor.setValue(loaded.text, true);
    tree.setActive(null, null);
  } catch (error) {
    console.error("[Sheaf] 打开失败", error);
    editor.tip(t().tip.openFailed, 3000);
  } finally {
    // 必须复位：loading 卡住会让整个会话不再触发自动保存，而状态栏还显示「已保存」
    state.loading = false;
    refreshMeta();
    renderStatus();
  }
}

async function pickSingleFile(): Promise<void> {
  if (!isDesktop && typeof window.showOpenFilePicker !== "function") {
    // 老浏览器兜底：普通 <input type=file>，只能读不能写回原处
    dom.fileInput.click();
    return;
  }
  await withPicker(
    isDesktop ? "" : t().tip.pickerOpeningFile,
    () => chooseFile(),
    async (handle) => {
      if (handle) await openLooseFile(handle);
    },
  );
}

// ---------- 拖进来就能开 ----------

function isMarkdownName(name: string): boolean {
  return /\.(md|markdown|txt)$/i.test(name);
}

/** 拖进来的东西里有没有非图片。纯图片就别拦，交给 Vditor 落盘到 images/ */
function hasNonImage(transfer: DataTransfer): boolean {
  return [...transfer.items].some(
    (item) => item.kind === "file" && !item.type.startsWith("image/"),
  );
}

/**
 * getAsFileSystemHandle() 只能在 drop 的**同一个 tick** 里同步调用，
 * 中间只要 await 过一次就再也拿不到句柄。所以先同步把 promise 全收集起来，之后再一起等。
 */
function grabHandles(transfer: DataTransfer): Promise<FileSystemHandle | null>[] {
  const jobs: Promise<FileSystemHandle | null>[] = [];
  for (const item of transfer.items) {
    if (item.kind !== "file") continue;
    const grab = item.getAsFileSystemHandle?.bind(item);
    if (grab) jobs.push(grab());
  }
  return jobs;
}

async function handleDropped(jobs: Promise<FileSystemHandle | null>[]): Promise<void> {
  let handles: (FileSystemHandle | null)[];
  try {
    handles = await Promise.all(jobs);
  } catch (error) {
    console.error("[Sheaf] 读拖入的东西失败", error);
    editor.tip(t().tip.dropRejected, 4000);
    return;
  }

  // 拖拽给的是浏览器原生句柄，结构上正好满足本项目的接口，直接当自己人用
  const dropped = handles as unknown as (DirHandle | FileHandle | null)[];
  const dirs = dropped.filter((h): h is DirHandle => h?.kind === "directory");
  const files = dropped.filter(
    (h): h is FileHandle => h?.kind === "file" && isMarkdownName(h.name),
  );

  if (dirs.length === 0 && files.length === 0) {
    editor.tip(t().tip.dropUnsupported, 4000);
    return;
  }

  for (const dir of dirs) {
    // drop 属于用户手势，这时候才能弹授权框
    if (await ensurePermission(dir, true)) await addSpace(dir);
  }
  // 一次拖进来好几篇的话只开第一篇，其余的靠左栏点——省得连开几次把画布刷来刷去
  const first = files[0];
  if (first && (await ensurePermission(first, true))) await openLooseFile(first);
}

function setDropActive(on: boolean): void {
  dom.dropzone.hidden = !on;
}

window.addEventListener(
  "dragover",
  (event) => {
    if (!event.dataTransfer || !hasNonImage(event.dataTransfer)) return;
    // 不 preventDefault 的话浏览器会自己打开这个文件，等于把Sheaf顶掉
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  },
  true,
);

window.addEventListener("dragleave", (event) => {
  if (event.relatedTarget === null) setDropActive(false);
});

window.addEventListener(
  "drop",
  (event) => {
    if (!event.dataTransfer || !hasNonImage(event.dataTransfer)) return;
    event.preventDefault();
    // 拦在捕获阶段：不然 Vditor 的图片上传处理器会抢先回一句「请选择图片文件」
    event.stopPropagation();
    const jobs = grabHandles(event.dataTransfer);
    setDropActive(false);
    void handleDropped(jobs);
  },
  true,
);

async function boot(): Promise<void> {
  editor.setValue(t().welcome, true);
  refreshMeta();
  // 先渲染一次：没有工作区时左栏要显示引导，而不是一片空白
  pushTree();
  const handles = await recallRoots();
  if (handles.length > 0) {
    // 启动时不能弹授权框（不是用户手势），拿不到权限就把「继续上次」露出来等他点
    await restoreSpaces(handles, false);
  }
  if (isDesktop) {
    await setupOsFileOpen();
    await setupNativeFocus();
  }
}

/**
 * 桌面壳里必须用 Tauri 的原生窗口焦点事件，不能只靠网页的 window focus。
 * 实测（2026-08-24 真机）：只是点任务栏/标题栏切回 Sheaf 时，WebView2 的内容区
 * 并没有拿到键盘焦点，网页那个 focus 根本不发——非得点进正文才发。
 * 而「从 AI 那边切回来先看一眼」恰恰是这个功能要服务的主场景，漏掉就等于没做。
 */
async function setupNativeFocus(): Promise<void> {
  await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (focused) void guardedCheck();
  });
}

/**
 * 双击 .md / 右键「打开方式」选 Sheaf 打开某篇稿子。
 * 冷启动（进程本来没在跑）走 take_pending_file 一次性领取；Sheaf 已经开着时，
 * 操作系统其实是想再启一个进程——Rust 那边的 single-instance 插件拦住它，转成 open-file 事件转发过来。
 * 两条路径最后都落到同一个 openLooseFile，跟「打开单篇」「拖一个 .md 进来」是同一套逻辑，不重开一份。
 */
async function setupOsFileOpen(): Promise<void> {
  const openPath = (path: string) => void openLooseFile(fileHandleFromPath(path));

  await listen<string>("open-file", (event) => openPath(event.payload));

  const pending = await invoke<string | null>("take_pending_file");
  if (pending) openPath(pending);
}

/**
 * 把上次挂着的文件夹逐个恢复。某一个坏了（被改名、移动、删掉）不该让其余的一起消失，
 * 所以逐个处理、各自计数，最后统一给一句提示。
 */
async function restoreSpaces(
  handles: DirHandle[],
  request: boolean,
): Promise<void> {
  const last = await recallLastFile();
  const bySource = new Map<number, Workspace>();
  const stillPending: DirHandle[] = [];
  let broken = 0;

  state.spaces = [];
  for (let i = 0; i < handles.length; i += 1) {
    const handle = handles[i];
    if (!(await ensurePermission(handle, request))) {
      stillPending.push(handle);
      continue;
    }
    try {
      const space: Workspace = {
        id: `ws-${nextSpaceId++}`,
        handle,
        tree: await scanTree(handle),
      };
      state.spaces.push(space);
      bySource.set(i, space);
    } catch (error) {
      console.error("[Sheaf] 恢复文件夹失败", handle.name, error);
      broken += 1;
    }
  }
  pendingHandles = stillPending;
  pushTree();

  if (broken > 0) {
    editor.tip(t().tip.restoreBroken(broken), 7000);
  }

  const target = (last && bySource.get(last.index)) || state.spaces[0];
  if (!target || state.dirty) return;
  const node = (last && findFile(target.tree, last.path)) || firstFile(target.tree);
  if (node) await openFile(target.id, node);
}

// ---------- 大纲联动 ----------

function headingElements(): HTMLElement[] {
  const reset = dom.editor.querySelector(".vditor-ir .vditor-reset");
  if (!reset) return [];
  return [
    ...reset.querySelectorAll<HTMLElement>(
      ":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6",
    ),
  ];
}

/** 大纲的数据源就是上面这批元素本身，序号天然对齐，不会点一条跳到另一条上 */
function readHeadings(): Heading[] {
  return headingElements().map((el, index) => {
    const clone = el.cloneNode(true) as HTMLElement;
    // IR 模式下光标所在的标题会把 ## 露出来，那是标记不是标题文字
    for (const marker of clone.querySelectorAll(".vditor-ir__marker")) marker.remove();
    return {
      level: Number(el.tagName.slice(1)) || 1,
      text: clone.textContent?.trim() || t().outline.untitled,
      index,
    };
  });
}

function jumpToHeading(index: number): void {
  const target = headingElements()[index];
  if (target) target.scrollIntoView({ block: "start", behavior: "smooth" });
}

let scrollFrame = 0;
function onScroll(): void {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    const items = headingElements();
    let active = -1;
    for (let i = 0; i < items.length; i += 1) {
      if (items[i].getBoundingClientRect().top <= 140) active = i;
      else break;
    }
    outline.setActive(active);
    tableToolbar.refresh();
  });
}

// ---------- 侧栏 ----------

function applyPane(side: "left" | "right", on: boolean): void {
  dom.body.dataset[side] = on ? "on" : "off";
  localStorage.setItem(`wd-pane-${side}`, on ? "on" : "off");
  const button = side === "left" ? dom.toggleLeft : dom.toggleRight;
  button.dataset.on = on ? "1" : "0";
  button.setAttribute("aria-pressed", on ? "true" : "false");
}

function togglePane(side: "left" | "right"): void {
  applyPane(side, dom.body.dataset[side] !== "on");
}

applyPane("left", localStorage.getItem("wd-pane-left") !== "off");
applyPane("right", localStorage.getItem("wd-pane-right") !== "off");
setupTheme(dom.theme, (theme) => {
  if (ready) applyEditorTheme(editor, theme);
});
setupLang(dom.lang);

/**
 * 语言切换的总入口。tree/outline/globalSearch/tableToolbar/emoji/theme/lang 各自已经
 * 通过 onLangChange 订阅了自己的重绘，这里只管剩下两块：index.html 里的静态标记，
 * 以及 Vditor 编辑器本身——它的工具栏文案是构造时定死的，只能销毁重建（见 mountEditor 注释）。
 */
onLangChange(() => {
  applyStaticI18n();
  renderStatus();
  if (!dom.conflictMask.hidden) renderConflictBody();
  // 没打开真实文件时画布上还是欢迎文档的占位文字，切语言要跟着换成新语言的版本；
  // 有文件在编辑（含未保存改动）就必须原样保留，绝不能用新语言的模板文字覆盖用户内容
  const value = state.file ? editor.getValue() : t().welcome;
  ready = false;
  editor.destroy();
  mountEditor(value);
});

// ---------- 事件 ----------

// ---------- 顶栏下拉（打开 / 导出共用一套开关） ----------

function setMenu(button: HTMLButtonElement, menu: HTMLElement, open: boolean): void {
  menu.hidden = !open;
  button.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeAllMenus(): void {
  setMenu(dom.openBtn, dom.openMenu, false);
  setMenu(dom.exportBtn, dom.exportMenu, false);
}

function bindMenu(button: HTMLButtonElement, menu: HTMLElement): void {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = menu.hasAttribute("hidden");
    closeAllMenus();
    setMenu(button, menu, willOpen);
  });
}

dom.openDir.addEventListener("click", () => void pickDirectory());
bindMenu(dom.openBtn, dom.openMenu);

dom.openMenu.addEventListener("click", (event) => {
  const kind = (event.target as HTMLElement).closest<HTMLElement>("[data-open]")?.dataset.open;
  if (!kind) return;
  closeAllMenus();
  if (kind === "dir") void pickDirectory();
  else void pickSingleFile();
});
dom.newFile.addEventListener("click", () => void createNewFile());
dom.saveBtn.addEventListener("click", () => {
  if (state.file) void save();
  else downloadCurrent();
});

// ---------- 导出下拉 ----------

bindMenu(dom.exportBtn, dom.exportMenu);

dom.exportMenu.addEventListener("click", (event) => {
  const kind = (event.target as HTMLElement).closest<HTMLElement>("[data-export]")?.dataset.export;
  if (!kind) return;
  closeAllMenus();
  if (kind === "md") void downloadCurrent();
  else if (kind === "html") void exportHtml();
  else if (kind === "print") {
    // 打印走系统对话框，在那里选「另存为 PDF」；@media print 会把侧栏和工具栏收起来。
    // window.print() 会阻塞主线程直到对话框关闭，提示先弹出、延迟一下再打印，不然根本来不及画出来
    editor.tip(t().tip.printHint, 6000);
    window.setTimeout(() => window.print(), 400);
  }
});

document.addEventListener("click", closeAllMenus);
dom.toggleLeft.addEventListener("click", () => togglePane("left"));
dom.toggleRight.addEventListener("click", () => togglePane("right"));
dom.helpBtn.addEventListener("click", () => help.toggle());

dom.imageInput.addEventListener("change", () => {
  const files = [...(dom.imageInput.files ?? [])];
  dom.imageInput.value = "";
  if (files.length === 0) return;
  if (!ensureImageTarget()) return;
  let chunk = "";
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    const url = images.track(file, file.name);
    chunk += `![${safeAlt(file.name.replace(/\.[^.]+$/, ""))}](${url})\n\n`;
  }
  if (!chunk) return;
  editor.insertValue(chunk);
  markDirty();
  refreshMeta();
  scheduleSave();
});

dom.fileInput.addEventListener("change", async () => {
  const file = dom.fileInput.files?.[0];
  dom.fileInput.value = "";
  if (!file) return;
  state.loading = true;
  try {
    const loaded = await readTextFromFile(file);
    images.reset();
    setDoc(null, "", "", file.name, loaded);
    editor.setValue(loaded.text, true);
  } catch (error) {
    console.error("[Sheaf] 打开失败", error);
    editor.tip(t().tip.openFailed, 3000);
  } finally {
    state.loading = false;
    refreshMeta();
    renderStatus();
  }
});

window.addEventListener("keydown", (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;
  const key = event.key.toLowerCase();
  if (key === "s") {
    event.preventDefault();
    // 冲突挂着时 save() 会一声不响地拒绝写盘。按了 Ctrl+S 什么都不发生
    // 正是这个项目一直在躲的坑，所以直接把那个待决定的对话框叫回来
    if (state.conflict) showConflict();
    else if (state.file) void save();
    else downloadCurrent();
  } else if (key === "f") {
    event.preventDefault();
    // Shift 版是「在所有文件夹里找」，跟 VS Code 一个路子
    if (event.shiftKey) globalSearch.show();
    else search.show();
  } else if (key === "\\" || key === "|") {
    // Shift+反斜杠在键盘上敲出来的是 |，不是 \——Ctrl+\ 一直是好的，
    // Ctrl+Shift+\（收起大纲）从写下这行起就没生效过，因为原来只认 \
    event.preventDefault();
    togglePane(event.shiftKey ? "right" : "left");
  } else if (event.shiftKey && key === "k") {
    event.preventDefault();
    dom.imageInput.click();
  }
});

window.addEventListener("blur", () => {
  if (state.dirty) void save();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && state.dirty) void save();
  else if (document.visibilityState === "visible") void guardedCheck();
});

// 回到 Sheaf 就对一次表。focus 与 visibilitychange 在不同平台上触发得不一样，
// 两个都听、用一把锁挡住重入，比赌某一个一定会来可靠。
let checking = false;
async function guardedCheck(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    await checkExternalChange();
  } finally {
    checking = false;
  }
}

window.addEventListener("focus", () => void guardedCheck());

dom.conflictKeepMine.addEventListener("click", () => void resolveKeepMine());
dom.conflictKeepDisk.addEventListener("click", () => void resolveKeepDisk());
// 「先不决定」只收起对话框，冲突照挂、自动保存照冻——状态栏那行字是回来的入口
dom.conflictLater.addEventListener("click", () => hideConflict());
dom.conflictClose.addEventListener("click", () => hideConflict());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !dom.conflictMask.hidden) hideConflict();
});
dom.saveLabel.addEventListener("click", () => {
  if (state.conflict) showConflict();
});

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

// service worker 只服务浏览器与 PWA。
//
// 桌面壳里必须把它拆掉：sw 对 tauri.localhost 的请求一律失败，于是每次都回落到缓存分支，
// 页面永远是第一次运行时缓存的那一份——换句话说程序再也升不了级，重新打包多少次都没用。
// 桌面壳的资源本来就打在包里，断网可开这件事它自己就做到了，不需要 sw。
if (isDesktop) {
  void navigator.serviceWorker?.getRegistrations().then((list) => {
    for (const registration of list) void registration.unregister();
  });
  void caches?.keys().then((keys) => {
    for (const key of keys) void caches.delete(key);
  });
} else if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("[Sheaf] service worker 没装上", error);
    });
  });
}
