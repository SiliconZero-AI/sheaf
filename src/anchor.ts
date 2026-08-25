// 位置记忆的地基：把「读到哪、光标停在哪」记成「哪个标题 + 往下多少字」。
//
// 为什么不记像素、也不记全局第几个字符：那两样都等于「记页码」。
// 别人往文件前面插三段，页码全废，翻回去是别的地方——
// 而「AI 在前面插三段」正是 Sheaf 最常遇到的事。
// 记「第三章往下第 200 字」才不受前面增删影响。
//
// 标题一律从画布 DOM 取，不从 markdown 正则解析：解析和渲染是两套规则，
// 一旦对不上，第 N 条就会落到第 M 个标题上（同 outline.ts 开头那条铁律）。
// 锚点与大纲共用同一个 querySelectorAll 序列，天然不会错位。
//
// 本文件不 import 任何东西，测试才能单独编译它。

export interface DocAnchor {
  /** 定位所依据的那个标题原文；null = 位置在第一个标题之前，offset 从全文开头起算 */
  heading: string | null;
  /** 同名标题里的第几个（0 起）——治「小结」「示例」这类重名小标题 */
  ordinal: number;
  /** 该标题在全文标题序列里的序号——标题被改名时的退化定位 */
  index: number;
  /** 从该标题起算的字符偏移——段内二次定位 */
  offset: number;
}

/** 文档开头。找不回来时一律退到这里——不是底部、不是原地不动 */
export const TOP_ANCHOR: DocAnchor = { heading: null, ordinal: 0, index: -1, offset: 0 };

export const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

/**
 * 比标题时先归一化空白：渲染出来的标题里可能夹着换行和连续空格，
 * 而用户眼里那就是同一个标题。大小写**不**归一化——
 * 「Bug」和「bug」在中文稿里通常真是两个标题，糊在一起会跳错地方。
 */
export function normalizeHeading(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 第 index 个标题，是同名标题里的第几个（0 起） */
export function ordinalOf(headings: string[], index: number): number {
  if (index < 0 || index >= headings.length) return 0;
  const want = normalizeHeading(headings[index]);
  let seen = 0;
  for (let i = 0; i < index; i += 1) {
    if (normalizeHeading(headings[i]) === want) seen += 1;
  }
  return seen;
}

/**
 * 把锚点解析回「第几个标题」。返回 -1 表示从全文开头起算。
 *
 * 四级降级链，逐级退让——每一级都比下一级更能扛住外部改动：
 *   1. 标题原文 + 同名序号  精确命中。前面插多少段都不影响，这是主路径
 *   2. 只按标题原文找第一个  同名兄弟被删或重排时
 *   3. 退回「第 N 个标题」    标题被改名时
 *   4. 全丢 → 回文档开头     宁可回开头，也不能乱跳到不相干的地方
 */
export function resolveAnchor(anchor: DocAnchor | null, headings: string[]): number {
  if (!anchor || anchor.heading === null) return -1;
  if (headings.length === 0) return -1;
  const want = normalizeHeading(anchor.heading);

  let seen = 0;
  let firstSame = -1;
  for (let i = 0; i < headings.length; i += 1) {
    if (normalizeHeading(headings[i]) !== want) continue;
    if (firstSame < 0) firstSame = i;
    if (seen === anchor.ordinal) return i;
    seen += 1;
  }
  if (firstSame >= 0) return firstSame;

  if (anchor.index >= 0) return Math.min(anchor.index, headings.length - 1);
  return -1;
}

/**
 * 从 IndexedDB 里存着的东西认成 DocAnchor。单独拆出来是为了能测——
 * 存进去的可能是旧版本写的、也可能被别的东西写坏了。
 * 认不出来一律给 null（=回文档开头），总好过拿半残的记录去跳位置。
 */
export function parseAnchor(value: unknown): DocAnchor | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const heading = typeof raw.heading === "string" ? raw.heading : null;
  const offset = typeof raw.offset === "number" && raw.offset >= 0 ? Math.floor(raw.offset) : 0;
  const ordinal = typeof raw.ordinal === "number" && raw.ordinal >= 0 ? Math.floor(raw.ordinal) : 0;
  const index = typeof raw.index === "number" ? Math.floor(raw.index) : -1;
  // 既没标题又没偏移 = 就是文档开头，没什么可记的
  if (heading === null && offset === 0) return null;
  return { heading, ordinal, index, offset };
}

// ---------- 以下是 DOM 层 ----------
//
// 字符偏移的度量口径只有一条：Range.toString() 的长度。
// 取和放两边都用它，块与块之间不补换行也没关系——只要两边一致就跳得准。

/** 画布里所有标题的原文，顺序即 DOM 顺序 */
export function headingTexts(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR)).map(
    (el) => el.textContent ?? "",
  );
}

/** 某个位置在全文里是第几个字符 */
function charOffsetTo(root: HTMLElement, node: Node, nodeOffset: number): number {
  try {
    const range = document.createRange();
    range.setStart(root, 0);
    range.setEnd(node, nodeOffset);
    return range.toString().length;
  } catch {
    return 0;
  }
}

/** 每个标题从全文开头算起的字符位置 */
function headingStarts(root: HTMLElement): number[] {
  return Array.from(root.querySelectorAll<HTMLElement>(HEADING_SELECTOR)).map((el) =>
    charOffsetTo(root, el, 0),
  );
}

