// 右栏大纲：点一下跳过去。
//
// 标题一律从画布 DOM 读，不从 markdown 正则解析——
// 解析和渲染是两套规则，一旦对不上（比如 setext 的「标题 + ===」写法），
// 大纲的第 N 条就会跳到画布的第 M 个标题上去。同一个 querySelectorAll 出来的顺序，才不会错位。

import { onLangChange, t } from "./i18n";

export interface Heading {
  level: number;
  text: string;
  /** 在画布 h1~h6 里的序号，与跳转时取的元素一一对应 */
  index: number;
}

export class Outline {
  private headings: Heading[] = [];
  private activeIndex = -1;

  constructor(
    private container: HTMLElement,
    private onJump: (index: number) => void,
  ) {
    this.container.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
      if (!target) return;
      this.onJump(Number(target.dataset.index));
    });
    onLangChange(() => this.render());
  }

  update(next: Heading[]): void {
    if (this.sameAs(next)) return;
    this.headings = next;
    this.render();
  }

  private sameAs(next: Heading[]): boolean {
    if (next.length !== this.headings.length) return false;
    return next.every(
      (item, i) => item.text === this.headings[i].text && item.level === this.headings[i].level,
    );
  }

  setActive(index: number): void {
    if (index === this.activeIndex) return;
    this.activeIndex = index;
    for (const row of this.container.querySelectorAll<HTMLElement>("[data-index]")) {
      if (Number(row.dataset.index) === index) row.dataset.active = "1";
      else delete row.dataset.active;
    }
  }

  private render(): void {
    this.container.textContent = "";
    if (this.headings.length === 0) {
      const empty = document.createElement("p");
      empty.className = "side-empty";
      empty.textContent = t().outline.empty;
      this.container.append(empty);
      return;
    }
    const top = Math.min(...this.headings.map((item) => item.level));
    const list = document.createElement("ul");
    list.className = "outline-list";
    for (const heading of this.headings) {
      const item = document.createElement("li");
      const row = document.createElement("button");
      row.type = "button";
      row.className = "outline-row";
      row.dataset.index = String(heading.index);
      row.dataset.level = String(heading.level);
      row.style.paddingLeft = `${8 + (heading.level - top) * 12}px`;
      row.textContent = heading.text;
      row.title = heading.text;
      if (heading.index === this.activeIndex) row.dataset.active = "1";
      item.append(row);
      list.append(item);
    }
    this.container.append(list);
  }
}
