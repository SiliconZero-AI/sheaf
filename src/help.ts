// 帮助面板：纯静态内容，没有 search.ts / global-search.ts 那种实时重算逻辑，
// 只是显示与隐藏。文案写在 index.html 里（跟 gs-panel 一样是静态标记），这里只管交互。

export class HelpPanel {
  constructor(
    private ui: { panel: HTMLElement; close: HTMLButtonElement; version: HTMLElement },
  ) {
    // 版本号只填一次：__APP_VERSION__ 是编译期常量，运行期不会变（见 vite.config.ts）。
    // 「版本」那个词跟着语言走，走 data-i18n；数字本身不翻译，所以不进词典。
    this.ui.version.textContent = __APP_VERSION__;
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
