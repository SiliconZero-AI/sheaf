// 更新说明抽取。单独一个 .mjs 测试文件是因为 scripts/ 下是 ESM，
// test/run.cjs 那套 CommonJS runner require 不进来。

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { extractSection, toPlainText } from "../scripts/release-notes.mjs";

let passed = 0;
function ok(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("更新说明抽取");

const SAMPLE = `# Changelog

## Unreleased

还没定版本号的那一段。

## 0.1.4 — 2026-08-26

一句话概述。

- **加粗的**条目，带 \`行内代码\` 和 [链接](https://example.com)
- 第二条

## 0.1.3 — 2026-08-25

上一版，不该被抽到。
`;

ok("抽出指定版本，且不越界到下一版", () => {
  const text = extractSection(SAMPLE, "0.1.4");
  assert.ok(text.includes("一句话概述。"));
  assert.ok(text.includes("第二条"));
  assert.ok(!text.includes("上一版"), "抽到下一段去了");
  assert.ok(!text.includes("还没定版本号"), "抽到上一段去了");
});

ok("Markdown 标记被清干净（框里是 textContent，留着会原样显示）", () => {
  const text = extractSection(SAMPLE, "0.1.4");
  assert.ok(!text.includes("**"), `残留星号: ${text}`);
  assert.ok(!text.includes("`"), "残留反引号");
  assert.ok(text.includes("加粗的条目"));
  assert.ok(text.includes("行内代码"));
  // 链接只留文字，地址是噪音——框里点不了
  assert.ok(text.includes("链接"));
  assert.ok(!text.includes("example.com"));
});

ok("条目的「- 」前缀保留，前端据此画列表", () => {
  const text = extractSection(SAMPLE, "0.1.4");
  const bullets = text.split("\n").filter((l) => l.startsWith("- "));
  assert.strictEqual(bullets.length, 2);
});

ok("找不到就返回 null，不是抛错也不是空串", () => {
  assert.strictEqual(extractSection(SAMPLE, "9.9.9"), null);
});

ok("默认不认「未发布」，加了 alias 才认", () => {
  assert.strictEqual(extractSection(SAMPLE, "0.9.9", []), null);
  const text = extractSection(SAMPLE, "0.9.9", ["Unreleased"]);
  assert.ok(text.includes("还没定版本号"));
});

ok("中文之间多出来的空格被收掉，中英之间的保留", () => {
  // 源文件里 `- **加粗。** 后半句` 的那个空格是 Markdown 语法要的，
  // 去掉星号后它就成了中文标点后面的多余空格
  assert.strictEqual(toPlainText(["粗体。 后半句"]), "粗体。后半句");
  assert.strictEqual(toPlainText(["打开 Sheaf 就能写"]), "打开 Sheaf 就能写");
});

ok("首尾空行被裁掉", () => {
  assert.strictEqual(toPlainText(["", "  ", "正文", "", ""]), "正文");
});

console.log("\n两份真实 CHANGELOG");

ok("中英两份都能抽出同一个版本，且条目数一致", () => {
  const en = extractSection(readFileSync("CHANGELOG.md", "utf8"), "0.1.3");
  const zh = extractSection(readFileSync("CHANGELOG.zh-CN.md", "utf8"), "0.1.3");
  assert.ok(en && zh, "有一份抽不出来");
  const count = (t) => t.split("\n").filter((l) => l.startsWith("- ")).length;
  // 条目数对不上说明两份漂移了——这正是双语文档最容易烂掉的地方
  assert.strictEqual(count(zh), count(en), `中文 ${count(zh)} 条 / 英文 ${count(en)} 条`);
});

console.log(`\n更新说明：${passed} 项通过`);
