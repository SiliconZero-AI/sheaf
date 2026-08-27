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
import { DiagramLightbox } from "./lightbox";
import { HelpPanel } from "./help";
import {
  canInstallNow,
  checkForUpdate,
  UpdatePrompt,
  type BlockReason,
  type DownloadProgress,
  type Update,
} from "./update";
import { currentTheme, setupTheme } from "./theme";
import { ImageStore, safeAlt } from "./images";
import { applyStaticI18n, currentLang, onLangChange, t } from "./i18n";
import { setupLang } from "./lang";
import type Vditor from "vditor";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
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
  moveToTrash,
  nextAfterDelete,
  type DirNode,
  type FileNode,
  type TextEncoding,
  isDesktop,
  pickDirectory as chooseDirectory,
  pickFile as chooseFile,
  saveAs,
  fileHandleFromPath,
  fileHandleIfExists,
  relativePathInside,
  loosePathOf,
  readStamp,
  stampChanged,
  UNKNOWN_STAMP,
  hitsWatchedFile,
  affectsTree,
  samePath,
  missingStep,
  settleStep,
  positionKey,
  recallPositions,
  rememberPosition,
  recallZoom,
  rememberZoom,
  type FilePosition,
  type LastFile,
  type DiskStamp,
  type DirHandle,
  type FileHandle,
} from "./fs";
import {
  applyCursorAnchor,
  applyScrollAnchor,
  captureCursorAnchor,
  captureScrollAnchor,
} from "./anchor";
import { DirWatcher, parentDir, type WatchTarget } from "./watch";

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
  helpVersion: need<HTMLSpanElement>("#help-version"),
  conflictMask: need<HTMLDivElement>("#conflict-mask"),
  conflictBox: need<HTMLDivElement>("#conflict-box"),
  conflictFile: need<HTMLElement>("#conflict-file"),
  conflictMineMeta: need<HTMLSpanElement>("#conflict-mine-meta"),
  conflictMineHead: need<HTMLSpanElement>("#conflict-mine-head"),
  conflictDiskMeta: need<HTMLSpanElement>("#conflict-disk-meta"),
  conflictDiskHead: need<HTMLSpanElement>("#conflict-disk-head"),
  conflictClose: need<HTMLButtonElement>("#conflict-close"),
  conflictKeepMine: need<HTMLButtonElement>("#conflict-keep-mine"),
  conflictKeepDisk: need<HTMLButtonElement>("#conflict-keep-disk"),
  conflictLater: need<HTMLButtonElement>("#conflict-later"),
  deleteMask: need<HTMLDivElement>("#delete-mask"),
  deleteBox: need<HTMLDivElement>("#delete-box"),
  deleteFile: need<HTMLElement>("#delete-file"),
  deleteFailed: need<HTMLParagraphElement>("#delete-failed"),
  deleteClose: need<HTMLButtonElement>("#delete-close"),
  deleteCancel: need<HTMLButtonElement>("#delete-cancel"),
  deleteConfirm: need<HTMLButtonElement>("#delete-confirm"),
  helpCheck: need<HTMLButtonElement>("#help-check"),
  helpCheckStatus: need<HTMLSpanElement>("#help-check-status"),
  updateMask: need<HTMLDivElement>("#update-mask"),
  updateBox: need<HTMLDivElement>("#update-box"),
  updateBody: need<HTMLParagraphElement>("#update-body"),
  updateNotes: need<HTMLDivElement>("#update-notes"),
  updateClose: need<HTMLButtonElement>("#update-close"),
  updateLater: need<HTMLButtonElement>("#update-later"),
  updateNow: need<HTMLButtonElement>("#update-now"),
  updateProgress: need<HTMLDivElement>("#update-progress"),
  updateBar: need<HTMLElement>("#update-bar"),
  updateProgressText: need<HTMLSpanElement>("#update-progress-text"),
  updateBlocked: need<HTMLParagraphElement>("#update-blocked"),
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
  /**
   * 这篇在磁盘上已经没了（外部删掉、挪走）。内容留在画布上，但自动保存停掉——
   * 用户按 Ctrl+S 才算「我要把它写回去」，那是明确表态，不该由自动保存代劳。
   */
  missing: boolean;
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
  missing: false,
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
/** 用户最后一次动笔的时刻，冲突对话框拿它跟磁盘的修改时间并排比 */
let lastEditAt: Date | null = null;

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
        // 纯移动光标（点别的格子、方向键）不会触发 onInput，得单独盯着。
        // 光标位置也一样：只靠滚动记不住「他在第几段停着」
        dom.editor.addEventListener("mouseup", () => {
          tableToolbar.refresh();
          schedulePositionSave();
        });
        dom.editor.addEventListener("keyup", () => {
          tableToolbar.refresh();
          schedulePositionSave();
        });
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
  (spaceId, node) => askDelete(spaceId, node),
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
// 遮罩挂 dom.body 不挂 dom.canvas——canvas 自己 overflow: hidden，装不下全屏层
const lightbox = new DiagramLightbox(dom.canvas, dom.body, () =>
  dom.editor.querySelector<HTMLElement>(".vditor-ir .vditor-reset"),
);
const help = new HelpPanel({
  panel: dom.helpPanel,
  close: dom.helpClose,
  version: dom.helpVersion,
});

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
  } else if (state.missing) {
    // 同理：自动保存也停了，而且原因跟冲突不一样，得让用户看得出区别
    dom.saveLabel.textContent = t().status.missing;
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
  // 时刻每次都刷：对话框要显示「你最后一次动笔是几点」，不是「什么时候开始变脏的」
  lastEditAt = new Date();
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

// ---------- 每篇上次读到哪 ----------
//
// 记的是内容锚点（见 anchor.ts）：「哪个标题 + 往下多少字」，不是像素、也不是全局字符数。
// 那两样等于记页码——AI 往文件前面插三段，页码全废，而那正是 Sheaf 的主场景。

/** 画布的滚动容器，同时也是正文根节点。锚点的取和放都以它为准 */
function scrollerEl(): HTMLElement | null {
  return dom.editor.querySelector<HTMLElement>(".vditor-ir .vditor-reset");
}

/** 当前这篇在位置表里的键。记不住的（浏览器散篇没有绝对路径）返回 null */
function currentPositionKey(): string | null {
  if (!state.file) return null;
  if (state.spaceId) {
    const index = state.spaces.findIndex((item) => item.id === state.spaceId);
    return index >= 0 ? positionKey({ kind: "space", index, path: state.path }) : null;
  }
  const abs = loosePathOf(state.file);
  return abs ? positionKey({ kind: "loose", path: abs }) : null;
}

let positionTimer = 0;

/** 现在这一刻的位置。切稿、关窗口、以及用户停下来的时候都要抓一次 */
function capturePosition(): FilePosition | null {
  const root = scrollerEl();
  if (!root) return null;
  return { scroll: captureScrollAnchor(root), cursor: captureCursorAnchor(root), at: Date.now() };
}

async function savePositionNow(): Promise<void> {
  window.clearTimeout(positionTimer);
  positionTimer = 0;
  // 载入中抓到的是上一篇的残影或者空文档，记下去等于把好记录覆盖成垃圾
  if (state.loading) return;
  const key = currentPositionKey();
  const position = key ? capturePosition() : null;
  if (key && position) await rememberPosition(key, position);
}

/**
 * 用户滚一下、点一下就记一次太吵，攒一拍再落盘。
 * 落盘而不是只存内存，是因为「关掉 Sheaf 重开还在原处」也算这个功能的一部分——
 * 指望退出时统一写，崩一次就全没了。
 */
function schedulePositionSave(): void {
  if (!ready || !state.file) return;
  window.clearTimeout(positionTimer);
  positionTimer = window.setTimeout(() => void savePositionNow(), 600);
}

/**
 * 打开一篇之后把位置放回去。
 * 必须等渲染完这一帧：setValue 是同步的，但 Vditor 的排版排到下一帧，
 * 早了量出来的高度全是错的（这是 0.1.1 恢复滚动位置时就踩过的同一条）。
 */
function restorePosition(position: FilePosition | null, focus: boolean): void {
  const apply = () => {
    const root = scrollerEl();
    if (!root) return;
    if (focus) {
      // 有记录就回记录处；没有才落到正文末尾（末尾是唯一「敲下去只会追加」的落点）
      if (position?.cursor && applyCursorAnchor(root, position.cursor)) editor.focus();
      else focusEditorEnd();
    }
    // 滚动放在最后：设光标本身会把视图带走，先滚再设等于白滚
    if (position?.scroll) applyScrollAnchor(root, position.scroll);
  };
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

/** 打开这篇时该恢复到哪。没记过就返回 null */
async function positionFor(last: LastFile): Promise<FilePosition | null> {
  try {
    return (await recallPositions())[positionKey(last)] ?? null;
  } catch (error) {
    console.warn("[Sheaf] 读不出阅读位置", error);
    return null;
  }
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
  // 磁盘上已经没有这篇了。自动保存把它悄悄重建出来，等于替用户否决了他刚做的删除；
  // 要写回去得他自己按 Ctrl+S（那条路会先把 missing 摘掉再调进来）
  if (state.missing) return false;
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
      await enterConflict();
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
    // 写盘这段时间里到达的监听事件被整批丢掉了（分不清是不是自己惹的）。
    // 补一次对表：真是外面改的就能在这里接住，是自己写的则 stamp 对得上、什么都不会发生
    if (isDesktop && !blocked) void syncCurrentFile();
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
  // 换内容之前先把「读到哪、光标在哪」记成内容锚点。
  // 这里曾经记的是 scrollTop 像素值，整篇一变长变短落点就偏
  // （实测原本在第 20 节、同步完落到第 15–18 节）——那是「记页码」，
  // 而外部改动恰恰就是在改页码。
  const before = capturePosition();
  const hadCursor = before?.cursor !== null && before?.cursor !== undefined;
  const scroller = scrollerEl();
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
    // 换完内容再按锚点滚回去。setValue 是同步的，但 Vditor 的渲染排到下一帧，早了量不准。
    // 光标只在原本就在画布里时才放回去——用户人在别的窗口，不该被抢焦点
    if (scroller && before) restorePosition(before, hadCursor);
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

/**
 * 两份各自的门面：字数、时间、开头一行。
 * 光说「两份不一样」等于让用户盲选——他多半不记得自己改过什么，
 * 更不知道外面写进去了多少。这三样是他唯一能拿来判断的依据。
 */
interface ConflictFacts {
  mineChars: number;
  mineTime: Date | null;
  mineHead: string;
  diskChars: number | null;
  diskTime: Date | null;
  diskHead: string;
}

let facts: ConflictFacts | null = null;

/** 取正文第一行有字的内容做门面，标题的 # 去掉——用户认的是那句话，不是语法 */
function headline(text: string): string {
  for (const raw of text.split("\n")) {
    const line = raw.replace(/^\s*#{1,6}\s*/, "").replace(/^\s*>\s*/, "").trim();
    if (line) return line;
  }
  return "";
}

function clock(at: Date | null): string {
  return at ? `${two(at.getHours())}:${two(at.getMinutes())}` : t().conflict.unknownTime;
}

async function enterConflict(): Promise<void> {
  state.conflict = true;
  window.clearTimeout(saveTimer);
  renderStatus();
  const mine = editor.getValue();
  facts = {
    mineChars: countChars(mine),
    mineTime: lastEditAt,
    mineHead: headline(mine),
    diskChars: null,
    diskTime: null,
    diskHead: "",
  };
  // 多读一次磁盘只发生在冲突这一刻，不在自动保存的热路径上；
  // 读不出来也照样把框弹出来，缺的那半边显示占位，绝不能因此把决定卡住
  const handle = state.file;
  try {
    if (!handle) throw new Error("no file");
    const disk = await readText(handle);
    facts.diskChars = countChars(disk.text);
    facts.diskHead = headline(disk.text);
  } catch (error) {
    console.error("[Sheaf] 读磁盘版本失败", error);
  }
  const stamp = await readStamp(state.file);
  facts.diskTime = stamp.mtime > 0 ? new Date(stamp.mtime) : null;
  showConflict();
}

/** 拼出来的那几句静态 data-i18n 覆盖不到，切语言时要单独重刷 */
function renderConflictBody(): void {
  const dict = t().conflict;
  dom.conflictFile.textContent = state.name || t().status.noFile;
  if (!facts) return;
  dom.conflictMineMeta.textContent = dict.mineMeta(
    facts.mineChars.toLocaleString(),
    clock(facts.mineTime),
  );
  dom.conflictMineHead.textContent = facts.mineHead || dict.emptyHead;
  dom.conflictDiskMeta.textContent = dict.diskMeta(
    facts.diskChars === null ? "—" : facts.diskChars.toLocaleString(),
    clock(facts.diskTime),
  );
  dom.conflictDiskHead.textContent = facts.diskHead || dict.emptyHead;
}

/**
 * 弹框时焦点落在**对话框本身**，绝不落在某个选项按钮上。
 *
 * 2026-08-25 真机翻车过：原先是 conflictKeepMine.focus()，
 * 而这批把「切回窗口才发现冲突」改成了「外面一改就弹」——
 * 用户正连续打字时框弹出来，下一个空格/回车正好落在那个已聚焦的按钮上，
 * 等于替他按了「保留我的、覆盖磁盘」。他一个字都没看见就把外部改动丢了。
 * 这正是这个框当初返工要消灭的东西：盲选。
 *
 * 焦点给容器（tabindex="-1"）：Esc 照常关，Tab 照常能走到按钮，
 * 但必须是一次**明确的**操作才选得动。
 */
function showConflict(): void {
  renderConflictBody();
  dom.conflictMask.hidden = false;
  dom.conflictBox.focus();
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
    await enterConflict();
    return;
  }
  if (await reloadFromDisk()) editor.tip(t().conflict.reloaded, 3000);
}

// ---------- 应用内更新 ----------
//
// 判断逻辑（能不能装、为什么不能）在 src/update.ts，有测试。这里只负责接线。

/**
 * 从清单里挑出这一版的改动说明。
 *
 * `notes` 是更新器的官方字段（英文），`notesZh` 是我们自己加在 latest.json 里的，
 * 官方 API 不认识它，但整份原始 JSON 通过 `rawJson` 暴露给了 JS 侧。
 * 中文界面优先中文那份；清单是旧格式（没有 notesZh）就退回英文，不至于一片空白。
 */
function pickNotes(update: Update): string {
  const zh = update.rawJson?.notesZh;
  if (currentLang() === "zh" && typeof zh === "string" && zh.trim()) return zh;
  return update.body ?? "";
}

const updatePrompt = new UpdatePrompt(
  {
    mask: dom.updateMask,
    box: dom.updateBox,
    body: dom.updateBody,
    notes: dom.updateNotes,
    close: dom.updateClose,
    later: dom.updateLater,
    now: dom.updateNow,
    progress: dom.updateProgress,
    bar: dom.updateBar,
    progressText: dom.updateProgressText,
    blocked: dom.updateBlocked,
  },
  () => ({
    body: t().update.body,
    notes: pickNotes,
    progress: t().update.progress,
    blocked: {
      conflict: t().update.blockedConflict,
      missing: t().update.blockedMissing,
      unsaved: t().update.blockedUnsaved,
    },
    failed: t().update.failed,
  }),
  runUpdate,
);

/**
 * 「现在更新」按下去之后的整条路。
 *
 * 第一步就是落盘，而且它的结果说了算——因为 install() 在 Windows 上是
 * `std::process::exit(0)`（见 src/update.ts 顶部的注释），进程会被硬杀，
 * 画布上没写回磁盘的东西一个字都不会留下来。这不是「保险起见先存一下」，
 * 这是这条路上唯一的闸。
 *
 * 返回被拦下的原因；一路通到底的话这个函数根本不会返回——进程已经没了。
 */
async function runUpdate(
  update: Update,
  onProgress: (p: DownloadProgress) => void,
): Promise<BlockReason | "failed" | null> {
  const saved = await save();
  const verdict = canInstallNow({
    conflict: state.conflict,
    missing: state.missing,
    saved,
  });
  if (!verdict.ok) return verdict.reason;

  try {
    // download 和 install 分开而不是用 downloadAndInstall：
    // 这样进度条走完了才退出，慢网下用户看得见东西在动，不会以为卡死
    let received = 0;
    let total: number | null = null;
    await update.download((event) => {
      if (event.event === "Started") total = event.data.contentLength ?? null;
      else if (event.event === "Progress") received += event.data.chunkLength;
      onProgress({ received, total });
    });
    // 下载这段时间里用户可能又敲了字（框是模态的，但外部改动、定时器都还活着）。
    // 再落一次盘，代价是一次写入，收益是不丢那几个字
    if (!(await save())) return "unsaved";
    await update.install();
    // Windows 上到不了这行。macOS / Linux 将来要在这里自己重启
    return null;
  } catch (error) {
    console.error("[Sheaf] 更新失败", error);
    return "failed";
  }
}

/** 启动时那一次。失败完全静默——断网时弹「更新检查失败」，等于跟「离线也能用」自相矛盾 */
async function checkUpdateOnStart(): Promise<void> {
  const result = await checkForUpdate();
  if (result.kind === "update") updatePrompt.show(result.update);
}

/** 帮助面板里的检查结果。写在面板自己身上，不走 editor.tip() —— 理由见 index.html 那处注释 */
let checkStatusTimer = 0;

/**
 * `sticky` 用于「正在检查更新…」这种过渡态：它得一直挂着直到有结果。
 * 跟终态一样定时消失的话，网络慢一点就会中途自己闪没、过一会儿又冒出个结论，
 * 看着像刚才那次点击失败了。
 */
function showCheckStatus(text: string, sticky = false): void {
  window.clearTimeout(checkStatusTimer);
  dom.helpCheckStatus.textContent = text;
  dom.helpCheckStatus.hidden = false;
  if (sticky) return;
  checkStatusTimer = window.setTimeout(() => {
    dom.helpCheckStatus.hidden = true;
  }, 6000);
}

/** 帮助面板里那个按钮。跟启动检查相反，三种结局都要有反馈——用户明确点了，没反应比报错更糟 */
async function checkUpdateManually(): Promise<void> {
  dom.helpCheck.disabled = true;
  showCheckStatus(t().update.checking, true);
  try {
    const result = await checkForUpdate();
    if (result.kind === "update") {
      // 有新版才关面板：更新框是模态的，两个一起开会打架
      dom.helpCheckStatus.hidden = true;
      help.hide();
      updatePrompt.show(result.update);
    } else if (result.kind === "current") {
      showCheckStatus(t().update.upToDate);
    } else {
      console.warn("[Sheaf] 查更新失败", result.error);
      showCheckStatus(t().update.checkFailed);
    }
  } finally {
    dom.helpCheck.disabled = false;
  }
}

dom.helpCheck.addEventListener("click", () => void checkUpdateManually());

// ---------- 实时监听 ----------
//
// ①② 走的是「切回窗口才对表」，这一段把它升级成「外面一改就对表」。
// 判断谁变了、变没变，仍然复用上面那一套（stamp + 冲突框），不另起一份逻辑。

const watcher = new DirWatcher((paths) => void onDiskEvents(paths));

/** 当前这篇在磁盘上的绝对路径。浏览器句柄没有路径，返回 null */
function currentPath(): string | null {
  return state.file ? loosePathOf(state.file) : null;
}

/** 正在等磁盘安静。同一时刻只等一轮，否则并发的等待会各刷各的 */
let settling = false;

/**
 * 等到磁盘连续一小会儿没再变，才认为对面写完了。
 *
 * 判据是磁盘状态本身，不是「攒够多少毫秒」——真实写入间隔不固定，
 * 攒多久都可能正好被绕过（第一次实现就是这么翻的车：JS 侧攒 120ms，
 * 而事件批次约 150ms 一到，等于每批都独立触发一次重渲染）。
 *
 * 中途用户切了稿就放弃：再等下去也是拿旧路径的状态去决定新稿子的死活。
 */
async function waitForQuiet(path: string): Promise<void> {
  const startedAt = Date.now();
  let last = await readStamp(state.file);
  for (;;) {
    const step = settleStep(Date.now() - startedAt);
    // 对面一直写个不停也不能永远不显示，到上限就先刷一次，
    // 后面还有事件的话下一轮再刷
    if (step.verdict === "go") return;
    await new Promise((resolve) => window.setTimeout(resolve, step.waitMs));
    if (!samePath(currentPath(), path)) return;
    const now = await readStamp(state.file);
    if (!stampChanged(last, now)) return;
    last = now;
  }
}

/**
 * 要盯哪些目录。**盯目录不盯文件**：AI 改文件常用「先写临时文件、再改名盖过来」，
 * 盯着那个文件本身会跟丢、还会误报「文件没了」。
 * 顺带，盯住工作区根目录才知道 AI 什么时候新建了一篇（左栏要冒出来）。
 */
function watchTargets(): WatchTarget[] {
  const targets: WatchTarget[] = [];
  for (const space of state.spaces) {
    if (space.handle.path) targets.push({ path: space.handle.path, recursive: true });
  }
  // 散篇不在任何工作区里，得单独盯它所在的那一层
  const abs = state.spaceId ? null : currentPath();
  const dir = abs ? parentDir(abs) : null;
  if (dir && !targets.some((item) => samePath(item.path, dir))) {
    targets.push({ path: dir, recursive: false });
  }
  return targets;
}

/** 工作区列表或当前这篇变了就重挂。桌面壳独有——浏览器那边没有这个能力 */
function refreshWatchers(): void {
  if (!isDesktop) return;
  void watcher.apply(watchTargets());
}

let rescanTimer = 0;

/**
 * 左栏刷新攒一拍再做：全目录重扫比对表贵得多，AI 连着写十个文件不该扫十遍。
 * 只刷新列表，**不自动切**过去——用户正在写的那篇不能被别人的动作顶掉。
 */
function scheduleTreeRefresh(): void {
  window.clearTimeout(rescanTimer);
  rescanTimer = window.setTimeout(() => {
    void (async () => {
      for (const space of state.spaces) {
        try {
          await rescan(space);
        } catch (error) {
          console.warn("[Sheaf] 重扫文件夹失败", space.tree.name, error);
        }
      }
    })();
  }, 600);
}

/**
 * 一批监听事件到手。
 *
 * 事件类型一概不信，只当作「该去看一眼了」的信号——同一个动作在 Windows 上
 * 有时报 modify、有时报 remove+create，认类型必翻车。真相一律由 stat 给。
 */
async function onDiskEvents(paths: string[]): Promise<void> {
  if (!ready) return;
  const target = currentPath();
  if (hitsWatchedFile(paths, target)) {
    await syncCurrentFile();
  }
  // 别的稿子动了（AI 新建、改名、删除）→ 左栏要跟上。
  // 过滤一道再重扫：AI 落盘路上的临时文件（a.md.tmp）和插图（images/x.png）
  // 都不该触发一次全目录递归扫描——左栏本来也只列 .md
  if (paths.some((path) => !samePath(path, target) && affectsTree(path))) {
    scheduleTreeRefresh();
  }
}

/**
 * 当前这篇被外面动过了，去看一眼到底怎么了。
 *
 * 「看不见」不等于「没了」：改名替换那一瞬间有个真实空窗——旧的已经拿走、
 * 新的还没放上。这时候下结论就会把用户正开着的稿子判成「文件没了」，
 * 是这个功能最容易翻车的地方。所以先等（missingStep 说了算），等够了才认。
 */
async function syncCurrentFile(startedAt = Date.now()): Promise<void> {
  // 自己刚写完盘也会触发监听。写盘期间来的事件一律不处理，
  // 写完那一下 doSave 会把 stamp 换成自己写出来的样子，下一次对表自然对得上
  if (state.saving || state.loading || state.conflict) return;
  const path = currentPath();
  if (!path) return;

  const alive = await fileHandleIfExists(path);
  if (alive) {
    if (state.missing) {
      // 之前判过「没了」，现在它回来了（多半就是改名替换完成）——恢复正常
      state.missing = false;
      renderStatus();
    }
    // 对面可能还在连着写（AI 流式落盘）。这时候每来一次事件就整篇重渲染一次，
    // 画面就是在抖——2026-08-25 真机实测过，7 秒内刷了约 46 次。
    // 所以先等磁盘安静下来，再一次性显示
    if (settling) return;
    settling = true;
    try {
      await waitForQuiet(path);
      await guardedCheck();
    } finally {
      settling = false;
    }
    return;
  }

  const step = missingStep(Date.now() - startedAt);
  if (step.verdict === "wait") {
    window.setTimeout(() => void syncCurrentFile(startedAt), step.retryInMs);
    return;
  }
  if (state.missing) return;
  // 内容留在画布上不动，只停掉自动保存。清空画布等于替用户丢稿
  state.missing = true;
  renderStatus();
  editor.tip(t().tip.fileMissing, 8000);
}

/**
 * 按 Ctrl+S 把已经不在磁盘上的这篇重新写回去。
 *
 * 这是全流程里唯一一处会把被删的文件重建出来的地方，而且必须由用户主动按下——
 * 自动保存代劳等于替他否决刚做的删除。
 * 先把 missing 摘掉再走正常保存：doSave 里那道 missing 闸就是专门拦自动保存的。
 * dirty 也要置真，否则 doSave 看见「没改过」会直接说「已经一致」然后什么都不写。
 */
async function restoreMissingFile(): Promise<void> {
  state.missing = false;
  state.dirty = true;
  // 磁盘上已经没有那份了，旧凭据留着只会让安全闸把这次写入误判成「外面有人改过」
  state.stamp = UNKNOWN_STAMP;
  renderStatus();
  if (await save()) editor.tip(t().tip.fileRestored, 4000);
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
  refreshWatchers();

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
  // 移出列表就别再盯着它了，否则那个文件夹一动还会触发一轮无谓的重扫
  refreshWatchers();
  editor.tip(t().tip.removedFromList(gone.tree.name), 4000);
}

// ---------- 删除文件 ----------
//
// 全应用唯一一处会动用户磁盘文件的地方。三条规矩钉死：
// 确认挡在真删之前；进回收站不永久删；删完不能把它又写回去。
// 最后那条不是多虑，见下面 doDelete 里的注释。

/** 正等着用户确认的那一篇。null = 框没开着 */
let pendingDelete: { spaceId: string; node: FileNode } | null = null;

function askDelete(spaceId: string, node: FileNode): void {
  pendingDelete = { spaceId, node };
  dom.deleteFile.textContent = node.path || node.name;
  dom.deleteFailed.hidden = true;
  dom.deleteMask.hidden = false;
  // 焦点给容器不给按钮，跟冲突框同一条规矩：用户正在打字时不能让一个空格
  // 就替他按下「移到回收站」。Tab 一下就能走到按钮，但那是明确操作
  dom.deleteBox.focus();
}

function hideDelete(): void {
  dom.deleteMask.hidden = true;
  pendingDelete = null;
}

/**
 * 真删。顺序是有讲究的，换一步就出错：
 *
 * 1. **先算接班的是谁**——判据是「它原来排在谁后面」，等重扫完那一篇已经不在树里了。
 * 2. 挪进回收站。失败就地报错、什么都不动，框留着让用户看见原因。
 * 3. **删的正好是画布上这篇的话，先把 state.file / dirty 清掉，再切下一篇。**
 *    不清的话 doOpenFile 开头那道「切走前先保存上一篇」会照常跑，
 *    而它写的就是刚删掉的那个句柄——文件会被原封不动地写回磁盘，删了等于没删。
 *    顺带这也让 savePositionNow() 拿不到 key，不会给一篇已经不存在的稿子记位置。
 * 4. 重扫左栏。手动扫而不是等 watch：watch 有 600ms 防抖，那一行赖着不走看着像坏了，
 *    而且浏览器模式压根没有 watch。稍后 watch 那次重扫是同一份结果，幂等。
 *
 * 用户在这篇里有没有没保存的改动，这里**不额外拦一道**——
 * 「删掉」本身就是「这篇我不要了」，再问一次是把决定推回给已经做完决定的人。
 */
async function doDelete(): Promise<void> {
  if (!pendingDelete) return;
  const { spaceId, node } = pendingDelete;
  const space = state.spaces.find((item) => item.id === spaceId);
  if (!space) {
    hideDelete();
    return;
  }
  const abs = loosePathOf(node.handle);
  if (!abs) {
    dom.deleteFailed.textContent = t().del.failed;
    dom.deleteFailed.hidden = false;
    return;
  }

  const successor = nextAfterDelete(space.tree, node.path);
  const wasCurrent = state.spaceId === spaceId && state.path === node.path;

  try {
    await moveToTrash(abs);
  } catch (error) {
    // 原因原文只进控制台：可能是 Windows 的英文错误串，给用户看没有意义
    console.error("[Sheaf] 移到回收站失败", abs, error);
    dom.deleteFailed.textContent = t().del.failed;
    dom.deleteFailed.hidden = false;
    return;
  }

  const name = node.name;
  hideDelete();

  if (wasCurrent) {
    // 见上面第 3 条：这两行必须在 openFile 之前。
    // 拆掉任意一行都会复现「树里删了、磁盘上还在，而且带着刚敲的字」——2026-08-27 实测过
    state.file = null;
    state.dirty = false;
  }

  await rescan(space);

  if (wasCurrent) {
    if (successor) {
      await openFile(spaceId, successor);
    } else {
      // 整个工作区被删空了：清空画布，不留一篇指向已删文件的半截状态
      images.reset();
      setDoc(null, "", "", "");
      editor.setValue("", true);
      tree.setActive(null, null);
      refreshMeta();
      refreshWatchers();
    }
  }

  editor.tip(t().del.done(name), 4000);
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
  state.missing = false;
  lastEditAt = null;
  facts = null;
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

/**
 * focus=true 只给「从外面双击进来」那条路用：那种人下一步就是想写字。
 * 点左栏切稿不给焦点——他可能只是想扫一眼。
 */
function openFile(spaceId: string, node: FileNode, focus = false): Promise<void> {
  // 换稿子了，灯箱里那张图属于上一篇。外部改动触发的重载不走这里，那种情况不该抢走用户正看的图
  lightbox.close();
  const run = () => doOpenFile(spaceId, node, focus);
  openChain = openChain.then(run, run);
  return openChain;
}

async function doOpenFile(spaceId: string, node: FileNode, focus = false): Promise<void> {
  // 上一篇没存成功就别切走，否则那些改动会被 setValue 直接盖掉
  if (state.dirty && state.file && !(await save())) {
    editor.tip(t().tip.unsavedBeforeSwitch, 5000);
    return;
  }
  // 切走之前把上一篇读到哪记下来，切回来才回得到原处
  await savePositionNow();
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
    let position: FilePosition | null = null;
    if (index >= 0) {
      const last: LastFile = { kind: "space", index, path: node.path };
      await rememberLastFile(last);
      position = await positionFor(last);
    }
    // 上次读到哪就回到哪
    restorePosition(position, focus);
  } catch (error) {
    console.error("[Sheaf] 打开失败", error);
    editor.tip(t().tip.openFailed, 3000);
  } finally {
    state.loading = false;
    refreshMeta();
    renderStatus();
    // 从散篇切回工作区里的篇时，要盯的目录变了
    refreshWatchers();
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
 * 一个绝对路径落在哪个已挂载的工作区里。找不到就是真散篇。
 * 只有桌面壳的工作区句柄带 path，浏览器句柄没有，所以浏览器下这里一律返回 null。
 */
function locateInSpaces(abs: string): { spaceId: string; node: FileNode } | null {
  for (const space of state.spaces) {
    const root = space.handle.path;
    if (!root) continue;
    const rel = relativePathInside(root, abs);
    if (!rel) continue;
    const node = findFile(space.tree, rel);
    if (node) return { spaceId: space.id, node };
  }
  return null;
}

/**
 * 打开一篇不属于任何工作区的稿子（顶栏「打开单篇」，或直接拖一个 .md 进来）。
 * 单开、选择器、拖拽三条路都走这里——之前每条路各写一遍，
 * 8 月 15 号就是在其中一条上漏了编码保护和 images.reset() 的时序，丢过稿。
 */
async function openLooseFile(handle: FileHandle, focus = false): Promise<void> {
  lightbox.close();
  // 这一篇可能其实就躺在某个已挂载的工作区里——双击、拖拽、单开三条路都可能撞上。
  // 撞上了就得按「工作区里的那篇」开：左栏才会高亮，图片才按相对路径找得到，
  // 记忆也才会记成工作区那种。留在散篇这条路上 spaceId / path 是空的，
  // 那篇里所有相对路径的图会全变裂图——这条比不高亮严重得多。
  const abs = loosePathOf(handle);
  const inSpace = abs ? locateInSpaces(abs) : null;
  if (inSpace) {
    await openFile(inSpace.spaceId, inSpace.node, focus);
    return;
  }
  if (state.dirty && state.file && !(await save())) {
    editor.tip(t().tip.unsavedBeforeOpen, 5000);
    return;
  }
  await savePositionNow();
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
    // 记住这一篇，下次开 Sheaf 回到它。拿不到绝对路径（浏览器句柄）就不记——
    // 记了也开不回来，反而会把工作区里那篇正常的记忆顶掉
    const loosePath = loosePathOf(handle);
    const last: LastFile | null = loosePath ? { kind: "loose", path: loosePath } : null;
    if (last) await rememberLastFile(last);
    restorePosition(last ? await positionFor(last) : null, focus);
  } catch (error) {
    console.error("[Sheaf] 打开失败", error);
    editor.tip(t().tip.openFailed, 3000);
  } finally {
    // 必须复位：loading 卡住会让整个会话不再触发自动保存，而状态栏还显示「已保存」
    state.loading = false;
    refreshMeta();
    renderStatus();
    // 散篇盯的是它所在的那一层目录，换了一篇就得改盯别处
    refreshWatchers();
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

// 兜底：dragleave 只认「鼠标离开了整个窗口」这一种收场，拖拽在窗口内部结束时它不响。
// 页面内部发起的拖拽（在灯箱里拖图、拖一段选区）就是这种，提示层会一直挂着挡住正文。
// dragend 在拖拽源上一定会触发，无论最后是放下了还是取消了。
window.addEventListener("dragend", () => setDropActive(false));

window.addEventListener(
  "drop",
  (event) => {
    // 提示层是 dragover 那边开的，无论这一次放的是不是我们要的东西，落地就该收起来
    setDropActive(false);
    if (!event.dataTransfer || !hasNonImage(event.dataTransfer)) return;
    event.preventDefault();
    // 拦在捕获阶段：不然 Vditor 的图片上传处理器会抢先回一句「请选择图片文件」
    event.stopPropagation();
    const jobs = grabHandles(event.dataTransfer);
    void handleDropped(jobs);
  },
  true,
);

// ---------- 正文缩放到多大 ----------
//
// 缩放本身是 WebView2 自己做的（tauri.conf.json 的 zoomHotkeysEnabled），
// 我们一行都不接管——Ctrl+ +/-/0 和 Ctrl+滚轮全是它的。
// 但它只把比例当运行期属性，关掉重开一律回到 100%，所以「记住」这件事得自己来。
//
// 怎么知道用户现在缩到了几：devicePixelRatio = 显示器自己的缩放 × 页面缩放，
// 除掉前者就只剩后者。前者向 Tauri 现问，不靠开机时存的基准——
// 那样的话把窗口挪到另一块 DPI 不同的屏幕上，读出来的数就是错的。

/** 上一次记下的页面缩放。用来判断这次变化值不值得写盘 */
let zoomNoted = 1;

async function readZoom(): Promise<number | null> {
  try {
    const scale = await getCurrentWindow().scaleFactor();
    if (!(scale > 0)) return null;
    return window.devicePixelRatio / scale;
  } catch (error) {
    console.warn("[Sheaf] 读不出显示器缩放", error);
    return null;
  }
}

async function noteZoom(): Promise<void> {
  const next = await readZoom();
  if (next === null) return;
  // 差得太小就当没动：浮点除法带尾巴，不设门槛会一直空写盘
  if (Math.abs(next - zoomNoted) < 0.01) return;
  zoomNoted = next;
  await rememberZoom(next);
}

async function setupZoom(): Promise<void> {
  const stored = await recallZoom();
  if (stored !== null) {
    try {
      await getCurrentWebview().setZoom(stored);
      zoomNoted = stored;
    } catch (error) {
      // 恢复不了就以 100% 起，不该因此开不了机
      console.warn("[Sheaf] 恢复不了上次的缩放比例", error);
    }
  }

  // 用户一缩放，devicePixelRatio 就变。matchMedia 是唯一能听到这件事的接口，
  // 而一条 resolution 查询只对当时那个值成立，所以每次响完都要照新值重新挂一条
  let query: MediaQueryList | null = null;
  const onChange = (): void => {
    arm();
    void noteZoom();
  };
  const arm = (): void => {
    query?.removeEventListener("change", onChange);
    query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    query.addEventListener("change", onChange);
  };
  arm();
}

async function boot(): Promise<void> {
  // 排在最前面：先把比例摆正再渲染，不然开机时正文会先小后大跳一下
  if (isDesktop) await setupZoom();
  editor.setValue(t().welcome, true);
  refreshMeta();
  // 先渲染一次：没有工作区时左栏要显示引导，而不是一片空白
  pushTree();
  const handles = await recallRoots();
  if (handles.length > 0) {
    // 启动时不能弹授权框（不是用户手势），拿不到权限就把「继续上次」露出来等他点
    await restoreSpaces(handles, false);
  }
  // 双击 .md 冷启动进来的那一篇优先于「上次那篇」：它是用户此刻的明确意图。
  // 排在恢复之前领走，否则会先渲染一篇没人要的稿子再被顶掉，画面闪一下
  const openedByOs = isDesktop ? await setupOsFileOpen() : false;
  const last = await recallLastFile();
  // 散篇不挂在任何工作区上，restoreSpaces 恢复不到它，得单独开一次
  if (!openedByOs && last?.kind === "loose") {
    const handle = await fileHandleIfExists(last.path);
    // 文件已经被删了 / 挪走了 / 在拔掉的移动硬盘上，就当没记过。
    // 启动时甩一句「打开失败」，用户既修不了也不想看
    if (handle) await openLooseFile(handle);
  }
  if (isDesktop) await setupNativeFocus();
  // 查更新排在最后，还要再等几秒：启动这几百毫秒里要恢复工作区、扫目录树、
  // 读回上次那篇并复位光标，一个网络请求挤进来只会让开机更慢。
  // 用户也不需要开机第一眼就看见更新框——他打开 Sheaf 是来写字的
  if (isDesktop) window.setTimeout(() => void checkUpdateOnStart(), 3000);
}

/**
 * 聚焦编辑器，并把光标摆到正文末尾。
 *
 * 落点为什么必须是末尾、不能是开头：我们在「从外面双击进来」这条路上会主动聚焦，
 * 而 Vditor 的 focus() 落点是文档开头——那位置通常正好压在标题的第一个字前面。
 * 用户不看就敲一个字，改的是标题，两秒后自动保存直接落盘。
 * 末尾是唯一「敲下去只会追加、不会动到已有内容」的落点。
 *
 * Vditor 没有「聚焦到末尾」的 API（只有 focus()），所以自己用 Selection 摆。
 *
 * 现在这条只是兜底：这篇要是记过上次的光标位置，restorePosition 会先用那个，
 * 轮不到这里。没记过（第一次打开）才落末尾——「双击进来就滚到底」那个副作用
 * 由此消掉，同时保住「敲下去只会追加」这条安全性。
 */
function focusEditorEnd(): void {
  editor.focus();
  const reset = dom.editor.querySelector<HTMLElement>(".vditor-ir .vditor-reset");
  if (!reset) return;
  const range = document.createRange();
  range.selectNodeContents(reset);
  // false = 折叠到末端
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  // 程序设的 selection 浏览器不保证滚进视野，长文里光标会停在屏幕外
  reset.lastElementChild?.scrollIntoView({ block: "end" });
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
async function setupOsFileOpen(): Promise<boolean> {
  const openPath = async (path: string) => {
    // 从外面双击进来的人，下一步就是想写字。
    // Rust 那边的 bring_to_front 只负责把窗口提到前台——窗口有焦点不等于正文有光标，
    // 所以这里要主动把光标放进去（focus=true）。
    // 落点交给 restorePosition 判：这篇记过位置就回记录处，没记过才落正文末尾。
    await openLooseFile(fileHandleFromPath(path), true);
  };

  await listen<string>("open-file", (event) => void openPath(event.payload));

  const pending = await invoke<string | null>("take_pending_file");
  if (!pending) return false;
  // 这一次要等它开完：boot 得据此决定还要不要恢复「上次那篇」
  await openPath(pending);
  return true;
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
  refreshWatchers();

  if (broken > 0) {
    editor.tip(t().tip.restoreBroken(broken), 7000);
  }

  // 上次开的是散篇的话，这里就别抢着开工作区里的第一篇：一来会闪一下再被 boot 顶掉，
  // 二来 doOpenFile 会顺手把「上次那篇」的记忆改写成工作区那篇，散篇就再也回不来了
  if (last?.kind === "loose") return;

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
    // 滚到哪就记到哪。函数内部攒一拍才落盘，不是每帧都写
    schedulePositionSave();
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
  lightbox.close();
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
    else if (state.missing && state.file) void restoreMissingFile();
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
/**
 * 「先不决定」这一路要把焦点还给正文。
 * 弹框时焦点被收走了（见 showConflict），不还回去的话用户得先点一下正文才能接着写——
 * 而他多半正是被这个框打断在半句话中间的。
 * 只有这三条明确关闭的路才还，setDoc 里那次 hideConflict 不还：换稿子时抢焦点是另一种冒犯。
 */
function dismissConflict(): void {
  hideConflict();
  if (state.writable) editor.focus();
}

dom.conflictLater.addEventListener("click", () => dismissConflict());
dom.conflictClose.addEventListener("click", () => dismissConflict());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !dom.conflictMask.hidden) dismissConflict();
});

dom.deleteConfirm.addEventListener("click", () => void doDelete());
dom.deleteCancel.addEventListener("click", () => hideDelete());
dom.deleteClose.addEventListener("click", () => hideDelete());
// 点遮罩空白处也算取消。删除框跟冲突框不同：冲突是「必须选一个」，
// 删除是「不选就等于不删」，所以出路给得越多越好
dom.deleteMask.addEventListener("mousedown", (event) => {
  if (event.target === dom.deleteMask) hideDelete();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !dom.deleteMask.hidden) {
    // 别让这一下 Esc 顺带被查找框、灯箱之类的也收走
    event.stopPropagation();
    hideDelete();
  }
});
dom.saveLabel.addEventListener("click", () => {
  if (state.conflict) showConflict();
});

window.addEventListener("beforeunload", (event) => {
  // 关窗口前把位置落一次盘。「关掉 Sheaf 重开还在原处」也算这功能的一部分，
  // 而攒着的那一拍可能还没到点。这里只能同步发起，await 不到——
  // 平时滚动/移光标已经在持续落盘了，这一下是补最后几百毫秒的差
  void savePositionNow();
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
