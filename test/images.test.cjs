// 图片双向映射的回归测试。守着两条曾经真实发生过的 data-loss：
//   1. 图片名带 `]` 时，blob 死链被写进稿件（正则解析不了自己生成的语法）
//   2. 没打开文件夹时插图，稿件里被写入指向不存在文件的死链
//
// 跑法：npm test
const { ImageStore, safeAlt } = require("./.build/images.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}

/** 够 flush 用的假目录句柄 */
function fakeDir(written) {
  const dir = {
    name: "images",
    async getDirectoryHandle() {
      return dir;
    },
    async getFileHandle(name, opts) {
      if (!opts?.create && !written.has(name)) throw new Error("NotFound");
      return {
        name,
        async createWritable() {
          return {
            async write(data) {
              written.set(name, data);
            },
            async close() {},
          };
        },
      };
    },
  };
  return dir;
}

globalThis.URL.createObjectURL = (() => {
  let n = 0;
  return () => `blob:http://localhost:5173/fake-${(n += 1)}`;
})();
globalThis.URL.revokeObjectURL = () => {};

(async () => {
  console.log("=== 图片名带方括号（曾经把 blob 死链写进稿件）===");
  {
    const store = new ImageStore();
    const url = store.track(new Blob(["x"]), "头图[定稿].png");
    // Lute 不会替你转义 alt 里的方括号，getValue() 原样吐回来
    const md = `![头图[定稿]](${url})`;
    check("认得出这张待落盘的图", store.pendingCount(md), 1);
    check("写盘的正文里不留 blob 地址", store.dehydrate(md).includes("blob:"), false);
    check("换成相对路径", store.dehydrate(md), "![头图[定稿]](./images/头图-定稿-.png)");
  }

  console.log("\n=== 方括号变体 ===");
  {
    const store = new ImageStore();
    const u1 = store.track(new Blob(["x"]), "a[b.png");
    const u2 = store.track(new Blob(["x"]), "c]d.png");
    const md = `![a[b](${u1})\n\n![c]d](${u2})`;
    check("两张都认得出", store.pendingCount(md), 2);
    check("都不留 blob", store.dehydrate(md).includes("blob:"), false);
  }

  console.log("\n=== 没有工作区时：不落盘，但也绝不留 blob ===");
  {
    const store = new ImageStore();
    const url = store.track(new Blob(["x"]), "截图.png");
    const md = `![截图](${url})`;
    await store.flush(md, null, "");
    check("仍是待落盘状态（save 据此拒绝写盘）", store.pendingCount(md), 1);
    check("即便写盘也不会留 blob", store.dehydrate(md).includes("blob:"), false);
  }

  console.log("\n=== 正常路径 ===");
  {
    const written = new Map();
    const store = new ImageStore();
    const url = store.track(new Blob(["binary"]), "封面.png");
    const md = `![封面](${url})`;
    await store.flush(md, fakeDir(written), "稿件/长文.md");
    check("图片二进制写进 images/", written.size, 1);
    check("落盘后不再计入待写", store.pendingCount(md), 0);
    check("稿件里写相对路径", store.dehydrate(md), "![封面](./images/封面.png)");
  }

  console.log("\n=== alt 清洗 ===");
  check("方括号被清掉", safeAlt("头图[定稿]"), "头图 定稿");
  check("圆括号被清掉", safeAlt("图(1)"), "图 1");
  check("正常名字不动", safeAlt("封面图"), "封面图");

  console.log(`\n${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
