// 光标进表格就浮出加行/加列/删行/删列的按钮条。
//
// Vditor 只在 WYSIWYG 模式给了这套可视化操作（挂在它自己的 popover 上），
// IR 模式（我们锁死用的那个）只有隐藏快捷键：Ctrl+= 下方加行、Ctrl+Shift+= 右侧加列，
// Ctrl+- 删行、Ctrl+Shift+- 删列。这套底层逻辑是现成、测过的（fixTable），
// 所以按钮点击时不重新拼表格的 Markdown，而是模拟发一个对应快捷键的 keydown 事件到
// 编辑器上，复用 Vditor 自己的处理——已用 Playwright 验证过这条路走得通
// （dispatchEvent 后 event.defaultPrevented 为 true，表格结构确实按预期变化）。
//
// 按钮条不挂进 Vditor 的 contenteditable 树：那棵树是它自己管的 DOM，
// 序列化成 Markdown 时不认识外来节点，插进去风险太大。改成挂在画布的非编辑容器里，
// 用 getBoundingClientRect 对齐表格位置，光标一移开表格就收起来。

import { line } from "./icons";
import { onLangChange, t } from "./i18n";

interface Action {
  titleKey: keyof ReturnType<typeof t>["tableToolbar"];
  icon: string;
  key: string;
  code: string;
  shiftKey: boolean;
}

const ACTIONS: Action[] = [
  { titleKey: "insertRowBelow", icon: line("row-plus"), key: "=", code: "Equal", shiftKey: false },
  { titleKey: "insertColumnRight", icon: line("col-plus"), key: "+", code: "Equal", shiftKey: true },
  { titleKey: "deleteRow", icon: line("row-minus"), key: "-", code: "Minus", shiftKey: false },
  { titleKey: "deleteColumn", icon: line("col-minus"), key: "_", code: "Minus", shiftKey: true },
];

export class TableToolbar {
  private readonly bar: HTMLDivElement;
  private readonly buttons: { el: HTMLButtonElement; action: Action }[] = [];

  constructor(
    /** 定位参照系：画布卡片，position: relative，按钮条相对它摆放 */
    private readonly host: HTMLElement,
    /** Vditor 的 contenteditable 元素——光标在哪张表里靠它判断，快捷键事件也发去它身上 */
    private readonly getEditorElement: () => HTMLElement | null,
  ) {
    this.bar = document.createElement("div");
    this.bar.className = "wd-table-toolbar";
    this.bar.hidden = true;
    for (const action of ACTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-btn wd-table-toolbar__btn";
      button.title = t().tableToolbar[action.titleKey];
      button.innerHTML = action.icon;
      // mousedown 先拦住：按钮不在编辑区里，点击默认会抢走焦点，
      // 编辑器里「光标在哪个格子」这份选区信息就没了，快捷键事件也就找不到该改哪一行/列
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => this.fire(action));
      this.bar.append(button);
      this.buttons.push({ el: button, action });
    }
    host.append(this.bar);

    onLangChange(() => {
      for (const { el, action } of this.buttons) el.title = t().tableToolbar[action.titleKey];
    });
  }

  private fire(action: Action): void {
    const editorElement = this.getEditorElement();
    if (!editorElement) return;
    editorElement.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: action.key,
        code: action.code,
        ctrlKey: true,
        shiftKey: action.shiftKey,
        bubbles: true,
        cancelable: true,
      }),
    );
    // 表格结构变了（多一行/少一列），位置跟着重算
    this.refresh();
  }

  /** 光标移动、输入、滚动之后都调一下：判断在不在表格里，不在就收起来 */
  refresh(): void {
    const editorElement = this.getEditorElement();
    const selection = window.getSelection();
    const anchor =
      editorElement && selection && editorElement.contains(selection.anchorNode)
        ? selection.anchorNode
        : null;
    const anchorElement = anchor
      ? anchor.nodeType === Node.ELEMENT_NODE
        ? (anchor as Element)
        : anchor.parentElement
      : null;
    const table = anchorElement?.closest("td, th")?.closest("table") ?? null;
    if (!table) {
      this.bar.hidden = true;
      return;
    }
    const hostRect = this.host.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    this.bar.hidden = false;
    this.bar.style.top = `${tableRect.top - hostRect.top - this.bar.offsetHeight - 4}px`;
    this.bar.style.left = `${tableRect.right - hostRect.left - this.bar.offsetWidth}px`;
  }

  hide(): void {
    this.bar.hidden = true;
  }
}
