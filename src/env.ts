/** 在桌面壳里跑还是在浏览器里跑。Tauri 2 会往 window 上注入 __TAURI_INTERNALS__ */
export const isDesktop =
  typeof window !== "undefined" &&
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !== undefined;

/** Mac 的界面提示与桌面能力；不需要额外的系统插件。 */
export const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
