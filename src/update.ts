// 应用内自动更新。
//
// 这个模块只管两件事：问一句「有没有新版」，以及把「要不要装」这个决定摆给用户。
// 真正的下载、校验签名、拉起安装器全在 tauri-plugin-updater 里，我们一行都不重写。
//
// 有一条必须先讲清的事实，它决定了下面所有的设计：
// **Windows 上 `update.install()` 走的是 `std::process::exit(0)`**
// （plugins-workspace/plugins/updater/src/updater.rs:876，2026-08-25 读的源码）。
// 进程是被硬杀的——没有 beforeunload，没有 Vditor 的收尾，自动保存的两秒定时器也不会再响。
// 所以「装之前必须先落盘，落不了盘就不许装」不是保守，是这条路上唯一的闸。
// canInstallNow() 就是那道闸，它是纯函数，有测试。

import { check, type Update } from "@tauri-apps/plugin-updater";
import { isDesktop } from "./fs";

export type { Update };

/** 装不了的原因。每一种都对应一段用户看得懂的解释，别合并成一个笼统的「保存失败」 */
export type BlockReason = "conflict" | "missing" | "unsaved";

/** canInstallNow() 要看的那点状态。刻意只收这三个布尔量，不收整个 state——纯函数才好测 */
export interface InstallGuard {
  /** 冲突对话框正开着：磁盘和画布分叉了，用户还没选留哪一份 */
  conflict: boolean;
  /** 这篇稿子在磁盘上已经没了，内容只活在画布上 */
  missing: boolean;
  /** 刚才那次 save() 的结果：true 表示磁盘上那份已经跟画布一致 */
  saved: boolean;
}

export type InstallVerdict = { ok: true } | { ok: false; reason: BlockReason };

/**
 * 现在装这个更新安不安全。
 *
 * 顺序有意义：conflict 和 missing 都会让 save() 返回 false，
 * 但它们各自有具体得多的解释和出路（选一份留下 / 按 Ctrl+S 写回去），
 * 笼统地报「还没保存」等于把用户推去干一件他刚试过、并不管用的事。
 * 所以先认这两个具体的，`unsaved` 只兜剩下的。
 */
export function canInstallNow(guard: InstallGuard): InstallVerdict {
  if (guard.conflict) return { ok: false, reason: "conflict" };
  if (guard.missing) return { ok: false, reason: "missing" };
  if (!guard.saved) return { ok: false, reason: "unsaved" };
  return { ok: true };
}

/**
 * 查更新的三种结局。分成三种而不是「Update | null」，
 * 是因为**启动时的静默检查和帮助面板里的手动检查对失败的态度相反**：
 * 前者必须一声不吭（Sheaf 的承诺是断网照样能写，开机弹「更新检查失败」是自打耳光），
 * 后者必须有反馈（用户明确点了按钮，什么都不发生比报错更糟）。
 * 把失败混进 null 里，这个区别就没法在调用处表达了。
 */
export type CheckResult =
  | { kind: "update"; update: Update }
  | { kind: "current" }
  | { kind: "failed"; error: unknown };

export async function checkForUpdate(): Promise<CheckResult> {
  // 浏览器版没有更新器这回事。静态 import 在浏览器里只要不调用就不会炸（跟 fs.ts 里
  // 那几个 @tauri-apps/plugin-fs 的 import 同一个道理），所以守卫放在这里就够了
  if (!isDesktop) return { kind: "current" };
  try {
    const update = await check();
    return update ? { kind: "update", update } : { kind: "current" };
  } catch (error) {
    return { kind: "failed", error };
  }
}

/** 下载进度。contentLength 是可选的——服务端没给 Content-Length 时就只能报已下载字节数 */
export interface DownloadProgress {
  received: number;
  total: number | null;
}

