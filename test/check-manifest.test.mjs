// latest.json 校验器。测的不是「函数写对没有」，是「哪几种坏清单绝不许放行」——
// 这份文件发出去就没法悄悄改，而它的错法全是静默的。

import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let passed = 0;
const dir = mkdtempSync(join(tmpdir(), "sheaf-manifest-"));

/** 跑一次校验器，返回退出码与 stderr */
function check(manifest, version = "0.1.4", tag = "v0.1.4") {
  const file = join(dir, `m${passed}.json`);
  writeFileSync(file, JSON.stringify(manifest), "utf8");
  try {
    execFileSync(process.execPath, ["scripts/check-manifest.mjs", file, version, tag], {
      stdio: "pipe",
    });
    return { code: 0, err: "" };
  } catch (e) {
    return { code: e.status, err: String(e.stderr) };
  }
}

function ok(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const GOOD = {
  version: "0.1.4",
  notes: "English notes",
  notesZh: "中文说明",
  pub_date: "2026-08-26T00:00:00Z",
  platforms: {
    "windows-x86_64": {
      signature: "c2ln",
      url: "https://github.com/SiliconZero-AI/sheaf/releases/download/v0.1.4/Sheaf_0.1.4_x64-setup.exe",
    },
  },
};

console.log("latest.json 校验器");

ok("完好的清单放行", () => {
  assert.strictEqual(check(GOOD).code, 0);
});

ok("notes 是数组时拦下（真发生过：PowerShell 把多行输出拆成了数组）", () => {
  const r = check({ ...GOOD, notes: ["第一行", "第二行"] });
  assert.strictEqual(r.code, 1);
  assert.ok(r.err.includes("数组"), r.err);
});

ok("notes 为空时拦下——不能推一个说不出改了什么的更新", () => {
  assert.strictEqual(check({ ...GOOD, notesZh: "   " }).code, 1);
});

ok("版本号对不上时拦下", () => {
  assert.strictEqual(check({ ...GOOD, version: "0.1.3" }).code, 1);
});

ok("缺 windows-x86_64 这个键时拦下", () => {
  assert.strictEqual(check({ ...GOOD, platforms: { "linux-x86_64": {} } }).code, 1);
});

ok("签名为空时拦下", () => {
  const bad = JSON.parse(JSON.stringify(GOOD));
  bad.platforms["windows-x86_64"].signature = "";
  assert.strictEqual(check(bad).code, 1);
});

ok("url 指向 /releases/latest/ 而不是本次 tag 时拦下", () => {
  const bad = JSON.parse(JSON.stringify(GOOD));
  // 这种地址会跟着后续版本漂走，早晚跟本清单里的签名对不上
  bad.platforms["windows-x86_64"].url =
    "https://github.com/SiliconZero-AI/sheaf/releases/latest/download/Sheaf-Setup-x64.exe";
  const r = check(bad);
  assert.strictEqual(r.code, 1);
  assert.ok(r.err.includes("v0.1.4"), r.err);
});

ok("非 https 的 url 拦下", () => {
  const bad = JSON.parse(JSON.stringify(GOOD));
  bad.platforms["windows-x86_64"].url =
    "http://github.com/SiliconZero-AI/sheaf/releases/download/v0.1.4/x.exe";
  assert.strictEqual(check(bad).code, 1);
});

console.log(`\n清单校验：${passed} 项通过`);
