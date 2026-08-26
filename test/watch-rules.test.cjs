// 实时监听的判定逻辑。三件事，每件判错都有真实代价：
//   ① 路径比对：比错 → 外部改动同步不过来（Windows 上同一个文件有好几种写法）
//   ② 事件命中：漏判 → AI 落盘了但画面不动
//   ③ 文件消失：抢答 → 把用户正开着的稿子判成「文件没了」
//
// ③ 是这个功能最容易翻车的地方：AI 工具改文件常用「先写一份临时文件、再改名盖掉原来那份」，
// 中间有个真实空窗——旧的已经拿走、新的还没放上。那一瞬间去看，文件确实不在。
//
// 跑法：npm test
const {
  normalizePath,
  samePath,
  hitsWatchedFile,
  affectsTree,
  missingStep,
  MISSING_GRACE_MS,
  MISSING_RETRY_MS,
  positionKey,
  parsePositions,
  trimPositions,
} = require("./.build/fs.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

console.log("=== 路径归一化 ===");
check("反斜杠换正斜杠 + 转小写", normalizePath("D:\\Notes\\A.md"), "d:/notes/a.md");
check("去掉结尾斜杠", normalizePath("D:/Notes/"), "d:/notes");

console.log("\n=== 同一个文件的不同写法 ===");
// 系统对话框给回来的是反斜杠，扫树时拼的是正斜杠，监听报回来的又可能是另一种
check("分隔符不同", samePath("D:\\notes\\a.md", "D:/notes/a.md"), true);
check("大小写不同", samePath("D:/Notes/A.md", "d:/notes/a.md"), true);
check("真是两个文件", samePath("D:/notes/a.md", "D:/notes/b.md"), false);
// 必须卡在整段上：notes 不能把 notes2 认成自己
check("前缀相同但不是同一个", samePath("D:/notes", "D:/notes2"), false);
check("空值不认", samePath(null, "D:/notes/a.md"), false);

console.log("\n=== 这批事件有没有碰到我们开着的那篇 ===");
const open = "D:/notes/a.md";
check("直接改了它", hitsWatchedFile(["D:\\notes\\a.md"], open), true);
// 「写临时文件再改名」报上来的是一串路径，原文件名可能出现在其中任意一条上
check("临时文件改名盖过来", hitsWatchedFile(["D:/notes/a.md.tmp", "D:/notes/a.md"], open), true);
check("只动了别的文件", hitsWatchedFile(["D:/notes/b.md", "D:/notes/c.md"], open), false);
check("没开文件时不管", hitsWatchedFile(["D:/notes/a.md"], null), false);
check("空事件", hitsWatchedFile([], open), false);

console.log("\n=== 哪些变动值得重扫左栏 ===");
// 挡的是真实开销：AI 落盘路上甩出的临时文件和插图，每个都触发全目录递归扫描的话，
// 连着写十个文件就是十次扫盘
check("稿子本身", affectsTree("D:/notes/a.md"), true);
check("大写扩展名也认", affectsTree("D:/notes/A.MARKDOWN"), true);
check("临时文件不算", affectsTree("D:/notes/a.md.tmp"), false);
check("插图不算", affectsTree("D:/notes/images/x.png"), false);
// 目录要算：新建/删除文件夹得反映到左栏，而目录名没有扩展名
check("目录算", affectsTree("D:/notes/章节"), true);
check("反斜杠路径同样处理", affectsTree("D:\\notes\\a.md"), true);

console.log("\n=== 看不见文件时先别下结论 ===");
check("刚发现不见：等", missingStep(0), { verdict: "wait", retryInMs: MISSING_RETRY_MS });
check("等了一半：继续等", missingStep(1000), { verdict: "wait", retryInMs: MISSING_RETRY_MS });
// 最后一次别睡过头，正好停在宽限期末尾
check("快到点了：只等到点为止", missingStep(MISSING_GRACE_MS - 100), { verdict: "wait", retryInMs: 100 });
check("到点了：认定没了", missingStep(MISSING_GRACE_MS), { verdict: "gone", retryInMs: 0 });
check("超过了：认定没了", missingStep(MISSING_GRACE_MS + 5000), { verdict: "gone", retryInMs: 0 });

console.log("\n=== 位置记在哪个键上 ===");
check("工作区里的篇", positionKey({ kind: "space", index: 1, path: "章节/第三章.md" }), "space:1:章节/第三章.md");
// 散篇的路径要归一化，否则同一个文件被系统用不同大小写报回来会记成两条
check("散篇归一化", positionKey({ kind: "loose", path: "D:\\Notes\\A.md" }), "loose:d:/notes/a.md");

console.log("\n=== 存进去的位置表认不认得出来 ===");
const good = { "space:0:a.md": { scroll: { heading: "小结", ordinal: 0, index: 2, offset: 30 }, cursor: null, at: 5 } };
check("正常记录留下", Object.keys(parsePositions(good)), ["space:0:a.md"]);
// 两个锚点都认不出来的记录留着没用，反而会让调用方以为「记过」
check("空记录丢掉", parsePositions({ "space:0:a.md": { scroll: null, cursor: null, at: 5 } }), {});
check("不是对象", parsePositions("x"), {});

console.log("\n=== 位置表封顶 ===");
const many = {};
for (let i = 0; i < 5; i += 1) many[`k${i}`] = { scroll: null, cursor: null, at: i };
// 淘汰最久没碰的，留下最近的
check("超上限只留最近的", Object.keys(trimPositions(many, 3)).sort(), ["k2", "k3", "k4"]);
check("没超上限原样返回", Object.keys(trimPositions(many, 10)).length, 5);

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
