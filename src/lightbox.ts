// 图看不清时点开的查看层：全屏、滚轮缩放、拖动平移。
//
// 为什么是「另起一层」而不是「把图按自然尺寸画在正文里、栏内横向滚动」：
// 正文里那条路要改渲染管线，而横向滚动的东西在导出 HTML 和打印 PDF 时会被裁掉——
// 纸没有「滚动」这个概念，Typora 和 GitLab 都栽在这上面（typora-issues#2423 / #3291、
// gitlab#583754）。查看层是纯加法，一行渲染逻辑都不碰，打印导出照旧。
// 行业里成熟实现（Typora 的 fullscreen、Obsidian 那一批 mermaid 插件）走的也都是这条。
//
// 按钮不挂进 Vditor 的 contenteditable 树——那棵树序列化成 Markdown 时不认识外来节点，
// 这条跟 table-toolbar.ts 是同一个理由。

import { line } from "./icons";
import { onLangChange, t } from "./i18n";
import {
  clampPan,
  clampScale,
  initialView,
  retargetSvgIds,
  toTransform,
  zoomAt,
  type Size,
  type View,
} from "./lightbox-view";

/** 灯箱边缘留白：图贴着屏幕边不好看，也给控件条让出位置 */
const PADDING = 56;
/** 一次滚轮 / 一次按钮的缩放步长 */
const STEP = 1.25;

/** 能被放大看的东西：mermaid 的预览半边，和正文里的图片 */
type Target =
  | { kind: "mermaid"; el: HTMLElement; svg: SVGSVGElement }
  | { kind: "image"; el: HTMLImageElement };

/**
 * 找出鼠标底下这个元素属不属于「可放大」的东西。
 *
 * mermaid 必须限定在 `.vditor-ir__preview` 里：IR 模式下同一个 `.vditor-ir__node`
 * 底下挂着两份 `.language-mermaid`，另一份是 `.vditor-ir__marker--pre` 里的源码半边
 * （没有 data-processed、没有 svg），那份不是图。
 */
function resolveTarget(node: EventTarget | null): Target | null {
  if (!(node instanceof Element)) return null;
  const mermaid = node.closest<HTMLElement>(".vditor-ir__preview .language-mermaid");
  if (mermaid) {
    const svg = mermaid.querySelector("svg");
    // 语法写错时 mermaid 塞进来的是报错文本，没有可看的图
    return svg ? { kind: "mermaid", el: mermaid, svg } : null;
  }
  const image = node.closest<HTMLImageElement>("img");
  // 表情是当图片渲染的，别给它挂放大按钮
  if (image && !image.classList.contains("vditor-emoji")) return { kind: "image", el: image };
  return null;
}

/** 图的自然尺寸。mermaid 读 viewBox（比 max-width 准，报错图也有），图片读 natural* */
function naturalSize(target: Target): Size {
  if (target.kind === "image") {
    return {
      width: target.el.naturalWidth || target.el.width || 1,
      height: target.el.naturalHeight || target.el.height || 1,
    };
  }
  const box = target.svg.viewBox?.baseVal;
  if (box && box.width > 0 && box.height > 0) return { width: box.width, height: box.height };
  const rect = target.svg.getBoundingClientRect();
  return { width: rect.width || 1, height: rect.height || 1 };
}

let cloneSeq = 0;

type ButtonKey = "zoomOut" | "zoomIn" | "fit" | "close";

export class DiagramLightbox {
  /** hover 到图上时浮出来的那个小按钮 */
  private readonly trigger: HTMLButtonElement;
  private readonly mask: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly holder: HTMLDivElement;
  private readonly percent: HTMLSpanElement;
  private readonly buttons: { el: HTMLButtonElement; key: ButtonKey }[] = [];

  private hovered: Target | null = null;
  private content: Size = { width: 1, height: 1 };
  private view: View = { scale: 1, x: 0, y: 0 };
  private dragPointer: number | null = null;
  private dragFrom = { x: 0, y: 0, viewX: 0, viewY: 0 };

