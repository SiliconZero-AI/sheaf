// 灯箱里的缩放/平移数学，以及克隆 SVG 前的 id 改写。
//
// 纯逻辑单独放一份是为了能进 test/run.cjs 的编译清单——lightbox.ts 满是 DOM 操作，
// 脱离浏览器测不了；但「缩放怎么算、拖到哪儿停、id 怎么改」是纯函数，值得钉死。

/** 视图状态：内容先按 scale 缩放，再平移到 (x, y)。transform-origin 固定 0 0 */
export interface View {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** 缩放下限：再小就看不出是什么了。上限 8 倍，够把最密的流程图看清 */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * 打开灯箱时的初始比例：让整张图完整可见。
 *
 * 上限刻意压在 1——小图（mermaid 自然宽 108px 那种）不该被吹大成马赛克，
 * 这跟 ROADMAP 第 15 条记的「别用 width: auto」是同一个道理。想看更大用户自己滚轮。
 */
export function fitScale(content: Size, viewport: Size, padding = 0): number {
  const availableWidth = viewport.width - padding * 2;
  const availableHeight = viewport.height - padding * 2;
  if (content.width <= 0 || content.height <= 0 || availableWidth <= 0 || availableHeight <= 0) return 1;
  return clampScale(Math.min(1, availableWidth / content.width, availableHeight / content.height));
}

/** 内容在视口里居中摆放时的位移 */
export function centerView(scale: number, content: Size, viewport: Size): View {
  return {
    scale,
    x: (viewport.width - content.width * scale) / 2,
    y: (viewport.height - content.height * scale) / 2,
  };
}

/** 打开灯箱的初始视图：适应窗口 + 居中 */
export function initialView(content: Size, viewport: Size, padding = 0): View {
  return centerView(fitScale(content, viewport, padding), content, viewport);
}

/**
 * 以视口内某一点为锚缩放——鼠标底下那个节点缩放后还停在鼠标底下。
 * 不这么做的话滚轮放大会把用户正盯着的地方推出屏幕，是这类查看器最常见的手感问题。
 */
export function zoomAt(view: View, factor: number, anchorX: number, anchorY: number): View {
  const next = clampScale(view.scale * factor);
  // 已经顶到上下限时不要再动位移，否则继续滚轮会让图平白漂移
  if (next === view.scale) return view;
  const contentX = (anchorX - view.x) / view.scale;
  const contentY = (anchorY - view.y) / view.scale;
  return { scale: next, x: anchorX - contentX * next, y: anchorY - contentY * next };
}

/** 一个轴上的位移钳制：内容比视口大就限制在边缘之间，比视口小就锁定居中 */
function clampAxis(offset: number, contentLength: number, viewportLength: number): number {
  if (contentLength <= viewportLength) return (viewportLength - contentLength) / 2;
  return Math.min(0, Math.max(viewportLength - contentLength, offset));
}

/**
 * 拖动后把视图拉回合法范围：内容边缘不能被拖到视口里侧，
 * 也就是任何时候都不会出现「本该有图的地方是一片空」。比自由拖动少一类迷路。
 */
export function clampPan(view: View, content: Size, viewport: Size): View {
  return {
    scale: view.scale,
    x: clampAxis(view.x, content.width * view.scale, viewport.width),
    y: clampAxis(view.y, content.height * view.scale, viewport.height),
  };
}

/** 把 View 写成 CSS transform。origin 必须是 0 0，这套数学才成立 */
export function toTransform(view: View): string {
  return `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}

/**
 * 给克隆出来的 SVG 换一套 id。
 *
 * mermaid 一张图带 40 多个 id，箭头靠 `marker-end="url(#…pointEnd)"` 引用，
 * 样式靠 `<style>` 里的 `#mermaid<uuid> .node{…}` 选择器。直接 cloneNode 塞进灯箱，
 * 页面上就有两份同名 id：`url(#…)` 按文档顺序解析，克隆图的箭头会去引用**原图**里那个
 * marker——一旦原图被重渲染（用户改了源码）克隆图的箭头就没了。换一套 id 让它自包含。
 *
 * 只改真实出现过的 id：`fill:#333` 这种颜色值长得跟 CSS id 选择器一模一样，
 * 不查表就会被一起改坏。
 */
export function retargetSvgIds(markup: string, prefix: string): string {
  const ids = new Set<string>();
  for (const match of markup.matchAll(/\bid="([^"]*)"/g)) {
    if (match[1]) ids.add(match[1]);
  }
  if (ids.size === 0) return markup;
  const rename = (id: string): string | null => (ids.has(id) ? prefix + id : null);

  let out = markup;
  // url(#x) —— 箭头 marker、渐变、裁剪路径都走这条
  out = out.replace(/url\((["']?)#([^)"']*)\1\)/g, (whole, quote: string, id: string) => {
    const next = rename(id);
    return next ? `url(${quote}#${next}${quote})` : whole;
  });
  // href="#x" / xlink:href="#x"
  out = out.replace(/((?:xlink:)?href=")#([^"]*)"/g, (whole, head: string, id: string) => {
    const next = rename(id);
    return next ? `${head}#${next}"` : whole;
  });
  // id 属性本身
  out = out.replace(/\bid="([^"]*)"/g, (whole, id: string) => {
    const next = rename(id);
    return next ? `id="${next}"` : whole;
  });
  // <style> 里的 id 选择器。放最后：前面几轮改出来的新 id 带着前缀，不在表里，不会被二次替换
  out = out.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (_whole, open: string, body: string, close: string) => {
    const fixed = body.replace(/#([A-Za-z_][\w-]*)/g, (token: string, id: string) => {
      const next = rename(id);
      return next ? `#${next}` : token;
    });
    return `${open}${fixed}${close}`;
  });
  return out;
}
