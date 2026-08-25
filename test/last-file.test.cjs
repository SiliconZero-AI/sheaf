// 「上次打开的那篇」的格式识别。守着两条：
//   ① 老用户升上来，上次那篇不能丢——历史上存过两种格式，都得认；
//   ② 散篇（不属于任何工作区的一篇）要能被记住，这是 0.1.2 新加的。
//
// 判错的后果：认错格式 → 启动时开错文件或干脆不开，用户以为稿子没了。
// 认不出来一律回 null（落到欢迎页），总好过拿半残记录去开文件。
//
// 跑法：npm test
const { parseLastFile } = require("./.build/fs.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

console.log("=== 老格式必须认得（认不出＝老用户升级即丢「上次那篇」）===");

check("最早的纯字符串路径", parseLastFile("稿件/草稿.md"), {
  kind: "space",
  index: 0,
  path: "稿件/草稿.md",
});
check("没有 kind 字段的 { index, path }", parseLastFile({ index: 2, path: "a.md" }), {
  kind: "space",
  index: 2,
  path: "a.md",
});
check("有 path 没 index：当第一个工作区", parseLastFile({ path: "a.md" }), {
  kind: "space",
  index: 0,
  path: "a.md",
});

console.log("\n=== 新格式 ===");

check("工作区内的一篇", parseLastFile({ kind: "space", index: 1, path: "b.md" }), {
  kind: "space",
  index: 1,
  path: "b.md",
});
check("散篇：记绝对路径，没有 index", parseLastFile({ kind: "loose", path: "D:/x/A.md" }), {
  kind: "loose",
  path: "D:/x/A.md",
});
check(
  "散篇即使混进了 index 也不当工作区那种",
  parseLastFile({ kind: "loose", index: 3, path: "D:/x/A.md" }),
  { kind: "loose", path: "D:/x/A.md" },
);

console.log("\n=== 认不出来的一律 null，不猜 ===");

check("从来没存过", parseLastFile(undefined), null);
check("存的是 null", parseLastFile(null), null);
check("空字符串（存过但被清空）", parseLastFile(""), null);
check("对象里没有 path", parseLastFile({ kind: "space", index: 0 }), null);
check("path 不是字符串", parseLastFile({ kind: "loose", path: 123 }), null);
check("path 是空字符串", parseLastFile({ kind: "space", index: 0, path: "" }), null);
check("存的是数组这种意料外的东西", parseLastFile([1, 2, 3]), null);

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
