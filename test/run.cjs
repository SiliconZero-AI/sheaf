// 把 src 里要测的模块编译成 CommonJS，再跑测试。
// 单独一个 runner 是因为项目 package.json 是 "type": "module"，
// 编译产物要一份自己的 package.json 才会被 node 当 CommonJS 读。
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outDir = path.join(__dirname, ".build");

const args = [
  "--ignoreConfig",
  "src/images.ts",
  "src/fs.ts",
  "src/anchor.ts",
  "src/ir-repair.ts",
  "src/update.ts",
  "src/vite-env.d.ts",
  "--outDir",
  outDir,
  "--module",
  "commonjs",
  "--target",
  "es2022",
  "--skipLibCheck",
];

try {
  execFileSync(process.execPath, [path.join(root, "node_modules", "typescript", "lib", "tsc.js"), ...args], {
    cwd: root,
    stdio: "inherit",
  });
} catch {
  // tsc 在这种「脱离 tsconfig 单文件编译」的模式下可能报无关的类型噪音，
  // 只要产物出来了就继续——真正的类型把关在 npm run build 里
}

if (!fs.existsSync(path.join(outDir, "images.js"))) {
  console.error("编译失败：没有生成 test/.build/images.js");
  process.exit(1);
}
fs.writeFileSync(path.join(outDir, "package.json"), '{ "type": "commonjs" }\n');

// stamp 在前：它是同步的，跑完就回来；images.test.cjs 末尾会 process.exit，排它后面就跑不到了
require("./stamp.test.cjs");
console.log("");
require("./last-file.test.cjs");
console.log("");
require("./inside-space.test.cjs");
console.log("");
require("./anchor.test.cjs");
console.log("");
require("./watch-rules.test.cjs");
console.log("");
require("./ir-repair.test.cjs");
console.log("");
require("./update.test.cjs");
console.log("");
require("./images.test.cjs");
