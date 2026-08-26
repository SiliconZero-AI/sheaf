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
/**
 * 我们自己这一层的合并窗口：一批事件只惊动上层一次。
 *
 * 必须明显大于 DELAY_MS——Rust 侧是每 DELAY_MS 攒一批送过来，
 * 这个窗口要是比批次间隔还短，每一批都会独立触发一次，合并等于没做
 * （第一次实现取 120 就是这么翻的车，7 秒的流式写入刷了约 46 次，画面肉眼可见地抖）。
 *
 * 注意这只是第一道。真正扛住流式写入的是 main.ts 的 waitForQuiet——
 * 那个判据是磁盘状态本身，不靠猜窗口。
 */
const COALESCE_MS = 300;
/**
 * 扣留上限。尾部合并有个要命的副作用：事件一直来，计时器就一直被重置，于是一次都不放行。
 * 2026-08-25 真机实测：40ms 一次连写 20 秒，整整 20 秒一条都没往下报，
 * 用户盯着旧内容干等——「AI 落盘、旁边立刻显示」直接反过来了。
 * 下游那层「最多等 5 秒就先刷一次」的兜底也因此没机会跑，是被这里饿死的。
 * 所以扣满这个时间必须放行一次，不管事件还在不在来。
 */
const MAX_HOLD_MS = 1000;

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
  /** 这一批最早那个事件是什么时候到的，用来卡扣留上限。0 = 手上没扣着东西 */
  private heldSince = 0;
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
    this.heldSince = 0;
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
    if (this.heldSince === 0) this.heldSince = Date.now();
    window.clearTimeout(this.timer);
    // 扣满上限就立刻放行：再等下去就是「一直有人写、我们就一直不显示」
    const wait = Math.max(0, Math.min(COALESCE_MS, this.heldSince + MAX_HOLD_MS - Date.now()));
    this.timer = window.setTimeout(() => this.flush(), wait);
  }

  private flush(): void {
    const batch = [...this.pending];
    this.pending.clear();
    this.timer = 0;
    this.heldSince = 0;
    if (batch.length > 0) this.onChange(batch);
  }
}

/** 从绝对路径里取所在目录。散篇要盯的就是这一层 */
export function parentDir(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  const cut = normalized.lastIndexOf("/");
  if (cut <= 0) return null;
  return normalized.slice(0, cut);
}
