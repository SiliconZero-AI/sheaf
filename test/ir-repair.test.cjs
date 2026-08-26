// 工具栏行内标记要不要补一次重解析。
//
// 这份测试挡的是「名单被人悄悄改短」：加粗 / 斜体 / 删除线 / 链接四个按钮点完，
// 画布上会先留一串裸语法（`~~文字~~`、`[文字](https://)`），要等下一次输入才补渲染，
// 正面违反单栏 IR 所见即所得。真正的时序问题测试盖不住（只能真机连着敲），
// 但「哪些按钮要补、什么情况下不补」是纯判定，值得钉死。
//
// 跑法：npm test
const { needsRerender, CLASS_CURRENT, CLASS_DISABLED } = require("./.build/ir-repair.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

const plain = [];

console.log("=== 这四个按钮必须补 ===");
// 前三个是 <wbr> 被插在开标记和文字之间，Lute 按 GFM 判定就不认了；
// link 是 Vditor 插完压根没调用 IR 的 input()，根本没送去解析
check("加粗", needsRerender("bold", plain), true);
check("斜体", needsRerender("italic", plain), true);
check("删除线", needsRerender("strike", plain), true);
check("链接", needsRerender("link", plain), true);

console.log("\n=== 这些本来就好的，别去动 ===");
// mark / sup / sub 走的是 Sheaf 自己的 wrapSelection，插的是干净文本；
// inline-code 的反引号不受 GFM 那条左侧成对规则约束
check("高亮", needsRerender("mark", plain), false);
check("上标", needsRerender("sup", plain), false);
check("下标", needsRerender("sub", plain), false);
check("行内代码", needsRerender("inline-code", plain), false);
check("表格", needsRerender("table", plain), false);
check("代码块", needsRerender("code", plain), false);
check("撤销", needsRerender("undo", plain), false);

console.log("\n=== 按钮状态决定要不要补 ===");
// 光标已经在这种标记里，点它是「取消标记」，走的是 removeInline，本来就会重解析
check("取消标记那条路不补", needsRerender("bold", [CLASS_CURRENT]), false);
check("按钮是灰的不补", needsRerender("bold", [CLASS_DISABLED]), false);
// 类名列表里混着别的类也要认得出来
check("混着别的类也认得出 current", needsRerender("strike", ["vditor-tooltipped", CLASS_CURRENT]), false);
check("混着别的类但状态正常", needsRerender("strike", ["vditor-tooltipped", "vditor-tooltipped__ne"]), true);

console.log("\n=== 拿不到 data-type 时不补 ===");
// 点在分隔条或者工具栏空白上，closest 会摸空
check("null", needsRerender(null, plain), false);
check("undefined", needsRerender(undefined, plain), false);
check("空串", needsRerender("", plain), false);

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
