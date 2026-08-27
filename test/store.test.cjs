// 工作区记忆的存取格式：配置文件怎么认、老数据怎么搬。
//
// 这份测试挡的是三类事故，每一类都是「用户一开机发现工作区没了」：
//  1. 配置文件坏了（手改坏、写一半断电、磁盘串位）→ 解析必须不抛、不清空，
//     坏了一个字段不能把其余字段一起赔进去
//  2. 老用户第一次升上来 → IndexedDB 里那份必须原样搬进配置文件，
//     搬漏了等于让所有人重新挂一遍文件夹
//  3. 缩放比例认错 → 开机后正文变成一个用户没设过的怪大小
//
// 跑法：npm test
const {
  parseState,
  parseStateText,
  serializeState,
  stateFromLegacy,
  parseZoom,
  isEmptyState,
  STATE_VERSION,
  ZOOM_MIN,
  ZOOM_MAX,
} = require("./.build/store.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

console.log("=== 配置文件坏成什么样都不许抛，也不许把好字段一起丢掉 ===");

check("整个不是 JSON", parseStateText("这不是 json{{{"), {});
check("空文件", parseStateText(""), {});
check("写了一半就断电", parseStateText('{"roots":["D:\\\\稿子"'), {});
check("JSON 是合法的但顶层是数组", parseStateText("[1,2,3]"), {});
check("JSON 是合法的但顶层是字符串", parseStateText('"roots"'), {});
check("顶层是 null", parseState(null), {});
check("顶层是数字", parseState(42), {});

check(
  "roots 坏了，last-file 还得留着",
  parseState({ roots: "不是数组", "last-file": { kind: "loose", path: "D:/a.md" } }),
  { "last-file": { kind: "loose", path: "D:/a.md" } },
);
check(
  "roots 数组里混了非字符串，只留字符串那几个",
  parseState({ roots: ["D:/一", 42, null, "D:/二", ""] }),
  { roots: ["D:/一", "D:/二"] },
);
check("roots 是空数组，当没存过", parseState({ roots: [] }), {});
check("positions 被写成了数组", parseState({ positions: [1, 2] }), {});
check("多余字段一律忽略", parseState({ roots: ["D:/一"], 乱七八糟: true }), { roots: ["D:/一"] });

console.log("\n=== last-file 的两种历史格式都得往下传（认不认得交给 parseLastFile）===");

check("对象形态", parseState({ "last-file": { index: 2, path: "a.md" } }), {
  "last-file": { index: 2, path: "a.md" },
});
check("最早的裸路径字符串", parseState({ "last-file": "稿件/草稿.md" }), {
  "last-file": "稿件/草稿.md",
});
check("空字符串当没存过", parseState({ "last-file": "" }), {});

console.log("\n=== 缩放比例：认不出的一律 null，回落到 100% ===");

check("正常值", parseZoom(1.25), 1.25);
check("下界", parseZoom(ZOOM_MIN), ZOOM_MIN);
check("上界", parseZoom(ZOOM_MAX), ZOOM_MAX);
check("浮点尾巴收到三位", parseZoom(1.2000000000000002), 1.2);
check("除出来的长尾巴", parseZoom(1.1000000000000003), 1.1);
check("越界不夹边界，直接不认（小）", parseZoom(0.1), null);
check("越界不夹边界，直接不认（大）", parseZoom(100), null);
check("0", parseZoom(0), null);
check("负数", parseZoom(-1), null);
check("NaN", parseZoom(NaN), null);
check("Infinity", parseZoom(Infinity), null);
check("字符串形态的数字也不认", parseZoom("1.2"), null);
check("从来没存过", parseZoom(undefined), null);
check("坏的缩放值不该污染其余字段", parseState({ roots: ["D:/一"], zoom: 999 }), {
  roots: ["D:/一"],
});

console.log("\n=== 老用户第一次升上来：IndexedDB 那份必须原样搬过来 ===");

check(
  "三样齐全",
  stateFromLegacy({
    roots: ["D:/一", "D:/二"],
    lastFile: { kind: "space", index: 1, path: "sub/a.md" },
    positions: { "space:1:sub/a.md": { scroll: null, cursor: null, at: 7 } },
  }),
  {
    roots: ["D:/一", "D:/二"],
    "last-file": { kind: "space", index: 1, path: "sub/a.md" },
    positions: { "space:1:sub/a.md": { scroll: null, cursor: null, at: 7 } },
  },
);
check(
  "更早的版本只存一个文件夹，键名是单数",
  stateFromLegacy({ roots: null, root: "D:/独苗" }),
  { roots: ["D:/独苗"] },
);
check(
  "roots 有货时不许被单数的老键顶掉",
  stateFromLegacy({ roots: ["D:/新"], root: "D:/老" }),
  { roots: ["D:/新"] },
);
check(
  "roots 是空数组时才回头看单数老键",
  stateFromLegacy({ roots: [], root: "D:/老" }),
  { roots: ["D:/老"] },
);
check(
  "浏览器时代存的是句柄对象，桌面版读到只有拍平的空壳——不是字符串就不要",
  stateFromLegacy({ roots: [{ name: "一" }, { name: "二" }] }),
  {},
);
check("最早的 last-file 是裸字符串，一样要搬", stateFromLegacy({ lastFile: "a.md" }), {
  "last-file": "a.md",
});
check("什么都没有 = 全新用户", stateFromLegacy({}), {});
check("全是垃圾也不许抛", stateFromLegacy({ roots: 1, root: 2, lastFile: 3, positions: 4 }), {});

console.log("\n=== 空不空（决定要不要为这份数据建文件）===");

check("空的", isEmptyState({}), true);
check("有工作区", isEmptyState({ roots: ["D:/一"] }), false);
check("只有缩放比例", isEmptyState({ zoom: 1.25 }), false);

console.log("\n=== 写出去再读回来，必须一模一样 ===");

const round = { roots: ["D:/一", "D:/二"], "last-file": { kind: "loose", path: "D:/a.md" }, zoom: 1.5 };
check("原样回来", parseStateText(serializeState(round)), round);
check("版本号写在文件里", JSON.parse(serializeState({})).version, STATE_VERSION);
check("换行结尾（人打开这文件时不至于顶着最后一行）", serializeState({}).endsWith("\n"), true);

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
