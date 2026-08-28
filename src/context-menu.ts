// 右键菜单。目前只有左栏文件行在用，只有「删除」一项。
//
// 为什么删除走右键、不走文件行上的悬停按钮：工作区组头已经有一个悬停出现的 ×，
// 它的意思是「只从列表里拿掉，绝不碰磁盘」。在同一棵树里再放一个长得差不多的悬停按钮、
// 意思却是「真删磁盘上的文件」，等于主动制造误触。右键是资源管理器 / VS Code / Obsidian
// 三家一致的位置，用户不用学，而且将来要加「重命名」「在资源管理器中显示」有地方放。

export interface MenuItem {
  label: string;
  /** 危险动作（删除）画成红的，跟中性项区分开 */
  danger?: boolean;
  run: () => void;
}

/** 同一时刻只允许有一个菜单。开第二个之前先把上一个收掉 */
let open: (() => void) | null = null;

export function closeContextMenu(): void {
  open?.();
}

/**
 * 在 (x, y) 处弹一个菜单。坐标是视口坐标，直接用 MouseEvent 的 clientX/clientY。
 *
 * 收场的路子给全：点别处、右键别处、Esc、滚动、窗口失焦、切窗口。
 * 少给一条，用户就会遇到「那个小方块赖在屏幕上下不来」——第 5 批的拖放提示层
 * 正是栽在「只留了一种收场条件」上，这里不重犯。
 */
export function showContextMenu(x: number, y: number, items: MenuItem[]): void {
  closeContextMenu();
  if (items.length === 0) return;

  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.setAttribute("role", "menu");

  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ctx-item";
    button.setAttribute("role", "menuitem");
    if (item.danger) button.dataset.danger = "1";
    button.textContent = item.label;
    button.addEventListener("click", () => {
      close();
      item.run();
    });
    menu.append(button);
  }

  document.body.append(menu);

  // 先量再摆：贴着右边或下边弹出时要翻到反方向，否则菜单一半在屏幕外点不到
  const box = menu.getBoundingClientRect();
  const left = x + box.width > window.innerWidth ? Math.max(0, x - box.width) : x;
  const top = y + box.height > window.innerHeight ? Math.max(0, y - box.height) : y;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };
  // 捕获阶段收：菜单外的点击可能被别的组件 stopPropagation 掉，冒泡阶段就等不到了
  const onPointer = (event: Event) => {
    if (!menu.contains(event.target as Node)) close();
  };

  function close(): void {
    if (open !== close) return;
    open = null;
    menu.remove();
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("mousedown", onPointer, true);
    document.removeEventListener("contextmenu", onPointer, true);
    window.removeEventListener("blur", close);
    window.removeEventListener("resize", close);
    // 滚动监听挂捕获：左栏自己滚的时候事件不冒泡到 window
    window.removeEventListener("scroll", close, true);
  }

  open = close;
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("mousedown", onPointer, true);
  document.addEventListener("contextmenu", onPointer, true);
  window.addEventListener("blur", close);
  window.addEventListener("resize", close);
  window.addEventListener("scroll", close, true);
}
