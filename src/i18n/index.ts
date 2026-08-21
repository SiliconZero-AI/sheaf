// 语言引擎：默认跟随浏览器语言，选过一次就记住（跟 src/theme.ts 的 localStorage 模式一致）。
// t() 返回当前语言的整份词典对象——调用方直接按字段取值（如 t().bar.saveLabel），
// zh.ts / en.ts 都实现同一个 Dict 接口，两边 key 缺一个就是 tsc 报错，不需要额外校验脚本。
//
// index.html 里的静态文案走 data-i18n 系列属性 + applyStaticI18n()；
// 动态拼接的文案（提示、状态栏等）直接在各模块里调 t().xxx。

import { zh } from "./zh";
import { en } from "./en";
import type { Dict, Lang } from "./types";

export type { Dict, Lang };

const KEY = "wd-lang";

const TABLES: Record<Lang, Dict> = { zh, en };

function stored(): Lang | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "zh" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

function detect(): Lang {
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

let lang: Lang = stored() ?? detect();
const listeners: Array<(lang: Lang) => void> = [];

export function currentLang(): Lang {
  return lang;
}

/** 当前语言的整份词典 */
export function t(): Dict {
  return TABLES[lang];
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // 隐私模式下存不了就只管这一次，不影响这次切换生效
  }
  for (const cb of listeners) cb(lang);
}

/** 语言变化时要重绘的模块在这里注册；main.ts 的 applyLanguage() 是最大的一个订阅者 */
export function onLangChange(cb: (lang: Lang) => void): void {
  listeners.push(cb);
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/**
 * 遍历 index.html 里标了 data-i18n 系列属性的节点，按当前语言填内容。
 * data-i18n 写 innerHTML（帮助面板文字里夹着 <code>/<strong>/<kbd>，textContent 会把标签当纯文本吃掉）；
 * data-i18n-title / data-i18n-placeholder 写对应属性。首帧启动、每次切语言都要整体跑一遍。
 */
export function applyStaticI18n(): void {
  const dict = t();
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en-US";
  document.querySelector('meta[name="description"]')?.setAttribute("content", dict.page.description);

  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const value = getByPath(dict, el.dataset.i18n ?? "");
    if (typeof value === "string") el.innerHTML = value;
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-title]")) {
    const value = getByPath(dict, el.dataset.i18nTitle ?? "");
    if (typeof value === "string") el.title = value;
  }
  for (const el of document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]")) {
    const value = getByPath(dict, el.dataset.i18nPlaceholder ?? "");
    if (typeof value === "string") el.placeholder = value;
  }
}