export interface UpdatePromptUi {
  mask: HTMLElement;
  box: HTMLElement;
  body: HTMLElement;
  close: HTMLButtonElement;
  later: HTMLButtonElement;
  now: HTMLButtonElement;
  progress: HTMLElement;
  bar: HTMLElement;
  progressText: HTMLElement;
  blocked: HTMLElement;
}

export interface UpdatePromptText {
  /** 「Sheaf 0.1.4 可用，你现在装的是 0.1.3」 */
  body: (from: string, to: string) => string;
  /** 「正在下载… 3.2 MB / 8.7 MB」 */
  progress: (received: string, total: string | null) => string;
  blocked: Record<BlockReason, string>;
  failed: string;
}

/**
 * 更新提示框。
 *
 * 整个结构照抄冲突框（`src/main.ts` 的 showConflict / hideConflict），包括那条真机踩出来的规矩：
 * **弹出来时焦点给对话框容器，不给任何按钮**。用户正连着打字时框弹出来，
 * 下一个空格或回车会落在已聚焦的按钮上——在冲突框那里这意味着盲选丢稿，
 * 在这里意味着他一个字没看见就开始下载并重启。同一个坑，同一个解法。
 */
export class UpdatePrompt {
  /** 下载已经开始：这之后不许关框，也不许再点一次 */
  private busy = false;
  private update: Update | null = null;

  constructor(
    private ui: UpdatePromptUi,
    private text: () => UpdatePromptText,
    /** 由 main.ts 提供：先落盘、过闸、再下载安装。返回被拦下的原因，一路通到底则不返回 */
    private run: (
      update: Update,
      onProgress: (p: DownloadProgress) => void,
    ) => Promise<BlockReason | "failed" | null>,
  ) {
    this.ui.later.addEventListener("click", () => this.hide());
    this.ui.close.addEventListener("click", () => this.hide());
    this.ui.now.addEventListener("click", () => void this.start());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.ui.mask.hidden) this.hide();
    });
  }

  show(update: Update): void {
    this.update = update;
    this.busy = false;
    this.ui.body.textContent = this.text().body(update.currentVersion, update.version);
    this.ui.progress.hidden = true;
    this.ui.blocked.hidden = true;
    this.ui.now.disabled = false;
    this.ui.mask.hidden = false;
    this.ui.box.focus();
  }

  hide(): void {
    // 下载已经在跑了就不给关——关了框下载还在继续，装完照样重启，
    // 那时用户会觉得「我明明取消了」。要么别开始，要么走完
    if (this.busy) return;
    this.ui.mask.hidden = true;
  }

  private async start(): Promise<void> {
    if (this.busy || !this.update) return;
    this.busy = true;
    this.ui.now.disabled = true;
    this.ui.blocked.hidden = true;
    this.ui.progress.hidden = false;
    this.renderProgress({ received: 0, total: null });

    const blocked = await this.run(this.update, (p) => this.renderProgress(p));

    // 走到这里说明没装成——装成了的话进程在 install() 里就被杀了，
    // 这几行根本不会执行。所以这里只需要处理失败路径
    this.busy = false;
    this.ui.now.disabled = false;
    this.ui.progress.hidden = true;
    if (blocked) {
      this.ui.blocked.textContent =
        blocked === "failed" ? this.text().failed : this.text().blocked[blocked];
      this.ui.blocked.hidden = false;
    }
  }

  private renderProgress(p: DownloadProgress): void {
    const pct = p.total ? Math.min(100, Math.round((p.received / p.total) * 100)) : 0;
    // 总长度未知时进度条留空，不要拿一个瞎猜的宽度骗人
    this.ui.bar.style.width = p.total ? `${pct}%` : "0%";
    this.ui.progressText.textContent = this.text().progress(
      formatBytes(p.received),
      p.total === null ? null : formatBytes(p.total),
    );
  }
}

/** 「3.2 MB」。安装包在几 MB 到几十 MB 之间，KB/MB 两档就够，不做通用单位表 */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
