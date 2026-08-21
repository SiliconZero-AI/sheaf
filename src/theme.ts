// 深浅色。默认跟着系统走；点一下按钮就锁死在某一色，存进 localStorage。
// data-theme 永远是显式的 light/dark（index.html 的内联脚本在首帧前先写好，避免深色下白屏一闪）。

import { onLangChange, t } from "./i18n";

export type ThemeName = "light" | "dark";

const KEY = "wd-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** 跟 styles.css 里的 --bg 对齐：PWA 独立窗口的标题栏吃的是这个色 */
const BAR_COLOR: Record<ThemeName, string> = {
  light: "#ffffff",
  dark: "#16181d",
};

function stored(): ThemeName | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

export function currentTheme(): ThemeName {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function apply(theme: ThemeName, button: HTMLButtonElement, onChange: (theme: ThemeName) => void): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR_COLOR[theme]);
  button.title = theme === "dark" ? t().theme.toLight : t().theme.toDark;
  button.setAttribute("aria-label", button.title);
  onChange(theme);
}

/** onChange 除了点按钮，首次生效和跟随系统切换时也会叫一次 */
export function setupTheme(button: HTMLButtonElement, onChange: (theme: ThemeName) => void): void {
  apply(stored() ?? currentTheme(), button, onChange);

  // 没手动选过就一直跟着系统换，选过之后系统怎么变都不再插手
  window.matchMedia(DARK_QUERY).addEventListener("change", (event) => {
    if (stored()) return;
    apply(event.matches ? "dark" : "light", button, onChange);
  });

  // 语言切换后按钮上的中/英文提示也要跟着换
  onLangChange(() => apply(currentTheme(), button, onChange));

  button.addEventListener("click", () => {
    const next: ThemeName = currentTheme() === "dark" ? "light" : "dark";
    apply(next, button, onChange);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // 隐私模式下存不了就只管这一次，不影响使用
    }
  });
}
