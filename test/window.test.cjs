// 多窗口：窗口取什么名字、地址栏参数怎么认、新窗口摆在哪。
//
// 这份测试挡的是三类事故：
//  1. 同一个文件算出两个不同的窗口名 → 同一篇被开出两个窗口，
//     两边各存各的，后存的静默盖掉先存的（用户完全看不出来）
//  2. label 里混进非法字符 → Tauri 拒绝建窗口，功能整个失效
//  3. 地址栏参数认错 → 副窗口开错文件，或者跟主窗口开了同一篇
//
// 跑法：npm test
const {
  normalizeWindowPath,
  labelForPath,
  isMainLabel,
  newBlankLabel,
  parseOpenTarget,
  buildWindowUrl,
  cascadeFrom,
  CASCADE_STEP,
  MAIN_LABEL,
} = require("./.build/window.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

// 反斜杠在源码里是转义字符，测试里用码点拼，免得又被哪一层吃掉一个
const BS = String.fromCharCode(92);

console.log("=== 路径归一化 ===");
check("反斜杠换成正斜杠", normalizeWindowPath(`D:${BS}稿件${BS}a.md`), "d:/稿件/a.md");
check("大小写抹平（Windows 路径不分大小写）", normalizeWindowPath("D:/A/B.MD"), "d:/a/b.md");
check("已经是正斜杠的原样", normalizeWindowPath("d:/a/b.md"), "d:/a/b.md");

console.log("\n=== 窗口名字：同一个文件必须永远算出同一个名字 ===");
check(
  "分隔符不同、大小写不同，仍是同一个窗口",
  labelForPath("D:/a/b.md") === labelForPath(`d:${BS}A${BS}B.MD`),
  true,
);
check("同一路径两次调用一致", labelForPath("D:/稿件/长文.md") === labelForPath("D:/稿件/长文.md"), true);
check("不同文件不是同一个窗口", labelForPath("D:/a.md") === labelForPath("D:/b.md"), false);
check(
  "只差一个字符也要分开（哈希不能塌）",
  labelForPath("D:/稿件/a.md") === labelForPath("D:/稿件/b.md"),
  false,
);

console.log("\n=== 窗口名字：必须是 Tauri 收得下的字符 ===");
// Tauri 规定 label 只能是字母数字加 - / : _。中文路径直接当 label 会被拒
const LEGAL = /^[A-Za-z0-9\-/:_]+$/;
check("中文路径算出的名字合法", LEGAL.test(labelForPath("D:/我的稿件/第一章 开头.md")), true);
check("带空格和括号的路径合法", LEGAL.test(labelForPath("D:/a b (1)/c&d.md")), true);
check("超长路径合法", LEGAL.test(labelForPath("D:/" + "很长的目录名/".repeat(40) + "x.md")), true);
check("空白新窗口的名字也合法", LEGAL.test(newBlankLabel()), true);

console.log("\n=== 文件窗口和空白窗口永不撞名 ===");
const blanks = new Set();
for (let i = 0; i < 200; i += 1) blanks.add(newBlankLabel(1700000000000));
check("同一毫秒连开 200 个也基本不重名", blanks.size >= 195, true);
check(
  "空白窗口的名字不会跟某个文件窗口撞上",
  [...blanks].some((label) => label === labelForPath("D:/a.md")),
  false,
);
check("主窗口只有 main 算主窗口", isMainLabel(MAIN_LABEL), true);
check("文档窗口不算主窗口", isMainLabel(labelForPath("D:/a.md")), false);

console.log("\n=== 地址栏参数 ===");
check("没有参数 = 什么都没指名", parseOpenTarget(""), { path: null, blank: false });
check("指名一篇", parseOpenTarget("?open=D:/a.md"), { path: "D:/a.md", blank: false });
check("空白窗口", parseOpenTarget("?blank=1"), { path: null, blank: true });
check("open 是空串当没指名", parseOpenTarget("?open="), { path: null, blank: false });
check("open 只有空格也当没指名", parseOpenTarget("?open=%20%20"), { path: null, blank: false });
check("blank 不是 1 就不算", parseOpenTarget("?blank=yes"), { path: null, blank: false });
check("认不出的参数不影响其余", parseOpenTarget("?x=1&open=D:/a.md&%%%"), {
  path: "D:/a.md",
  blank: false,
});

console.log("\n=== 拼地址：中文、空格、& 必须编码，且能原样解回来 ===");
for (const path of [
  "D:/稿件/第一章.md",
  "D:/a b/c.md",
  "D:/a&b/c=d.md",
  "D:/百分之百#井号/x.md",
  `D:${BS}反斜杠${BS}a.md`,
]) {
  const url = buildWindowUrl({ path, blank: false });
  const back = parseOpenTarget(url.slice(url.indexOf("?")));
  check(`往返一致：${path}`, back.path, path);
}
check("没指名时不带问号", buildWindowUrl({ path: null, blank: false }), "index.html");
check("空白窗口带 blank=1", buildWindowUrl({ path: null, blank: true }), "index.html?blank=1");

console.log("\n=== 新窗口摆在哪：必须跟当前窗口错开 ===");
check("错开了，不会压在原窗口上", cascadeFrom(100, 100, 0), {
  x: 100 + CASCADE_STEP,
  y: 100 + CASCADE_STEP,
});
check("开得越多错得越远", cascadeFrom(100, 100, 1).x > cascadeFrom(100, 100, 0).x, true);
check("第 8 档回头，不会一直往屏幕外走", cascadeFrom(100, 100, 8), cascadeFrom(100, 100, 0));
check("负坐标（窗口在副屏左边）夹回 0，不会跑到看不见的地方", cascadeFrom(-500, -500, 0), {
  x: 0,
  y: 0,
});
check("小数坐标取整（Tauri 收整数逻辑像素）", Number.isInteger(cascadeFrom(10.4, 10.6, 0).x), true);

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
