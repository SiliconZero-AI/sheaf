// canInstallNow() 守的是一条真会丢稿的路：Windows 上 install() 直接
// std::process::exit(0)，画布上没落盘的东西一个字都留不下来。
// 所以这里测的不是「函数写对没有」，是「哪几种情况绝不许放行」。

const assert = require("assert");
const { canInstallNow, formatBytes } = require("./.build/update.js");

let passed = 0;
function ok(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log("canInstallNow");

ok("三样都干净时放行", () => {
  assert.deepStrictEqual(canInstallNow({ conflict: false, missing: false, saved: true }), {
    ok: true,
  });
});

ok("保存没成功就拦下，理由是 unsaved", () => {
  assert.deepStrictEqual(canInstallNow({ conflict: false, missing: false, saved: false }), {
    ok: false,
    reason: "unsaved",
  });
});

ok("冲突未决时拦下，理由是 conflict 而不是 unsaved", () => {
  // 冲突态下 save() 必然返回 false，所以这条同时验了优先级：
  // 报「还没保存」等于把用户推去按 Ctrl+S——那条路在冲突态下被 doSave 挡着，走不通
  assert.deepStrictEqual(canInstallNow({ conflict: true, missing: false, saved: false }), {
    ok: false,
    reason: "conflict",
  });
});

ok("文件已从磁盘消失时拦下，理由是 missing", () => {
  assert.deepStrictEqual(canInstallNow({ conflict: false, missing: true, saved: false }), {
    ok: false,
    reason: "missing",
  });
});

ok("冲突和消失同时成立时先报冲突", () => {
  assert.deepStrictEqual(canInstallNow({ conflict: true, missing: true, saved: false }), {
    ok: false,
    reason: "conflict",
  });
});

ok("saved 为 true 也不能盖过冲突", () => {
  // 防的是将来有人把 save() 的返回值改成「没东西要存也算成功」——
  // 那时 conflict 会突然变成可放行，而它恰恰是最不该放行的一种
  assert.deepStrictEqual(canInstallNow({ conflict: true, missing: false, saved: true }), {
    ok: false,
    reason: "conflict",
  });
});

console.log("formatBytes");

ok("三档单位各自成立", () => {
  assert.strictEqual(formatBytes(0), "0 B");
  assert.strictEqual(formatBytes(1023), "1023 B");
  assert.strictEqual(formatBytes(1024), "1 KB");
  assert.strictEqual(formatBytes(1024 * 1024), "1.0 MB");
  assert.strictEqual(formatBytes(9_123_456), "8.7 MB");
});

console.log(`\n更新闸门：${passed} 项通过`);
