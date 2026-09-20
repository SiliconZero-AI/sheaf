// 拖进来的文件认不认。这道白名单判错的代价不对称：
//   该认的不认 → 用户拖一篇 .md 进来没反应，顶多再试一次；
//   不该认的认了 → 文件被当 Markdown 打开，保存时 Lute 按自己的规则整篇重写一遍，
//   原文的格式就被改掉了，而且是静默的。
//
// 2026-09-20 修的就是后一种：拖拽那边自己写了一份白名单，多带了 `.txt`，
// 于是 `.txt` 能拖进来——而左栏和文件选择器都只认 md/markdown，拖进来的那篇
// 在别处根本看不见，用户也不知道自己的 txt 已经被改写过。
// 现在扫树和拖拽共用 fs.ts 的 isMarkdown 这一份。
//
// 反向对照：把 `txt` 加回 fs.ts 的正则，下面「.txt 不认」那几条必须变 FAIL。
//
// 跑法：npm test
const { isMarkdown } = require("./.build/fs.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

console.log("=== 认的 ===");
check(".md", isMarkdown("稿子.md"), true);
check(".markdown", isMarkdown("稿子.markdown"), true);
// 系统对话框和资源管理器给回来的大小写不固定
check("大写扩展名", isMarkdown("A.MD"), true);
check("大小写混着", isMarkdown("A.MarkDown"), true);
check("文件名里有点", isMarkdown("2026.09.20 周报.md"), true);
// 只看最后一段扩展名：这篇确实是 Markdown
check("a.txt.md 认", isMarkdown("a.txt.md"), true);

console.log("\n=== 不认 ===");
// 这条是这次修的正主
check(".txt 不认", isMarkdown("笔记.txt"), false);
check(".TXT 不认", isMarkdown("笔记.TXT"), false);
// 别被前半截骗过去：真正的扩展名是 .txt
check("a.md.txt 不认", isMarkdown("a.md.txt"), false);
check(".text 不认", isMarkdown("笔记.text"), false);
check("没有扩展名不认", isMarkdown("LICENSE"), false);
check("光一个点不认", isMarkdown("md"), false);
// 图片走 Vditor 自己那条路，不该被当稿子打开
check(".png 不认", isMarkdown("图.png"), false);
// AI 落盘路上甩出来的临时文件
check(".md.tmp 不认", isMarkdown("稿子.md.tmp"), false);
check("空名字不认", isMarkdown(""), false);

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
