// 实时监听：外面（AI、别的编辑器、同步盘）一动文件，这里就知道。
//
// 两个坑是实查 Tauri 源码才发现的，都写在这里免得下次再踩：
//
//   坑一：官方 watch() 的 delayMs **默认 2000ms**。照默认用，AI 落盘两秒后画面才动，
//         「立刻显示」直接不成立。所以下面显式传了一个小值。
//
//   坑二：那个参数名字叫防抖，但 Rust 侧 debounce 完仍然是
//         `for event in events { on_event.send(event) }` —— **一条一条**发过来。
//         所以它只压 IPC 量，不等于我们拿到的是合并后的一条。
//         防闪必须在这里自己再合并一层，指望那个参数是错的。
//
// 还有一条设计决定：**盯目录，不盯单个文件**。
// AI 工具改文件常用「先写一份临时文件、再改名盖掉原来那份」，死盯着旧的那份会跟丢、
// 还会误报「文件没了」。盯目录既躲开这个坑，又顺带解决「AI 新建了文件、左栏要冒出来」。

import { watch, type UnwatchFn } from "@tauri-apps/plugin-fs";

/** 传给官方 watch() 的值。不是默认的 2000 */
const DELAY_MS = 150;
/** 我们自己这一层的合并窗口：一批事件只惊动上层一次 */
const COALESCE_MS = 120;

export interface WatchTarget {
  /** 要盯的目录绝对路径 */
  path: string;
  /** 工作区根目录要连子目录一起盯；散篇只盯它所在的那一层 */
  recursive: boolean;
}

/**
 * 一组目录监听。换工作区、换稿子时整体重挂——
 * 逐个增删算得清楚但很容易漏一个，而漏掉的那个就是「这篇不同步」的 bug。
 */
export class DirWatcher {
  private stops: UnwatchFn[] = [];
  private pending = new Set<string>();
  private timer = 0;
  /** 重挂时用来作废上一轮还没回来的 watch()，否则旧监听会漏在外面永远关不掉 */
  private generation = 0;

  constructor(private readonly onChange: (paths: string[]) => void) {}

  async apply(targets: WatchTarget[]): Promise<void> {
    const mine = (this.generation += 1);
    this.stopAll();
    for (const target of targets) {
      try {
        const stop = await watch(
          target.path,
          (event) => this.collect(event.paths ?? []),
          { recursive: target.recursive, delayMs: DELAY_MS },
        );
        // 等 watch() 回来的这一小会儿里可能已经又重挂了一轮，这个就是弃子
        if (mine !== this.generation) stop();
        else this.stops.push(stop);
      } catch (error) {
        // 目录被删了、在拔掉的移动硬盘上都会走到这里。
        // 少盯一个目录只是那个文件夹不实时，不该让其余的一起瘫掉
        console.warn("[Sheaf] 盯不住这个文件夹", target.path, error);
      }
    }
  }

  stopAll(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;
    this.pending.clear();
    for (const stop of this.stops) {
      try {
        stop();
      } catch {
        // 已经失效的监听再关一次会抛，无所谓
      }
    }
    this.stops = [];
  }

  /** 攒一批再往上报（坑二）。AI 流式写入一秒好几次，逐条上报就是画面在抖 */
  private collect(paths: string[]): void {
    for (const path of paths) this.pending.add(path);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      const batch = [...this.pending];
      this.pending.clear();
      this.timer = 0;
      if (batch.length > 0) this.onChange(batch);
    }, COALESCE_MS);
  }
}

/** 从绝对路径里取所在目录。散篇要盯的就是这一层 */
export function parentDir(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  const cut = normalized.lastIndexOf("/");
  if (cut <= 0) return null;
  return normalized.slice(0, cut);
}
