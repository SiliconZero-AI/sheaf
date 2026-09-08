// 多窗口下的记忆落盘：两个窗口同时写 state.json，谁也不许抹掉谁。
//
// 这是这一批最危险的地方，也是唯一一处「不写测试就一定会出事」的逻辑。
//
// 从前只有一个窗口，落盘时把内存里整份 bag 写下去天经地义。开了第二个窗口之后，
// 那样做就变成了：B 窗口随便存一次阅读位置，就把 A 窗口刚挂上的文件夹抹掉了——
// 因为 B 内存里那份 roots 还是它自己开机时的快照，根本不知道 A 后来加了东西。
//
// 用户看到的现象是「我挂的文件夹自己没了」，而且完全无法归因。
//
// 跑法：npm test
const { mergeState } = require("./.build/store.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

console.log("=== 按键隔离：只盖自己改过的那几个键 ===");
check(
  "只改 positions，roots 原样留着",
  mergeState({ roots: ["D:/一"], positions: { a: 1 } }, { roots: [], positions: { b: 2 } }, [
    "positions",
  ]),
  { roots: ["D:/一"], positions: { b: 2 } },
);
check(
  "只改 roots，positions 原样留着",
  mergeState({ roots: ["D:/一"], positions: { a: 1 } }, { roots: ["D:/二"], positions: {} }, [
    "roots",
  ]),
  { roots: ["D:/二"], positions: { a: 1 } },
);
check(
  "一个键都没改就等于原样抄回去",
  mergeState({ roots: ["D:/一"], zoom: 1.5 }, { roots: [] }, []),
  { roots: ["D:/一"], zoom: 1.5 },
);

console.log("\n=== 删除：本窗口把某个键删了，磁盘上那份也得跟着删 ===");
check(
  "关掉最后一个文件夹后，roots 真的没了",
  mergeState({ roots: ["D:/一"], zoom: 1.5 }, { zoom: 1.5 }, ["roots"]),
  { zoom: 1.5 },
);
check(
  "删一个不存在的键不出事",
  mergeState({ zoom: 1.5 }, {}, ["roots"]),
  { zoom: 1.5 },
);

console.log("\n=== 不许改坏调用方传进来的对象 ===");
const base = { roots: ["D:/一"] };
const mine = { roots: ["D:/二"] };
mergeState(base, mine, ["roots"]);
check("base 没被就地改掉", base, { roots: ["D:/一"] });
check("mine 没被就地改掉", mine, { roots: ["D:/二"] });

console.log("\n=== 真实剧本：A 窗口挂新文件夹，B 窗口存阅读位置 ===");
// 两个窗口开机时看到的都是这一份
const 开机时 = { roots: ["D:/旧"], positions: { "space:0:a.md": { at: 1 } } };

// A 窗口：用户挂上了一个新文件夹（只碰 roots）
const A内存 = { ...开机时, roots: ["D:/旧", "D:/新"] };
const 盘上第一次 = mergeState(开机时, A内存, ["roots"]);
check("A 写完，新文件夹在", 盘上第一次.roots, ["D:/旧", "D:/新"]);

// B 窗口：它的内存里 roots 还是开机时那份（没有 D:/新），现在存了一条阅读位置。
// 关键就在这里——B 写盘时读到的是「盘上第一次」，只盖 positions
const B内存 = { ...开机时, positions: { "space:0:b.md": { at: 2 } } };
const 盘上第二次 = mergeState(盘上第一次, B内存, ["positions"]);
check("B 写完，A 挂的新文件夹还在（这条挂了就是丢文件夹）", 盘上第二次.roots, [
  "D:/旧",
  "D:/新",
]);
check("B 自己的阅读位置也写进去了", 盘上第二次.positions, { "space:0:b.md": { at: 2 } });

console.log("\n=== 反向对照：整份覆盖会出什么事 ===");
// 这就是改动之前的行为——把 B 内存里那份整个写下去
const 旧行为 = { ...B内存 };
check(
  "旧写法确实会抹掉 A 挂的文件夹（证明这个 bug 真实存在）",
  旧行为.roots,
  ["D:/旧"],
);

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