/** 全文一共多少字符（与 charOffsetTo 同一把尺子） */
function totalChars(root: HTMLElement): number {
  try {
    const range = document.createRange();
    range.selectNodeContents(root);
    return range.toString().length;
  } catch {
    return 0;
  }
}

/** 第 target 个字符落在哪个文本节点的第几位。超出末尾就贴到末尾 */
function nodeAtCharOffset(
  root: HTMLElement,
  target: number,
): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let last: { node: Node; offset: number } | null = null;
  let current = walker.nextNode();
  while (current) {
    const len = (current as Text).data.length;
    last = { node: current, offset: len };
    if (seen + len >= target) return { node: current, offset: Math.max(0, target - seen) };
    seen += len;
    current = walker.nextNode();
  }
  return last;
}

/** 把「全文第几个字符」换算成锚点 */
function anchorFromCharOffset(root: HTMLElement, absolute: number): DocAnchor {
  const starts = headingStarts(root);
  const texts = headingTexts(root);
  let index = -1;
  for (let i = 0; i < starts.length; i += 1) {
    if (starts[i] <= absolute) index = i;
    else break;
  }
  if (index < 0) return { heading: null, ordinal: 0, index: -1, offset: absolute };
  return {
    heading: texts[index],
    ordinal: ordinalOf(texts, index),
    index,
    offset: absolute - starts[index],
  };
}

/** 把锚点换算回「全文第几个字符」，并夹在本节范围内 */
function charOffsetFromAnchor(root: HTMLElement, anchor: DocAnchor): number {
  const total = totalChars(root);
  const index = resolveAnchor(anchor, headingTexts(root));
  if (index < 0) return Math.min(Math.max(0, anchor.offset), total);
  const starts = headingStarts(root);
  const base = starts[index] ?? 0;
  // 夹到本节长度以内：标题还在、但这一节被删短了的时候，别冲到下一节去
  const next = index + 1 < starts.length ? starts[index + 1] : total;
  const room = Math.max(0, next - base);
  return Math.min(base + Math.min(Math.max(0, anchor.offset), room), total);
}

/**
 * 视口顶端那一行现在停在哪。
 * 用 caretRangeFromPoint 直接问浏览器「这个坐标上是第几个字」，
 * 比自己遍历块元素算高度稳——图片、表格、代码块的高度都不用我们操心。
 */
function caretAtViewportTop(root: HTMLElement): { node: Node; offset: number } | null {
  const rect = root.getBoundingClientRect();
  // x 取中线：贴左边容易落在内边距上，问不出位置
  const x = rect.left + rect.width / 2;
  const y = rect.top + 4;
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  try {
    const range = doc.caretRangeFromPoint?.(x, y);
    if (range && root.contains(range.startContainer)) {
      return { node: range.startContainer, offset: range.startOffset };
    }
    const pos = doc.caretPositionFromPoint?.(x, y);
    if (pos && root.contains(pos.offsetNode)) return { node: pos.offsetNode, offset: pos.offset };
  } catch {
    // 老 WebView 两个都没有：退回「回文档开头」，不至于崩
  }
  return null;
}

/** 记下现在滚到哪了 */
export function captureScrollAnchor(root: HTMLElement): DocAnchor {
  if (root.scrollTop <= 2) return TOP_ANCHOR;
  const caret = caretAtViewportTop(root);
  if (!caret) return TOP_ANCHOR;
  return anchorFromCharOffset(root, charOffsetTo(root, caret.node, caret.offset));
}

/** 记下光标停在哪。没有光标（焦点不在画布上）就返回 null */
export function captureCursorAnchor(root: HTMLElement): DocAnchor | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  return anchorFromCharOffset(root, charOffsetTo(root, range.startContainer, range.startOffset));
}

/** 滚回锚点所指的地方 */
export function applyScrollAnchor(root: HTMLElement, anchor: DocAnchor | null): void {
  if (!anchor) return;
  if (anchor.heading === null && anchor.offset === 0) {
    root.scrollTop = 0;
    return;
  }
  const spot = nodeAtCharOffset(root, charOffsetFromAnchor(root, anchor));
  if (!spot) return;
  try {
    const range = document.createRange();
    range.setStart(spot.node, Math.min(spot.offset, (spot.node as Text).data.length));
    range.collapse(true);
    let box = range.getBoundingClientRect();
    // 折叠的 range 偶尔量出全 0 的矩形，撑开一个字符再量
    if (box.top === 0 && box.height === 0) {
      const data = (spot.node as Text).data;
      const end = Math.min(spot.offset + 1, data.length);
      if (end > spot.offset) {
        range.setEnd(spot.node, end);
        box = range.getBoundingClientRect();
      }
    }
    if (box.top === 0 && box.height === 0) return;
    root.scrollTop += box.top - root.getBoundingClientRect().top;
  } catch {
    // 量不出来就保持不动，好过把用户甩到一个错的地方
  }
}

/** 把光标放回锚点所指的地方 */
export function applyCursorAnchor(root: HTMLElement, anchor: DocAnchor | null): boolean {
  if (!anchor) return false;
  const spot = nodeAtCharOffset(root, charOffsetFromAnchor(root, anchor));
  if (!spot) return false;
  try {
    const range = document.createRange();
    range.setStart(spot.node, Math.min(spot.offset, (spot.node as Text).data.length));
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return true;
  } catch {
    return false;
  }
}
