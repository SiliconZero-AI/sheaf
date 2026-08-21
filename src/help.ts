// 帮助面板：纯静态内容，没有 search.ts / global-search.ts 那种实时重算逻辑，
// 只是显示与隐藏。文案写在 index.html 里（跟 gs-panel 一样是静态标记），这里只管交互。

export class HelpPanel {
  constructor(private ui: { panel: HTMLElement; close: HTMLButtonElement }) {
    this.ui.close.addEventListener("click", () => this.hide());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.ui.panel.hidden) this.hide();
    });
  }

  toggle(): void {
    if (this.ui.panel.hidden) this.show();
    else this.hide();
  }

  show(): void {
    this.ui.panel.hidden = false;
  }

  hide(): void {
    this.ui.panel.hidden = true;
  }
}
