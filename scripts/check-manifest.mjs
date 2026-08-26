// 校验发版时生成的 latest.json。
//
// 这个文件是所有已安装的 Sheaf 更新时唯一会读的东西，而它的错法**全是静默的**：
// Release 页面看着一切正常，用户那边的更新检查却直接失败，要等有人抱怨才知道。
// 所以生成完立刻验一遍形状，不合格就中止发版。
//
// 2026-08-26 发 0.1.4 时就是靠人眼在草稿阶段撞到的：PowerShell 把 node 的多行输出
// 拆成了字符串数组，notes 于是被写成 JSON 数组，而更新器把它当字符串反序列化——
// 整份清单解析失败。那次靠运气发现，这个脚本是为了不再靠运气。
//
// 用法：node scripts/check-manifest.mjs <latest.json> <期望版本号> <tag>

import { readFileSync } from "node:fs";

const [file, version, tag] = process.argv.slice(2);
if (!file || !version || !tag) {
  console.error("用法: node scripts/check-manifest.mjs <latest.json> <版本号> <tag>");
  process.exit(2);
}

const problems = [];
const must = (cond, message) => {
  if (!cond) problems.push(message);
};

let m;
try {
  m = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.error(`latest.json 不是合法 JSON：${error.message}`);
  process.exit(1);
}

must(m.version === version, `version 是 ${JSON.stringify(m.version)}，应为 "${version}"`);

// notes / notesZh 必须是**字符串**。写成数组是最容易犯又最难察觉的一种：
// JSON 本身合法，Release 页面正常，只有更新器那边会炸
for (const key of ["notes", "notesZh"]) {
  const v = m[key];
  if (typeof v !== "string") {
    problems.push(`${key} 的类型是 ${Array.isArray(v) ? "数组" : typeof v}，必须是字符串`);
    continue; // 类型都不对就别再报「是空的」，那是同一个毛病的第二次抱怨
  }
  must(v.trim().length > 0, `${key} 是空的——用户会看到一个说不出改了什么的更新`);
}

const platforms = m.platforms ?? {};
must(Object.keys(platforms).length > 0, "platforms 是空的");

const win = platforms["windows-x86_64"];
must(win !== undefined, "缺 platforms['windows-x86_64']——这是 Windows 用户唯一认的那个键");

if (win) {
  must(typeof win.signature === "string" && win.signature.trim().length > 0, "signature 缺失或为空");
  must(typeof win.url === "string" && win.url.startsWith("https://"), "url 缺失或不是 https");
  // url 必须指向这次 tag 的产物：签名是对具体字节算的，
  // 指到 /releases/latest/ 那种会跟着后续版本漂走，早晚跟签名对不上
  must(
    typeof win.url === "string" && win.url.includes(`/download/${tag}/`),
    `url 没指向 ${tag} 的产物：${win.url}`,
  );
}

if (problems.length > 0) {
  console.error("latest.json 不合格，中止发版：");
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

console.log(`latest.json 校验通过：${m.version} → ${win.url.split("/").pop()}`);
