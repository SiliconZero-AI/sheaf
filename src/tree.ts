// 左栏文件树：只显示 .md 和装着 .md 的目录。
// 支持同时挂多个文件夹（工作区）——写长文常常要在几个目录之间来回翻，
// 一次只能开一个的话，等于逼人反复重选。

import type { DirNode, FileNode, TreeNode } from "./fs";
import { isDesktop } from "./env";
import { showContextMenu } from "./context-menu";
import { onLangChange, t } from "./i18n";

export interface TreeSpace {
  /** 会话内稳定的 id，用来记折叠状态和当前选中项 */
  id: string;
  tree: DirNode;
}

/**
 * 上次开着、但这次权限没自动续上的文件夹。
 * 浏览器规定：关掉浏览器后授权就失效，网页不能自己偷偷拿回来，必须用户点一下。
 * 与其在顶栏摆一个「恢复上次的文件夹」让人猜那是什么，
 * 不如把文件夹名字直接摆在左栏，旁边写「点一下继续用」——用户看到的是自己的东西。
 */
export interface PendingSpace {
  name: string;
}

export class FileTree {
  private collapsed = new Set<string>();
  private spaces: TreeSpace[] = [];
  private pending: PendingSpace[] = [];
  private activeKey: string | null = null;

  constructor(
    private container: HTMLElement,
    private onOpen: (spaceId: string, node: FileNode, intoEditor: boolean) => void,
    private onRemove: (spaceId: string) => void,
    private onPickDir: () => void,
    private onResume: () => void,
    private onDelete: (spaceId: string, node: FileNode) => void,
    private onRename: (spaceId: string, node: FileNode, name: string) => Promise<boolean>,
  ) {
    onLangChange(() => this.render());

    // 右键一篇稿子 → 重命名 / 删除。**只在桌面壳给**：浏览器端没有原地改名，
    // 也没有回收站；硬凑一套能力不完整的菜单比没有更糟。
    if (isDesktop) {
      this.container.addEventListener("contextmenu", (event) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>("[data-path]");
        // 目录行和组头不给：删文件夹不在这一批的范围里
        if (!row || row.dataset.kind !== "file") return;
        const node = this.find(row.dataset.space ?? "", row.dataset.path ?? "");
        if (!node) return;
        // 拦下系统自带的那个菜单，不然两个菜单会叠在一起
        event.preventDefault();
        const spaceId = row.dataset.space ?? "";
        showContextMenu(event.clientX, event.clientY, [
          { label: t().rename.menu, run: () => this.beginRename(row, spaceId, node) },
          { label: t().del.menu, danger: true, run: () => this.onDelete(spaceId, node) },
        ]);
      });

      // F2 重命名、Del 删除，都只在焦点仍属于文件树时生效。
      // 监听挂在树容器上而不是 window：焦点在正文时这里根本收不到事件，
      // 所以正文里按 Del 照常删字符，两件事不会打架
      this.container.addEventListener("keydown", (event) => {
        if (event.target instanceof HTMLInputElement) return;
        if (event.key !== "Delete" && event.key !== "F2") return;
        const row = (event.target as HTMLElement).closest<HTMLElement>("[data-path]");
        if (!row || row.dataset.kind !== "file") return;
        const node = this.find(row.dataset.space ?? "", row.dataset.path ?? "");
        if (!node) return;
        event.preventDefault();
        const spaceId = row.dataset.space ?? "";
        if (event.key === "F2") this.beginRename(row, spaceId, node);
        else this.onDelete(spaceId, node);
      });
    }

