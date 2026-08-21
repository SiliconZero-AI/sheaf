// Ctrl+F 查找。用 CSS Custom Highlight API 画高亮：
// 不插 span、不动 DOM，所以不会打断 Vditor 的编辑状态和撤销栈。
//
// 两条时序上的坑，都在这里处理掉：
// 1. Vditor 每敲一个字就重建当前段落，Range 指向的旧文本节点被丢弃 → 高亮当场消失。
//    靠 MutationObserver 自己盯 DOM 重算，不等 Vditor 的 input 回调（那个被 undoDelay 压了 800ms）。
// 2. 重算会重新收集命中项，如果每次都归零，正在看第 7 条的人会被拽回第 1 条。
//    所以按「绝对字符偏移」记住当前那一条，重算后挑最近的接上。

interface SearchUI {
  bar: HTMLElement;
  input: HTMLInputElement;
  count: HTMLElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  close: HTMLButtonElement;
}

/** 一个命中项：range 用来画，at 是它在全文里的字符偏移，用来在重算后认出「还是这一条」 */
interface Hit {
  range: Range;
  at: number;
}

const HL_ALL = "wd-search";
const HL_CURRENT = "wd-search-current";
/** 重算的防抖。连打时把一串 DOM 变动并成一次，又不至于让高亮看着像掉帧 */
const REPAINT_DELAY = 80;

function highlightsSupported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";
}

function findScroller(node: Node): HTMLElement | null {
  let el = node.parentElement;
  while (el) {
    const style = getComputedStyle(el);
    const scrollable = /(auto|scroll|overlay)/.test(style.overflowY);
    if (scrollable && el.scrollHeight > el.clientHeight + 4) return el;
    el = el.parentElement;
  }
  return null;
}

export class Search {
  private hits: Hit[] = [];
  private current = -1;
  private open = false;
  private observer: MutationObserver | null = null;
  private watched: HTMLElement | null = null;
  private repaintTimer = 0;

  constructor(
    private ui: SearchUI,
    private getScope: () => HTMLElement | null,
  ) {
    this.ui.input.addEventListener("input", () => this.run(this.ui.input.value));
    this.ui.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) this.step(-1);
        else this.step(1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.hide();
      }
    });
    this.ui.next.addEventListener("click", () => this.step(1));
    this.ui.prev.addEventListener("click", () => this.step(-1));
    this.ui.close.addEventListener("click", () => this.hide());
  }

  show(): void {
    this.open = true;
    this.ui.bar.hidden = false;
    this.ui.input.focus();
    this.ui.input.select();
    if (this.ui.input.value) this.run(this.ui.input.value);
    else this.watch();
  }

  hide(): void {
    this.open = false;
    this.ui.bar.hidden = true;
    this.unwatch();
    this.clear();
  }

  isOpen(): boolean {
    return this.open;
  }

  /** 正文变了就重算，否则高亮会停在旧位置上。外部调用与 observer 共用同一条防抖 */
  refresh(): void {
    this.schedule();
  }

  private schedule(): void {
    if (!this.open || !this.ui.input.value) return;
    window.clearTimeout(this.repaintTimer);
    this.repaintTimer = window.setTimeout(() => {
      this.repaintTimer = 0;
      if (!this.open) return;
      this.run(this.ui.input.value, false);
    }, REPAINT_DELAY);
  }

  /** 盯住画布：Vditor 重建段落后立刻把高亮补回去 */
  private watch(): void {
    const scope = this.getScope();
    if (!scope) return;
    if (this.observer && this.watched === scope) return;
    this.unwatch();
    // 高亮不改 DOM，所以这里不会被自己触发
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(scope, { subtree: true, childList: true, characterData: true });
    this.watched = scope;
  }

  private unwatch(): void {
    window.clearTimeout(this.repaintTimer);
    this.repaintTimer = 0;
    this.observer?.disconnect();
    this.observer = null;
    this.watched = null;
  }

  private clear(): void {
    this.hits = [];
    this.current = -1;
    if (highlightsSupported()) {
      CSS.highlights.delete(HL_ALL);
      CSS.highlights.delete(HL_CURRENT);
    }
  }

  private run(query: string, jump = true): void {
    // 重算时先记下当前看的是哪一条；换词（jump=true）则本来就该从头来
    const anchor = jump ? null : (this.hits[this.current]?.at ?? null);
    this.clear();
    const scope = this.getScope();
    // 切稿后画布是新元素，顺手把 observer 挪过去
    this.watch();
    if (!query || !scope) {
      this.ui.count.textContent = query ? "0/0" : "";
      return;
    }
    this.hits = collectHits(scope, query);
    if (highlightsSupported() && this.hits.length > 0) {
      CSS.highlights.set(HL_ALL, new Highlight(...this.hits.map((hit) => hit.range)));
    }
    if (this.hits.length === 0) {
      this.ui.count.textContent = "0/0";
      return;
    }
    this.current = anchor === null ? 0 : nearestTo(this.hits, anchor);
    this.paintCurrent(jump);
  }

  private step(delta: number): void {
    if (this.hits.length === 0) return;
    this.current = (this.current + delta + this.hits.length) % this.hits.length;
    this.paintCurrent(true);
  }

  private paintCurrent(jump: boolean): void {
    const hit = this.hits[this.current];
    if (!hit) return;
    this.ui.count.textContent = `${this.current + 1}/${this.hits.length}`;
    if (highlightsSupported()) {
      CSS.highlights.set(HL_CURRENT, new Highlight(hit.range));
    }
    if (!jump) return;
    const scroller = findScroller(hit.range.startContainer);
    const rect = hit.range.getBoundingClientRect();
    if (scroller) {
      const box = scroller.getBoundingClientRect();
      scroller.scrollTop += rect.top - box.top - box.height / 2;
    } else {
      hit.range.startContainer.parentElement?.scrollIntoView({ block: "center" });
    }
  }
}

/** 编辑会让偏移整体前后挪，所以认最近的那条，而不是认同一个下标 */
function nearestTo(hits: Hit[], anchor: number): number {
  let best = 0;
  let gap = Number.POSITIVE_INFINITY;
  for (let i = 0; i < hits.length; i += 1) {
    const delta = Math.abs(hits[i].at - anchor);
    if (delta >= gap) break; // at 单调递增，距离开始变大就不会更近了
    gap = delta;
    best = i;
  }
  return best;
}

function collectHits(scope: HTMLElement, query: string): Hit[] {
  const needle = query.toLowerCase();
  const hits: Hit[] = [];
  let offset = 0;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || parent.closest(".vditor-panel, .vditor-hint, .vditor-tip")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node = walker.nextNode();
  while (node) {
    const raw = node.nodeValue ?? "";
    const text = raw.toLowerCase();
    let from = text.indexOf(needle);
    while (from !== -1) {
      const range = document.createRange();
      range.setStart(node, from);
      range.setEnd(node, from + needle.length);
      hits.push({ range, at: offset + from });
      from = text.indexOf(needle, from + needle.length);
      if (hits.length > 2000) return hits;
    }
    offset += raw.length;
    node = walker.nextNode();
  }
  return hits;
}
