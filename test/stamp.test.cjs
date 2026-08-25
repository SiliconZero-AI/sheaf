// 外部改动识别的回归测试。守着一条丢稿路径：
//   Sheaf 开着旧内容 → 外部（AI / 别的编辑器 / 同步盘）改了文件 → 自动保存把外部改动整个盖掉。
//
// stampChanged 是那道闸的判断依据，判错的两种后果不对等：
//   判「没变」而其实变了 → 盖掉别人的内容（丢稿）
//   判「变了」而其实没变 → 多问用户一句（烦，但不丢东西）
// 所以除了「读不出来」这一种必须放行的情况，其余一律往「变了」的方向倒。
//
// 跑法：npm test
const { stampChanged, UNKNOWN_STAMP } = require("./.build/fs.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

console.log("=== 外部改动识别 ===");

const seen = { mtime: 1_700_000_000_000, size: 1024 };

check("一模一样：不算变", stampChanged(seen, { ...seen }), false);

check("时间变新：算变", stampChanged(seen, { mtime: seen.mtime + 1000, size: 1024 }), true);

// 从备份还原、同步盘拉回旧版都会写回一个更旧的时间戳，那同样不是我们那份
check("时间变旧：也算变", stampChanged(seen, { mtime: seen.mtime - 60_000, size: 1024 }), true);

// 时间戳精度有限，同一毫秒内改完是可能的，字节数就是这时候的第二道信号
check("时间没变但字节数变了：算变", stampChanged(seen, { mtime: seen.mtime, size: 2048 }), true);

console.log("\n=== 读不出磁盘状态时一律放行 ===");
// 这里必须偏向「没变」：判成变了会让用户从此存不了盘，那比盖掉外部改动更糟
check("磁盘侧读不出：不算变", stampChanged(seen, UNKNOWN_STAMP), false);
check("记录侧读不出：不算变", stampChanged(UNKNOWN_STAMP, seen), false);
check("两侧都读不出：不算变", stampChanged(UNKNOWN_STAMP, UNKNOWN_STAMP), false);

console.log("\n=== 只有一半信息时仍然要判 ===");
// stat 给不出时间但给得出大小（某些网络盘就是这样），这时不算「无从判断」，字节数照比
check("拿不到时间、字节数不同：算变", stampChanged({ mtime: 0, size: 1024 }, { mtime: 0, size: 999 }), true);
check("拿不到时间、字节数相同：不算变", stampChanged({ mtime: 0, size: 1024 }, { mtime: 0, size: 1024 }), false);

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exit(1);
