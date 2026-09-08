// 正文右键菜单的构成：哪几项、什么顺序、什么时候该灰掉。
//
// 这份测试挡的是两类事故：
//  1. 没选中字时「剪切 / 复制」还亮着 —— 点了什么都不发生，用户以为程序坏了
//  2. 菜单项顺序或快捷键提示写错 —— 这是用户每天要看几十遍的东西
//
// 真正弹菜单、真正读剪贴板那部分没法在 Node 里跑，靠真机验收。
//
// 跑法：npm test
const { buildEditMenu } = require("./.build/edit-menu.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

const noop = () => {};
const actions = { cut: noop, copy: noop, paste: noop, selectAll: noop };

console.log("=== 选中了字 ===");
const picked = buildEditMenu(true, actions);
check("四项，一项不多一项不少", picked.length, 4);
check("顺序是 剪切/复制/粘贴/全选", picked.map((i) => i.hint), ["Ctrl+X", "Ctrl+C", "Ctrl+V", "Ctrl+A"]);
check("四项全可用", picked.map((i) => !!i.disabled), [false, false, false, false]);
check("每项都有名字", picked.every((i) => typeof i.label === "string" && i.label.length > 0), true);

console.log("\n=== 没选中字 ===");
const empty = buildEditMenu(false, actions);
check("剪切灰掉", empty[0].disabled, true);
check("复制灰掉", empty[1].disabled, true);
check("粘贴照常可用（剪贴板里有东西跟选没选字无关）", !!empty[2].disabled, false);
check("全选照常可用（正是没选中时最想点的那一项）", !!empty[3].disabled, false);
check("灰掉了也仍然在菜单里（不藏，免得菜单每次高矮不一）", empty.length, 4);

console.log("\n=== 点击接到对的动作上 ===");
const hit = [];
const spy = buildEditMenu(true, {
  cut: () => hit.push("cut"),
  copy: () => hit.push("copy"),
  paste: () => hit.push("paste"),
  selectAll: () => hit.push("selectAll"),
});
for (const item of spy) item.run();
check("四项各自触发自己那个动作，没有接串", hit, ["cut", "copy", "paste", "selectAll"]);

console.log("\n=== 没有一项是危险动作（正文菜单不该有红色项）===");
check("没有 danger 项", picked.some((i) => i.danger), false);

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
