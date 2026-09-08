// 正文里的右键菜单：剪切 / 复制 / 粘贴 / 全选。
//
// 为什么要自己做一套：WebView2 自带的那套对写作 App 是错的——「更多工具」里装着
// 另存为和打印（会把整个界面当网页存下来），「书写方向」是给阿拉伯语、希伯来语
// 切文字排列方向用的、中文英文写作永远用不上，开发版里还多一项「检查」，
// 一点就开开发者工具、露出这是个网页壳。
//
// **为什么「粘贴」非要走 Tauri 插件不可**（这条是实测出来的，不是查文档查来的）：
// - `document.execCommand("paste")`：`queryCommandSupported` 明确返回 false
// - `navigator.clipboard.readText()`：在窗口**真正聚焦**（`document.hasFocus()` 为 true）
//   的情况下**直接挂死**——两分钟不返回、不报错、也不弹权限框。
//   比明确失败还难办：明确失败还能兜底，挂死是兜不住的。
//
// 两条浏览器的路都断了，才引入 tauri-plugin-clipboard-manager（Tauri 官方插件，
// 跟项目已用的 fs / dialog / updater 同一家族）。

import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { showContextMenu, type MenuItem } from "./context-menu";
import { t } from "./i18n";

/** 外面要提供的三件事。放在外面做是因为它们都要动 Vditor */
export interface EditMenuHost {
  /** 把一段文本插到光标处（有选区就替换掉） */
  insert: (text: string) => void;
  /** 删掉当前选中的内容，并让 Vditor 知道内容变了 */
  deleteSelection: () => void;
  tip: (text: string) => void;
}

/**
 * 现在有没有选中字。剪切和复制靠它决定灰不灰。
 *
 * 光判 `isCollapsed` 不够：折叠的选区之外，还有「选了但内容是空的」那种情形
 * （比如刚点进一个空段落），那时候剪切复制同样没有意义。
 */
export function hasSelection(): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return false;
  return sel.toString().length > 0;
}

/** 菜单该长什么样。抽成纯函数是为了能测——真弹菜单那部分没法在 Node 里跑 */
export function buildEditMenu(
  picked: boolean,
  actions: { cut: () => void; copy: () => void; paste: () => void; selectAll: () => void },
): MenuItem[] {
  const d = t().edit;
  return [
    { label: d.cut, hint: "Ctrl+X", disabled: !picked, run: actions.cut },
    { label: d.copy, hint: "Ctrl+C", disabled: !picked, run: actions.copy },
    { label: d.paste, hint: "Ctrl+V", run: actions.paste },
    { label: d.selectAll, hint: "Ctrl+A", run: actions.selectAll },
  ];
}

async function doPaste(host: EditMenuHost): Promise<void> {
  let text: string | null = null;
  try {
    text = await readText();
  } catch (error) {
    // 剪贴板里是图片、是文件列表、或者正被别的程序独占时会走到这儿。
    // 原因原文只进控制台：多半是英文错误串，给用户看没有意义
    console.error("[Sheaf] 读不到剪贴板", error);
    host.tip(t().edit.pasteFailed);
    return;
  }
  // 剪贴板是空的、或者里面根本不是文本：什么都不做，也不报错。
  // 「粘贴了个寂寞」不需要一句提示来提醒用户他自己知道的事
  if (!text) return;
  host.insert(text);
}

/** 在 (x, y) 弹出正文右键菜单。坐标直接用 MouseEvent 的 clientX/clientY */
export function showEditMenu(x: number, y: number, host: EditMenuHost): void {
  showContextMenu(
    x,
    y,
    buildEditMenu(hasSelection(), {
      // **剪切不能用 execCommand("cut")。** 它在 WebView2 里返回 true、
      // 内容也确实进了剪贴板，但**选中的字一个都没删**——谎报成功。
      // （真机实测：cut 返回 true，正文一个字符没少；同一段选区用
      //  Range.deleteContents() 就删得掉。）
      // 所以拆成两步：先用 copy 把内容送进剪贴板，再自己把选区删掉。
      cut: () => {
        document.execCommand("copy");
        host.deleteSelection();
      },
      // 复制这条是好的：execCommand("copy") 真机实测返回 true，
      // 系统剪贴板里拿得到内容，而且它天然作用在当前选区上
      copy: () => void document.execCommand("copy"),
      paste: () => void doPaste(host),
      selectAll: () => void document.execCommand("selectAll"),
    }),
  );
}
