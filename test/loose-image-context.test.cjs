// 双击 / 单开一篇 .md 时，要从它所在目录找相对图片。
// 父目录算错不会丢稿，但会直接把普通的本地图显示成裂图。
//
// 跑法：npm test
const { parentPathOf } = require("./.build/fs.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

console.log("=== 散篇图片上下文：从文件绝对路径取父目录 ===");

check("Windows 反斜杠", parentPathOf("C:\\写作\\稿件\\文章.md"), "C:/写作/稿件");
check("Windows 正斜杠", parentPathOf("D:/写作/文章.md"), "D:/写作");
check("盘符根目录", parentPathOf("C:/文章.md"), "C:/");
check("UNC 共享目录", parentPathOf("\\\\server\\share\\文章.md"), "//server/share");
check("路径带空格", parentPathOf("D:/My Drafts/文章.md"), "D:/My Drafts");
check("没有父目录的相对名字", parentPathOf("文章.md"), null);
check("POSIX 根目录", parentPathOf("/文章.md"), "/");

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
