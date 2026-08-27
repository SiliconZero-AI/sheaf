// 删掉一篇之后，该把哪一篇顶上来。
//
// 这个判定错了不会报错，只会「删完跳到一篇莫名其妙的稿子」，或者更糟——
// 返回一篇其实已经被删掉的，然后 doOpenFile 开头那道「切走前先保存上一篇」
// 会把它原封不动写回磁盘，删了等于没删。所以边界要卡死。
//
// 关键约定：**传进来的必须是删除之前的那棵树**。判据是「它原来排在谁后面」，
// 重扫之后那一篇已经不在了，无从谈起。
//
// 跑法：npm test
const { nextAfterDelete, flattenFiles } = require("./.build/fs.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

/** 造一棵树。字符串是文件，数组是 [目录名, ...孩子] */
function dir(name, path, children) {
  return { kind: "dir", name, path, handle: { kind: "directory", name, path }, children };
}
function file(name, path) {
  return { kind: "file", name, path, handle: { kind: "file", name, path } };
}
/** 只取路径，方便跟期望值比 */
function pathOf(node) {
  return node ? node.path : null;
}

// 左栏里看到的样子（scanTree 排过序：目录在前，同类按名字）：
//   稿件/
//     一.md
//     二.md
//   A.md
//   B.md
//   C.md
const tree = dir("root", "", [
  dir("稿件", "稿件", [file("一.md", "稿件/一.md"), file("二.md", "稿件/二.md")]),
  file("A.md", "A.md"),
  file("B.md", "B.md"),
  file("C.md", "C.md"),
]);

console.log("=== 摊平顺序跟左栏看到的一致 ===");

check(
  "目录里的排在同级文件前面",
  flattenFiles(tree).map((n) => n.path).join(","),
  "稿件/一.md,稿件/二.md,A.md,B.md,C.md",
);

console.log("\n=== 正常情况：接班的是紧挨着的下一篇 ===");

check("删中间一篇 → 下一篇", pathOf(nextAfterDelete(tree, "B.md")), "C.md");
check("删第一篇 → 下一篇", pathOf(nextAfterDelete(tree, "稿件/一.md")), "稿件/二.md");
// 目录里最后一篇删掉，接班的是下个目录/同级的第一篇——跟眼睛在左栏看到的顺序一致，
// 不是「同目录里找不到就返回 null」
check("删子目录里最后一篇 → 跨出目录接下去", pathOf(nextAfterDelete(tree, "稿件/二.md")), "A.md");

console.log("\n=== 排到头了：才回头取上一篇 ===");

// 取下一篇而不是上一篇，是为了「连着删几篇时手不用动」；
// 只有最后一篇没有下一篇可取，这时才回头
check("删最后一篇 → 上一篇", pathOf(nextAfterDelete(tree, "C.md")), "B.md");

console.log("\n=== 空掉了：返回 null，由调用方清空画布 ===");

const only = dir("root", "", [file("独苗.md", "独苗.md")]);
check("整个工作区只剩这一篇", pathOf(nextAfterDelete(only, "独苗.md")), null);

const nested = dir("root", "", [dir("稿件", "稿件", [file("孤.md", "稿件/孤.md")])]);
check("唯一一篇埋在子目录里", pathOf(nextAfterDelete(nested, "稿件/孤.md")), null);

console.log("\n=== 找不到：不许瞎顶一篇上来 ===");

// 不该发生（右键菜单是从树里点出来的），但真发生了宁可什么都不换，
// 也不能随便开一篇——那会让用户以为自己删错了文件
check("路径不在这棵树里", pathOf(nextAfterDelete(tree, "不存在.md")), null);
check("传的是目录的路径不是文件", pathOf(nextAfterDelete(tree, "稿件")), null);
check("空路径", pathOf(nextAfterDelete(tree, "")), null);
check("空树", pathOf(nextAfterDelete(dir("root", "", []), "A.md")), null);

console.log("\n=== 同名文件靠完整相对路径区分，不靠文件名 ===");

const dup = dir("root", "", [
  dir("甲", "甲", [file("同名.md", "甲/同名.md")]),
  dir("乙", "乙", [file("同名.md", "乙/同名.md")]),
  file("尾.md", "尾.md"),
]);
check("删甲里那份 → 接乙里那份", pathOf(nextAfterDelete(dup, "甲/同名.md")), "乙/同名.md");
check("删乙里那份 → 接同级的尾.md", pathOf(nextAfterDelete(dup, "乙/同名.md")), "尾.md");

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
