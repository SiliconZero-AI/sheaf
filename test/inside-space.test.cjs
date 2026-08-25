// 一个绝对路径到底算不算「某个工作区里的一篇」。
// 判错的后果不对等：
//   该算工作区的判成散篇 → spaceId / 相对路径留空，那篇里所有相对路径的图全变裂图；
//   不该算的判成工作区 → 拿错文件夹去找图，同样是裂图。
// 所以两个方向都要卡死，尤其「前缀像但不是」那几种。
//
// 跑法：npm test
const { relativePathInside } = require("./.build/fs.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

console.log("=== 在里面：返回相对路径 ===");

check("正斜杠", relativePathInside("D:/sheaf-test", "D:/sheaf-test/A.md"), "A.md");
check("子目录", relativePathInside("D:/sheaf-test", "D:/sheaf-test/稿件/草稿.md"), "稿件/草稿.md");
// 系统对话框和双击 .md 递过来的都是反斜杠，扫树时拼的是正斜杠，两边必须能对上
check("反斜杠的绝对路径", relativePathInside("D:/sheaf-test", "D:\\sheaf-test\\A.md"), "A.md");
check("反斜杠的根", relativePathInside("D:\\sheaf-test", "D:\\sheaf-test\\A.md"), "A.md");
check("根带尾巴分隔符", relativePathInside("D:/sheaf-test/", "D:/sheaf-test/A.md"), "A.md");
// Windows 不区分大小写，但返回的相对路径要原样——findFile 拿它逐字比对扫树时记的 path
check("盘符大小写不同也算在里面", relativePathInside("d:/Sheaf-Test", "D:/sheaf-test/A.md"), "A.md");
check("返回的相对路径不改大小写", relativePathInside("D:/x", "D:/x/MyDraft.MD"), "MyDraft.MD");

console.log("\n=== 不在里面：一律 null ===");

// 这条最容易写错：光比前缀不卡分隔符的话，note 会把 notebook 认成自己的
check("前缀像但不是同一个文件夹", relativePathInside("D:/note", "D:/notebook/a.md"), null);
check("完全是别的盘", relativePathInside("D:/x", "E:/x/a.md"), null);
check("是根目录自己，不是里面的文件", relativePathInside("D:/x", "D:/x"), null);
check("反过来：根比文件路径还长", relativePathInside("D:/x/y/z", "D:/x/a.md"), null);
check("根是空字符串（浏览器句柄没有 path）", relativePathInside("", "D:/x/a.md"), null);

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
