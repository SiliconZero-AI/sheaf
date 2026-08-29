// 文件重命名的纯逻辑回归测试：文件名规则、扩展名保留、路径与阅读位置迁移。
// 磁盘上的同名拒绝和 Tauri 权限另走 Windows 真机验收。
//
// 跑法：npm test
const {
  migratePositionMap,
  planMarkdownRename,
  positionKey,
  renamedFilePath,
} = require("./.build/fs.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

console.log("=== 文件名：扩展名始终保留 ===");
check("普通中文名", planMarkdownRename("旧稿.md", "新稿"), { ok: true, name: "新稿.md" });
check("保留 .markdown", planMarkdownRename("旧稿.markdown", "新稿"), { ok: true, name: "新稿.markdown" });
check("保留扩展名大小写", planMarkdownRename("旧稿.MD", "New Draft"), { ok: true, name: "New Draft.MD" });
check("输入里重复带 .md 时不叠两层", planMarkdownRename("旧稿.md", "新稿.md"), { ok: true, name: "新稿.md" });
check("输入 .markdown 仍沿用原来的 .md", planMarkdownRename("旧稿.md", "新稿.markdown"), { ok: true, name: "新稿.md" });
check("首尾空白收掉", planMarkdownRename("旧稿.md", "  ✨ 新稿  "), { ok: true, name: "✨ 新稿.md" });

console.log("\n=== 文件名：空值与 Windows 非法名拒绝 ===");
check("空串", planMarkdownRename("旧稿.md", ""), { ok: false, reason: "empty" });
check("全空格", planMarkdownRename("旧稿.md", "   "), { ok: false, reason: "empty" });
check("只有扩展名", planMarkdownRename("旧稿.md", ".md"), { ok: false, reason: "empty" });
for (const char of ['<', '>', ':', '"', '/', '\\', '|', '?', '*']) {
  check(`非法字符 ${char}`, planMarkdownRename("旧稿.md", `新${char}稿`), { ok: false, reason: "invalid" });
}
check("句点", planMarkdownRename("旧稿.md", "."), { ok: false, reason: "invalid" });
check("保留名 CON", planMarkdownRename("旧稿.md", "CON"), { ok: false, reason: "invalid" });
check("保留名带后缀", planMarkdownRename("旧稿.md", "LPT1.备份"), { ok: false, reason: "invalid" });
check("超过 255 字符", planMarkdownRename("旧稿.md", "a".repeat(253)), { ok: false, reason: "invalid" });
check("同名不碰磁盘", planMarkdownRename("旧稿.md", "旧稿"), { ok: false, reason: "unchanged" });
check("只改大小写在 Windows 视为同名", planMarkdownRename("Draft.md", "draft"), { ok: false, reason: "unchanged" });

console.log("\n=== 路径只换文件名，不移动目录 ===");
check("根目录文件", renamedFilePath("旧稿.md", "新稿.md"), "新稿.md");
check("子目录文件", renamedFilePath("项目/草稿/旧稿.md", "新稿.md"), "项目/草稿/新稿.md");

console.log("\n=== 阅读位置跟着新路径走 ===");
{
  const from = { kind: "space", index: 1, path: "草稿/旧稿.md" };
  const to = { kind: "space", index: 1, path: "草稿/新稿.md" };
  const kept = { scroll: { heading: "第二节", occurrence: 0, offset: 12 }, cursor: null, at: 8 };
  const other = { scroll: { heading: "别篇", occurrence: 0, offset: 2 }, cursor: null, at: 5 };
  const before = { [positionKey(from)]: kept, "space:0:别篇.md": other };
  const after = migratePositionMap(before, from, to);
  check("旧键移除", Object.hasOwn(after, positionKey(from)), false);
  check("新键保留同一锚点", after[positionKey(to)], kept);
  check("别篇记录不动", after["space:0:别篇.md"], other);
}
{
  const from = { kind: "space", index: 0, path: "没记过.md" };
  const to = { kind: "space", index: 0, path: "新名字.md" };
  const before = { "space:0:别篇.md": { scroll: null, cursor: { heading: "A", occurrence: 0, offset: 1 }, at: 1 } };
  check("没旧记录时原表不变", migratePositionMap(before, from, to), before);
}

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
