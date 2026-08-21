// 语言切换按钮：只管自己的 title/aria-label。点击后 setLang() 会触发 onLangChange 的
// 全部订阅者——main.ts 的 applyLanguage() 是重绘全局 UI 的那一个，这里不重复接线。

import { currentLang, onLangChange, setLang, t } from "./i18n";

export function setupLang(button: HTMLButtonElement): void {
  const paint = (): void => {
    button.title = currentLang() === "zh" ? t().lang.toEn : t().lang.toZh;
    button.setAttribute("aria-label", button.title);
  };
  paint();
  onLangChange(paint);
  button.addEventListener("click", () => {
    setLang(currentLang() === "zh" ? "en" : "zh");
  });
}
