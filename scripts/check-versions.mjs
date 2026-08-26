// 版本号有四个来源，必须一字不差地一致。
//
// 为什么值得单独一道闸：这四份文件各自被不同的东西读，漏改一个不会报错，只会说谎。
//   · package.json      → vite 编译期注入 __APP_VERSION__ → **帮助面板显示给用户看的那个数字**
//   · tauri.conf.json   → 打包出来的安装包版本、注册表版本、**更新器拿来比「有没有新版」的那个**
//   · Cargo.toml        → exe 的文件版本属性
//   · Cargo.lock        → 跟 Cargo.toml 对不上会让 `cargo build --locked` 直接失败
//
// 最坏的组合是前两个漂移：更新器认为自己是 0.1.4（不再提示更新），
// 帮助面板却告诉用户「你装的是 0.1.3」——用户以为没更新成功，反复去官网下载。
// 2026-08-25 干跑时正是这么撞上的（当时只改了 tauri.conf.json）。
//
// 发版流程本来就要求四份一起改，但「要求」拦不住手滑，这里让它变成硬失败。

import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

const sources = [
  ["package.json", JSON.parse(read("package.json")).version],
  ["src-tauri/tauri.conf.json", JSON.parse(read("src-tauri/tauri.conf.json")).version],
  // 只认 [package] 段里的第一个 version，别被依赖项的版本号骗了
  ["src-tauri/Cargo.toml", read("src-tauri/Cargo.toml").match(/^version\s*=\s*"([^"]+)"/m)?.[1]],
  // lock 里同名包可能不止一处，锁定 name = "sheaf" 紧跟着的那个
  [
    "src-tauri/Cargo.lock",
    read("src-tauri/Cargo.lock").match(/name\s*=\s*"sheaf"\s*\nversion\s*=\s*"([^"]+)"/)?.[1],
  ],
];

const missing = sources.filter(([, v]) => !v);
if (missing.length > 0) {
  console.error(`版本号读不出来：${missing.map(([f]) => f).join("、")}`);
  process.exit(1);
}

const distinct = [...new Set(sources.map(([, v]) => v))];
if (distinct.length > 1) {
  // 四份平等地列出来，不拿其中任何一份当「正确答案」——
  // 谁漂移了只有改的人知道，替他猜一个反而会把人指去改错文件
  console.error("版本号不一致：");
  for (const [file, v] of sources) console.error(`  ${v.padEnd(12)} ${file}`);
  console.error("\n发版要同时改这四份。漏一个不会报错，只会让界面显示的版本号和更新器认的版本号对不上。");
  process.exit(1);
}

console.log(`版本号一致：${distinct[0]}（4 处）`);
