// 灯箱的缩放/平移数学与 SVG id 改写。
//
// 这份测试挡的是三类回归：
//  1. 初始比例把小图吹大（ROADMAP 第 15 条踩过的「width: auto 把 108px 吹到 530px」同款毛病）
//  2. 滚轮缩放不以光标为锚，放大时把用户正看的地方推出屏幕
//  3. id 改写误伤 `fill:#333` 这类颜色值，或者漏改导致克隆图的箭头去引用原图的 marker
//
// 跑法：npm test
const {
  clampScale,
  fitScale,
  initialView,
  zoomAt,
  clampPan,
  toTransform,
  retargetSvgIds,
  MIN_SCALE,
  MAX_SCALE,
} = require("./.build/lightbox-view.js");

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${JSON.stringify(expected)}\n      实际: ${JSON.stringify(actual)}`);
}
/** 浮点比较：缩放算出来的位移带小数尾巴，不能直接对字符串 */
function near(name, actual, expected, tolerance = 1e-6) {
  const ok = Math.abs(actual - expected) <= tolerance;
  ok ? (pass += 1) : (fail += 1);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log(`      期望: ${expected}\n      实际: ${actual}`);
}

console.log("=== 缩放范围钳制 ===");
check("正常值原样通过", clampScale(1.5), 1.5);
check("低于下限拉回下限", clampScale(0.001), MIN_SCALE);
check("高于上限拉回上限", clampScale(999), MAX_SCALE);
check("NaN 兜底成 1", clampScale(NaN), 1);
check("Infinity 兜底成 1", clampScale(Infinity), 1);

console.log("\n=== 初始比例：适应窗口，但绝不放大小图 ===");
// 真机量到的那张宽流程图：自然宽 1622.3、正文栏只画得出 531
check("宽图缩到装得下", fitScale({ width: 1600, height: 200 }, { width: 800, height: 600 }), 0.5);
// ROADMAP 第 15 条记的那张 108px 小图。放大它只会糊，用户要更大自己滚轮
check("小图保持 1:1 不吹大", fitScale({ width: 108, height: 174 }, { width: 800, height: 600 }), 1);
check("高图按高度定比例", fitScale({ width: 100, height: 1200 }, { width: 800, height: 600 }), 0.5);
check("留白算进可用空间", fitScale({ width: 1000, height: 100 }, { width: 700, height: 600 }, 100), 0.5);
check("尺寸为 0 时兜底成 1", fitScale({ width: 0, height: 0 }, { width: 800, height: 600 }), 1);
check("留白比视口还大时兜底成 1", fitScale({ width: 100, height: 100 }, { width: 80, height: 80 }, 100), 1);

console.log("\n=== 初始视图居中 ===");
check("宽图缩放后居中", initialView({ width: 1600, height: 200 }, { width: 800, height: 600 }), {
  scale: 0.5,
  x: 0,
  y: 250,
});
check("小图原尺寸居中", initialView({ width: 100, height: 100 }, { width: 800, height: 600 }), {
  scale: 1,
  x: 350,
  y: 250,
});

console.log("\n=== 以光标为锚缩放：鼠标底下那点不能跑 ===");
{
  const before = { scale: 1, x: 0, y: 0 };
  const after = zoomAt(before, 2, 100, 50);
  // 锚点在内容坐标系是 (100, 50)，放大 2 倍后仍要落在视口 (100, 50)
  near("锚点 x 不动", after.x + 100 * after.scale, 100);
  near("锚点 y 不动", after.y + 50 * after.scale, 50);
  check("比例翻倍", after.scale, 2);
}
{
  // 已经带位移时同样成立——拖过一次之后再滚轮，是真实使用里的主场景
  const before = { scale: 1.5, x: -200, y: -80 };
  const after = zoomAt(before, 1.25, 300, 200);
  const contentX = (300 - before.x) / before.scale;
  const contentY = (200 - before.y) / before.scale;
  near("带位移时锚点 x 不动", after.x + contentX * after.scale, 300);
  near("带位移时锚点 y 不动", after.y + contentY * after.scale, 200);
}
{
  // 顶到上限还继续滚轮时，位移必须原样不动，否则图会平白往一边漂
  const capped = { scale: MAX_SCALE, x: -50, y: -60 };
  check("顶到上限后不再漂移", zoomAt(capped, 2, 100, 100), capped);
  const floored = { scale: MIN_SCALE, x: 10, y: 20 };
  check("触到下限后不再漂移", zoomAt(floored, 0.5, 100, 100), floored);
}

console.log("\n=== 拖动边界：不能把图拖到只剩一片空白 ===");
{
  const content = { width: 1000, height: 800 };
  const viewport = { width: 400, height: 300 };
  // 内容比视口大：左上不能拖出正值，右下不能露白
  check("往右拖过头被拉回 0", clampPan({ scale: 1, x: 200, y: 0 }, content, viewport).x, 0);
  check("往左拖过头停在右边缘", clampPan({ scale: 1, x: -5000, y: 0 }, content, viewport).x, -600);
  check("范围内的位移原样保留", clampPan({ scale: 1, x: -300, y: -100 }, content, viewport).x, -300);
  // 缩放会改变内容的实际占位，边界要跟着算
  check("缩小后边界跟着变", clampPan({ scale: 0.5, x: -5000, y: 0 }, content, viewport).x, -100);
}
{
  // 内容比视口小：锁定居中，不许自由乱拖
  const content = { width: 100, height: 100 };
  const viewport = { width: 400, height: 300 };
  check("小图锁定居中 x", clampPan({ scale: 1, x: -999, y: 0 }, content, viewport).x, 150);
  check("小图锁定居中 y", clampPan({ scale: 1, x: 0, y: 999 }, content, viewport).y, 100);
}

console.log("\n=== transform 串 ===");
check("原点必须是左上角那套写法", toTransform({ scale: 0.5, x: 10, y: 20 }), "translate(10px, 20px) scale(0.5)");

console.log("\n=== SVG id 改写 ===");
{
  // 取自真机 dump 的 mermaid 结构：40 多个 id、箭头走 url(#)、样式走 #id 选择器
  const markup = [
    '<svg id="mermaidABC" viewBox="0 0 1622 214">',
    "<style>#mermaidABC{fill:#333;}#mermaidABC .node{stroke:#666;}</style>",
    '<marker id="mermaidABC_flowchart-v2-pointEnd"></marker>',
    '<path marker-end="url(#mermaidABC_flowchart-v2-pointEnd)" id="L_A_B_0"></path>',
    "</svg>",
  ].join("");
  const out = retargetSvgIds(markup, "lb1-");

  check("顶层 id 改了", out.includes('id="lb1-mermaidABC"'), true);
  check("marker id 改了", out.includes('id="lb1-mermaidABC_flowchart-v2-pointEnd"'), true);
  check("普通元素 id 改了", out.includes('id="lb1-L_A_B_0"'), true);
  // 这条是关键：不改的话克隆图的箭头会去引用原图那个 marker，原图一重渲染箭头就没了
  check("url(#) 引用跟着改", out.includes("url(#lb1-mermaidABC_flowchart-v2-pointEnd)"), true);
  check("style 里的 id 选择器改了", out.includes("#lb1-mermaidABC{"), true);
  check("style 里带后代选择器的也改了", out.includes("#lb1-mermaidABC .node"), true);
  // 颜色值长得跟 id 选择器一模一样，查表才分得开
  check("颜色 #333 没被误伤", out.includes("fill:#333"), true);
  check("颜色 #666 没被误伤", out.includes("stroke:#666"), true);
  // 短 id 是长 id 的前缀（mermaidABC vs mermaidABC_flowchart…），不能改出双重前缀
  check("没有改出双重前缀", out.includes("lb1-lb1-"), false);
  check("旧的裸 id 属性一个不剩", /\bid="mermaidABC"/.test(out), false);
}
{
  const withHref = '<svg id="s1"><use xlink:href="#s1"></use><use href="#s1"></use></svg>';
  const out = retargetSvgIds(withHref, "p-");
  check("xlink:href 跟着改", out.includes('xlink:href="#p-s1"'), true);
  check("href 跟着改", out.includes('href="#p-s1"'), true);
}
{
  check("没有 id 时原样返回", retargetSvgIds("<svg><path d=\"M0 0\"/></svg>", "x-"), '<svg><path d="M0 0"/></svg>');
  // 指向外部/不存在的 id 不该被改——那不是这张图里的东西
  const dangling = '<svg id="a"><path fill="url(#notmine)"/></svg>';
  check("引用了表外的 id 就不动它", retargetSvgIds(dangling, "q-").includes("url(#notmine)"), true);
}

console.log(`\n合计 ${pass + fail} 项：通过 ${pass}，失败 ${fail}`);
if (fail > 0) process.exit(1);