  constructor(
    /** 定位参照系：画布卡片（position: relative），小按钮相对它摆放 */
    private readonly canvas: HTMLElement,
    /** 灯箱遮罩挂这儿——canvas 自己 overflow: hidden，装不下全屏层 */
    maskHost: HTMLElement,
    /** Vditor 的 contenteditable 元素，同时也是滚动容器 */
    private readonly getEditorElement: () => HTMLElement | null,
  ) {
    this.trigger = document.createElement("button");
    this.trigger.type = "button";
    this.trigger.className = "icon-btn wd-zoom-trigger";
    this.trigger.hidden = true;
    this.trigger.innerHTML = line("expand");
    // 按钮浮在编辑区上面，点它默认会把焦点从正文抢走，Vditor 的 IR 节点会跟着收合
    this.trigger.addEventListener("mousedown", (event) => event.preventDefault());
    this.trigger.addEventListener("click", () => this.open());
    canvas.append(this.trigger);

    this.mask = document.createElement("div");
    this.mask.className = "wd-lightbox";
    this.mask.hidden = true;
    this.mask.tabIndex = -1;
    this.mask.setAttribute("role", "dialog");
    this.mask.setAttribute("aria-modal", "true");

    this.stage = document.createElement("div");
    this.stage.className = "wd-lightbox__stage";
    this.holder = document.createElement("div");
    this.holder.className = "wd-lightbox__holder";
    this.stage.append(this.holder);

    const bar = document.createElement("div");
    bar.className = "wd-lightbox__bar";
    this.percent = document.createElement("span");
    this.percent.className = "wd-lightbox__percent";
    const make = (key: ButtonKey, icon: string, run: () => void): HTMLButtonElement => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "icon-btn wd-lightbox__btn";
      button.innerHTML = line(icon);
      button.addEventListener("click", run);
      this.buttons.push({ el: button, key });
      return button;
    };
    bar.append(
      make("zoomOut", "zoom-out", () => this.zoomCenter(1 / STEP)),
      this.percent,
      make("zoomIn", "zoom-in", () => this.zoomCenter(STEP)),
      make("fit", "fit", () => this.reset()),
      make("close", "close", () => this.close()),
    );

    this.mask.append(this.stage, bar);
    maskHost.append(this.mask);
    this.applyLabels();
    onLangChange(() => this.applyLabels());