    // 上下走 + 回车进正文。这两样是「焦点留在左栏」的配套：
    // 焦点既然不再被正文抢走，就得让它在左栏里能动、也能主动交出去，
    // 否则用户点完一篇会卡在一个不能打字也不能翻的地方
    this.container.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const rows = [...this.container.querySelectorAll<HTMLElement>("[data-path]")];
        const at = rows.indexOf(
          (event.target as HTMLElement).closest<HTMLElement>("[data-path]") as HTMLElement,
        );
        if (at < 0) return;
        const next = rows[at + (event.key === "ArrowDown" ? 1 : -1)];
        if (!next) return;
        // 到头就停住，不绕回另一端——绕回去会让人以为自己按错了方向
        event.preventDefault();
        next.focus();
        return;
      }
      if (event.key !== "Enter") return;
      const row = (event.target as HTMLElement).closest<HTMLElement>("[data-path]");
      if (!row || row.dataset.kind !== "file") return;
      const node = this.find(row.dataset.space ?? "", row.dataset.path ?? "");
      if (!node) return;
      // 文件行自己接管回车：这一条明确把焦点送进正文。
      event.preventDefault();
      this.onOpen(row.dataset.space ?? "", node, true);
    });

    this.container.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target instanceof HTMLInputElement) return;

      if (target.closest("[data-pick-dir]")) {
        this.onPickDir();
        return;
      }

      if (target.closest("[data-resume]")) {
        this.onResume();
        return;
      }

      const remove = target.closest<HTMLElement>("[data-remove]");
      if (remove) {
        this.onRemove(remove.dataset.remove ?? "");
        return;
      }

      const row = target.closest<HTMLElement>("[data-path]");
      if (!row || row.dataset.renaming === "1") return;
      const spaceId = row.dataset.space ?? "";
      const path = row.dataset.path ?? "";
      if (row.dataset.kind === "dir") {
        this.toggleFold(key(spaceId, path));
        return;
      }
      const node = this.find(spaceId, path);
      // 打开它，但光标不进正文——焦点留在左栏，Del 和方向键才有得使。
      // 跟资源管理器 / VS Code 同一个规矩：想写字按回车（或者点一下正文）
      if (node) this.onOpen(spaceId, node, false);
    });
  }

  setSpaces(spaces: TreeSpace[], pending: PendingSpace[] = []): void {
    this.spaces = spaces;
    this.pending = pending;
    this.render();
  }

  /**
   * 把键盘焦点放到某一行上。
   *
   * 给「点了左栏某篇」那条路用：打开文件的过程里 Vditor 的 setValue 会把焦点抢进正文
   * （实测点击后约 50ms 发生），所以光靠 render() 里那次归还挡不住，要在开完之后再放一次。
   * 隔两帧是为了排在 restorePosition 那两层 requestAnimationFrame 后面。
   */
  /** 把焦点放回当前选中的那一行。焦点被别人抢走后用它讨回来 */
  focusActive(): void {
    if (!this.activeKey) return;
    const row = this.container.querySelector<HTMLElement>('[data-path][data-active="1"]');
    row?.focus({ preventScroll: true });
  }

  focusRow(spaceId: string, path: string): void {
    const put = () => {
      const row = this.container.querySelector<HTMLElement>(
        `[data-space="${CSS.escape(spaceId)}"][data-path="${CSS.escape(path)}"]`,
      );
      row?.focus({ preventScroll: true });
    };
    requestAnimationFrame(() => requestAnimationFrame(put));
  }

  setActive(spaceId: string | null, path: string | null): void {
    this.activeKey = spaceId && path ? key(spaceId, path) : null;
    this.render();
  }

  private toggleFold(k: string): void {
    if (this.collapsed.has(k)) this.collapsed.delete(k);
    else this.collapsed.add(k);
    this.render();
  }

  private find(spaceId: string, path: string): FileNode | null {
    const space = this.spaces.find((item) => item.id === spaceId);
    return space ? findIn(space.tree, path) : null;
  }

  /** 把文件行原地换成输入框；Enter 提交，Esc 或点到别处取消 */
  private beginRename(row: HTMLElement, spaceId: string, node: FileNode): void {
    const matched = node.name.match(/\.(md|markdown)$/i);
    if (!matched) return;
    const extension = matched[0];
    const input = document.createElement("input");
    input.className = "tree-rename-input";
    input.type = "text";
    input.value = node.name.slice(0, -extension.length);
    input.setAttribute("aria-label", t().rename.menu);
    input.spellcheck = false;

    const suffix = document.createElement("span");
    suffix.className = "tree-rename-suffix";
    suffix.textContent = extension;

    row.dataset.renaming = "1";
    row.removeAttribute("title");
    row.replaceChildren(input, suffix);

    let committing = false;
    const cancel = () => {
      if (!committing) this.render();
    };
    const commit = async () => {
      if (committing) return;
      committing = true;
      input.disabled = true;
      const ok = await this.onRename(spaceId, node, input.value);
      if (ok) {
        // 成功路径通常已重扫过整棵树；同名 no-op 没重扫，在这里统一收掉输入框。
        if (input.isConnected) this.render();
        return;
      }
      committing = false;
      if (!input.isConnected) return;
      input.disabled = false;
      input.focus({ preventScroll: true });
      input.select();
    };

    input.addEventListener("mousedown", (event) => event.stopPropagation());
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("blur", cancel);
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      } else if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        void commit();
      }
    });
    input.focus({ preventScroll: true });
    input.select();
  }

  private render(): void {
    // 整棵重建会把当前聚焦的那个按钮一起扔掉，焦点掉回 body。
    // 平时看不出来，但键盘操作全靠它：点一下某篇 → setActive 触发重渲染 → 焦点没了 →
    // 这时按 Del 什么都不会发生。所以重建前记下焦点落在哪一行，建完还回去。
    const focusedRow =
      this.container.contains(document.activeElement) && document.activeElement instanceof HTMLElement
        ? (document.activeElement.closest<HTMLElement>("[data-path]") ?? null)
        : null;
    const refocus = focusedRow
      ? { space: focusedRow.dataset.space ?? "", path: focusedRow.dataset.path ?? "" }
      : null;

    this.container.textContent = "";

    // 待恢复的文件夹排在最上面：让人一眼看到「我的文件夹在这儿，点一下就回来」
    for (const item of this.pending) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "tree-resume";
      row.dataset.resume = "1";
      const name = document.createElement("span");
      name.className = "tree-name";
      name.textContent = item.name;
      const hint = document.createElement("small");
      hint.textContent = t().tree.resumeHint;
      row.append(name, hint);
      row.title = t().tree.resumeTitle(item.name);
      this.container.append(row);
    }

    if (this.spaces.length === 0 && this.pending.length > 0) return;
    if (this.spaces.length === 0) {
      // 空状态不能只是一片空白，也不能只写一句话——给一个真能点的按钮
      const empty = document.createElement("p");
      empty.className = "side-empty";
      empty.textContent = t().tree.emptyHint;
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "side-action";
      pick.dataset.pickDir = "1";
      pick.textContent = t().tree.pickButton;
      this.container.append(empty, pick);
      return;
    }

    for (const space of this.spaces) {
      const folded = this.collapsed.has(key(space.id, ""));

      const head = document.createElement("div");
      head.className = "tree-space";

      const name = document.createElement("button");
      name.type = "button";
      name.className = "tree-space-name";
      name.dataset.space = space.id;
      name.dataset.path = "";
      name.dataset.kind = "dir";
      // 显示文件夹名，完整路径留给悬停——名字重名时靠它区分
      name.title = space.tree.handle.path ?? space.tree.name;
      const caret = document.createElement("span");
      caret.className = "tree-caret";
      caret.textContent = folded ? "▸" : "▾";
      const label = document.createElement("span");
      label.className = "tree-name";
      label.textContent = space.tree.name;
      name.append(caret, label);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "tree-space-remove";
      remove.dataset.remove = space.id;
      // 说清楚只是从列表里拿掉，不然没人敢点
      remove.title = t().tree.removeTitle;
      remove.textContent = "×";

      head.append(name, remove);
      this.container.append(head);

      if (!folded) {
        this.container.append(this.renderList(space.id, space.tree.children, 0));
      }
    }

    // 把焦点还给重建之前的那一行。找不到（那一篇刚被删掉、或者折叠起来了）就不还——
    // 硬塞给别的行等于替用户挪了光标，比丢焦点更莫名其妙
    if (refocus) {
      const again = this.container.querySelector<HTMLElement>(
        `[data-space="${CSS.escape(refocus.space)}"][data-path="${CSS.escape(refocus.path)}"]`,
      );
      // preventScroll：还焦点是我们自作主张的动作，不该顺带把左栏滚到别处
      again?.focus({ preventScroll: true });
    }
  }

  private renderList(spaceId: string, nodes: TreeNode[], depth: number): HTMLUListElement {
    const list = document.createElement("ul");
    list.className = "tree-list";
    for (const node of nodes) {
      const item = document.createElement("li");
      // 文件行用 role=button 的 div：重命名时里面要放输入框，HTML 不允许 input 嵌在 button 里。
      const row: HTMLElement = document.createElement(node.kind === "file" ? "div" : "button");
      if (row instanceof HTMLButtonElement) row.type = "button";
      else {
        row.tabIndex = 0;
        row.setAttribute("role", "button");
      }
      row.className = "tree-row";
      row.dataset.space = spaceId;
      row.dataset.path = node.path;
      row.dataset.kind = node.kind;
      row.style.paddingLeft = `${8 + depth * 12}px`;
      row.title = node.name;

      if (node.kind === "dir") {
        const folded = this.collapsed.has(key(spaceId, node.path));
        row.dataset.folded = folded ? "1" : "0";
        const caret = document.createElement("span");
        caret.className = "tree-caret";
        caret.textContent = folded ? "▸" : "▾";
        const label = document.createElement("span");
        label.className = "tree-name";
        label.textContent = node.name;
        row.append(caret, label);
        item.append(row);
        if (!folded) item.append(this.renderList(spaceId, node.children, depth + 1));
      } else {
        if (key(spaceId, node.path) === this.activeKey) row.dataset.active = "1";
        const label = document.createElement("span");
        label.className = "tree-name";
        label.textContent = node.name.replace(/\.(md|markdown)$/i, "");
        row.append(label);
        item.append(row);
      }
      list.append(item);
    }
    return list;
  }
}

function key(spaceId: string, path: string): string {
  return `${spaceId}\u0000${path}`;
}

function findIn(node: DirNode, path: string): FileNode | null {
  for (const child of node.children) {
    if (child.kind === "file") {
      if (child.path === path) return child;
    } else {
      const hit = findIn(child, path);
      if (hit) return hit;
    }
  }
  return null;
}
