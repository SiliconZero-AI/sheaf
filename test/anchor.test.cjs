// 位置锚点的回归测试。守着两条体验路径：
//   ① 外部（AI）改了文件之后回来，滚动与光标要落在原来那一节，不能弹回顶部、不能漂到别处
//   ② 记录认不出来时必须回文档开头——宁可回开头，也不能乱跳到不相干的地方
//
// 判错的后果不对等：
//   跳到错的地方 → 用户在长文里迷路，还可能对着错的段落敲字
//   回到开头     → 只是要重新滚一下
// 所以每一级降级都往「安全」的方向倒。
//
// 跑法：npm test
const {
  normalizeHeading,
  ordinalOf,
  resolveAnchor,
  parseAnchor,
  TOP_ANCHOR,
} = require("./.build/anchor.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

function anchor(heading, ordinal, index, offset) {
  return { heading, ordinal, index, offset };
}

console.log("=== 标题归一化 ===");
// 渲染出来的标题里可能夹着换行和连续空格，用户眼里那是同一个标题
check("空白折叠", normalizeHeading("  第三章   锚点\n 怎么选 "), "第三章 锚点 怎么选");
// 大小写不归一化：「Bug」和「bug」在中文稿里通常真是两个标题
check("大小写不动", normalizeHeading("Bug"), "Bug");

console.log("\n=== 同名标题的序号 ===");
const dup = ["开头", "小结", "正文", "小结", "小结"];
check("第一个「小结」是 0", ordinalOf(dup, 1), 0);
check("第二个「小结」是 1", ordinalOf(dup, 3), 1);
check("第三个「小结」是 2", ordinalOf(dup, 4), 2);
check("不重名的也是 0", ordinalOf(dup, 2), 0);
check("越界不炸", ordinalOf(dup, 99), 0);

console.log("\n=== 第 1 级：标题原文 + 同名序号（主路径）===");
const base = ["前言", "锚点怎么选", "小结", "监听怎么做", "小结"];
check("精确命中", resolveAnchor(anchor("监听怎么做", 0, 3, 12), base), 3);
check("重名的第二个", resolveAnchor(anchor("小结", 1, 4, 5), base), 4);

// 这条是整个功能的立身之本：AI 在前面插了两节，位置照样找得回来
const inserted = ["前言", "新插的一节", "又插一节", "锚点怎么选", "小结", "监听怎么做", "小结"];
check("前面插了两节仍命中", resolveAnchor(anchor("监听怎么做", 0, 3, 12), inserted), 5);
check("前面插了两节，重名的第二个仍命中", resolveAnchor(anchor("小结", 1, 4, 5), inserted), 6);

console.log("\n=== 第 2 级：同名兄弟被删，退到第一个同名 ===");
const oneLeft = ["前言", "锚点怎么选", "小结", "监听怎么做"];
// 原来记的是「第 2 个小结」，现在只剩一个——落到那一个，比回开头强
check("要第 2 个但只剩 1 个", resolveAnchor(anchor("小结", 1, 4, 5), oneLeft), 2);

console.log("\n=== 第 3 级：标题被改名，退回「第 N 个标题」===");
const renamed = ["前言", "锚点怎么选", "小结", "监听那一节改名了", "小结"];
check("按序号落到第 3 个", resolveAnchor(anchor("监听怎么做", 0, 3, 12), renamed), 3);
// 标题变少了，序号要夹进范围，不能越界
const shrunk = ["前言", "正文"];
check("序号超范围就夹到最后一个", resolveAnchor(anchor("监听怎么做", 0, 3, 12), shrunk), 1);

console.log("\n=== 第 4 级：全丢就回文档开头 ===");
check("整篇一个标题都没有", resolveAnchor(anchor("监听怎么做", 0, 3, 12), []), -1);
check("锚点本身就在第一个标题之前", resolveAnchor(TOP_ANCHOR, base), -1);
check("没有锚点", resolveAnchor(null, base), -1);
// index 是 -1（记录时就在开头之前）而标题又找不到，只能回开头，不许瞎猜一个
check("标题找不到且没有序号可退", resolveAnchor(anchor("查无此标题", 0, -1, 9), base), -1);

console.log("\n=== 存进去的记录认不认得出来 ===");
check("正常记录", parseAnchor({ heading: "小结", ordinal: 1, index: 4, offset: 20 }), anchor("小结", 1, 4, 20));
check("不是对象", parseAnchor("小结"), null);
check("null", parseAnchor(null), null);
// 「就在文档开头」没什么可记的，认成 null 让调用方走默认路径
check("开头 + 零偏移当作没记", parseAnchor({ heading: null, ordinal: 0, index: -1, offset: 0 }), null);
check("开头 + 有偏移要留着", parseAnchor({ heading: null, offset: 42 }), anchor(null, 0, -1, 42));
// 字段坏了不能让整条记录跳到负数偏移上去
check("负偏移归零", parseAnchor({ heading: "小结", ordinal: -3, index: 2, offset: -9 }), anchor("小结", 0, 2, 0));
check("小数取整", parseAnchor({ heading: "小结", ordinal: 1.7, index: 4.2, offset: 20.9 }), anchor("小结", 1, 4, 20));

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
