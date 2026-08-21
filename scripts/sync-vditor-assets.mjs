// Vditor 会在运行时去 unpkg 拉 lute（3.7MB，没它编辑器根本起不来）、中文语言包和图标。
// 断网就打不开，国内 unpkg 抽风就白屏。把这些搬进 public/vditor/，配合 editor.ts 里的 cdn 选项，
// 全程零外链。public/vditor/ 不进仓库，装完依赖由 npm 脚本自动生成。
//
// 只搬蓝图承诺的功能会用到的：lute、中英文语言包、图标、代码高亮、公式、Mermaid。
// mathjax / echarts / graphviz / plantuml 那些对应的是「故意不做」的清单，不搬。
// en_US.js 是中英双语（src/i18n/）用到的——Vditor 自己内部的标题下拉等文案靠它，
// 见 src/editor.ts 里 lang 选项的说明。

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "vditor", "dist");
const to = join(root, "public", "vditor", "dist");

const WANTED = [
  "js/lute/lute.min.js",
  "js/i18n/zh_CN.js",
  "js/i18n/en_US.js",
  "js/icons/ant.js",
  "js/highlight.js",
  "js/katex",
  "js/mermaid",
];

if (!existsSync(from)) {
  console.error("[Sheaf] 找不到 node_modules/vditor/dist，先 npm install");
  process.exit(1);
}

for (const item of WANTED) {
  const src = join(from, item);
  if (!existsSync(src)) {
    console.error(`[Sheaf] vditor 里没有 ${item}，版本可能变了，检查 sync-vditor-assets.mjs`);
    process.exit(1);
  }
  const dest = join(to, item);
  mkdirSync(dirname(dest), { recursive: true });
  // 只覆盖，不删旧文件：脚本不做删除动作
  cpSync(src, dest, { recursive: true });
}

console.log(`[Sheaf] Vditor 运行时资源已就位：public/vditor/dist（${WANTED.length} 项）`);