    this.bindHover();
    this.bindLightbox();
  }

  private applyLabels(): void {
    this.trigger.title = t().lightbox.open;
    for (const { el, key } of this.buttons) el.title = t().lightbox[key];
  }

  // ---------- hover 出小按钮 ----------

  private bindHover(): void {
    // 委托挂在画布上而不是编辑区元素上：编辑区那个 DOM 会被 Vditor 整个换掉（切稿、切语言），
    // 挂在它身上的监听器会跟着没
    this.canvas.addEventListener("mouseover", (event) => {
      if (event.target === this.trigger || this.trigger.contains(event.target as Node)) return;
      const editor = this.getEditorElement();
      if (!editor || !editor.contains(event.target as Node)) {
        this.hideTrigger();
        return;
      }
      const target = resolveTarget(event.target);
      if (!target) {
        this.hideTrigger();
        return;
      }
      this.hovered = target;
      this.placeTrigger();
    });
    this.canvas.addEventListener("mouseleave", () => this.hideTrigger());
    // 滚动时图在动，按钮得跟上；滚出画布就自己藏起来。用捕获阶段：滚动事件不冒泡
    this.canvas.addEventListener("scroll", () => this.placeTrigger(), true);
  }

  private hideTrigger(): void {
    this.hovered = null;
    this.trigger.hidden = true;
  }

  private placeTrigger(): void {
    const target = this.hovered;
    // 图可能已经被重渲染换掉了（用户改了源码），这时按钮不该还浮在半空
    if (!target || !document.contains(target.el)) {
      this.hideTrigger();
      return;
    }
    const hostRect = this.canvas.getBoundingClientRect();
    const rect = target.el.getBoundingClientRect();
    if (rect.bottom < hostRect.top || rect.top > hostRect.bottom) {
      this.trigger.hidden = true;
      return;
    }
    this.trigger.hidden = false;
    // 摆在图的右上角内侧。offsetWidth 要在 hidden 摘掉之后才量得到，所以这两行不能对调
    this.trigger.style.top = `${Math.max(rect.top - hostRect.top + 6, 6)}px`;
    this.trigger.style.left = `${rect.right - hostRect.left - this.trigger.offsetWidth - 6}px`;
  }

  // ---------- 灯箱 ----------

  private bindLightbox(): void {
    // 点空白处关掉。stage 是满屏的，所以判断的是「点没点在内容上」
    this.stage.addEventListener("pointerdown", (event) => {
      if (event.target === this.stage) {
        this.close();
        return;
      }
      this.startDrag(event);
    });
    this.stage.addEventListener("pointermove", (event) => this.moveDrag(event));
    this.stage.addEventListener("pointerup", (event) => this.endDrag(event));
    this.stage.addEventListener("pointercancel", (event) => this.endDrag(event));
    this.stage.addEventListener("dblclick", () => this.reset());
    this.stage.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const rect = this.stage.getBoundingClientRect();
        this.apply(
          zoomAt(this.view, event.deltaY < 0 ? STEP : 1 / STEP, event.clientX - rect.left, event.clientY - rect.top),
        );
      },
      { passive: false },
    );
    this.mask.addEventListener("keydown", (event) => {
      if (this.mask.hidden || !this.onKey(event)) return;
      // 不让 Esc 继续冒泡到 document——帮助面板和查找条也在监听同一个键
      event.preventDefault();
      event.stopPropagation();
    });
  }

  private onKey(event: KeyboardEvent): boolean {
    switch (event.key) {
      case "Escape":
        this.close();
        return true;
      case "+":
      case "=":
        this.zoomCenter(STEP);
        return true;
      case "-":
      case "_":
        this.zoomCenter(1 / STEP);
        return true;
      case "0":
        this.reset();
        return true;
      default:
        return false;
    }
  }

  private open(): void {
    const target = this.hovered;
    if (!target || !document.contains(target.el)) return;
    this.content = naturalSize(target);
    this.holder.replaceChildren(this.cloneOf(target));
    this.holder.style.width = `${this.content.width}px`;
    this.holder.style.height = `${this.content.height}px`;
    this.mask.hidden = false;
    this.hideTrigger();
    // reset 要量 stage 的尺寸，得等 hidden 摘掉、布局算完之后
    this.reset();
    // 接键盘要焦点。落在容器上而不是任何按钮上——聚在按钮上时一个空格就等于盲点它
    this.mask.focus();
  }

  /**
   * 克隆一份放进灯箱，不动原图：原图在 contenteditable 树里，搬出去再搬回来风险太大。
   * SVG 克隆要连 id 一起换掉，否则箭头会去引用原图的 marker，见 retargetSvgIds。
   */
  private cloneOf(target: Target): HTMLElement {
    if (target.kind === "image") {
      const image = document.createElement("img");
      image.src = target.el.currentSrc || target.el.src;
      image.alt = target.el.alt;
      image.className = "wd-lightbox__img";
      return image;
    }
    cloneSeq += 1;
    const holder = document.createElement("div");
    holder.className = "wd-lightbox__svg";
    holder.innerHTML = retargetSvgIds(target.svg.outerHTML, `lb${cloneSeq}-`);
    const svg = holder.querySelector("svg");
    if (svg) {
      // mermaid 写的是 width="100%" + max-width:自然宽，那套是给正文栏用的。
      // 灯箱里固定成自然尺寸，缩放全交给外层 transform
      svg.setAttribute("width", String(this.content.width));
      svg.setAttribute("height", String(this.content.height));
      svg.style.maxWidth = "none";
      svg.style.width = `${this.content.width}px`;
      svg.style.height = `${this.content.height}px`;
    }
    return holder;
  }

  private viewport(): Size {
    const rect = this.stage.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  private reset(): void {
    this.apply(initialView(this.content, this.viewport(), PADDING));
  }

  private zoomCenter(factor: number): void {
    const size = this.viewport();
    this.apply(zoomAt(this.view, factor, size.width / 2, size.height / 2));
  }

  private apply(next: View): void {
    this.view = clampPan({ ...next, scale: clampScale(next.scale) }, this.content, this.viewport());
    this.holder.style.transform = toTransform(this.view);
    this.percent.textContent = `${Math.round(this.view.scale * 100)}%`;
  }

  private startDrag(event: PointerEvent): void {
    this.dragPointer = event.pointerId;
    this.dragFrom = { x: event.clientX, y: event.clientY, viewX: this.view.x, viewY: this.view.y };
    this.stage.setPointerCapture(event.pointerId);
    this.stage.classList.add("is-dragging");
  }

  private moveDrag(event: PointerEvent): void {
    if (this.dragPointer !== event.pointerId) return;
    this.apply({
      scale: this.view.scale,
      x: this.dragFrom.viewX + (event.clientX - this.dragFrom.x),
      y: this.dragFrom.viewY + (event.clientY - this.dragFrom.y),
    });
  }

  private endDrag(event: PointerEvent): void {
    if (this.dragPointer !== event.pointerId) return;
    this.dragPointer = null;
    this.stage.classList.remove("is-dragging");
  }

  close(): void {
    if (this.mask.hidden) return;
    this.mask.hidden = true;
    // 大图留在 DOM 里白占内存，下次打开还会闪一下旧内容
    this.holder.replaceChildren();
    this.getEditorElement()?.focus();
  }

  get isOpen(): boolean {
    return !this.mask.hidden;
  }
}
