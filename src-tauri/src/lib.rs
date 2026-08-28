use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// 冷启动时命令行参数里带的那篇 .md（如果有）。前端就绪后调 `take_pending_file` 领走，
/// 领过一次就清空——避免重建 WebView 实例（语言切换那条路）时被误当成「又双击了一次」重开。
struct PendingFile(Mutex<Option<String>>);

/// 操作系统「打开方式」传来的参数里找第一个 .md/.markdown 路径。
/// 参数里还会混着可执行文件自己的路径、Windows 有时附带的其它 flag，所以不能直接拿 argv[1]。
fn extract_md_path(args: &[String]) -> Option<String> {
    args.iter()
        .find(|a| {
            let lower = a.to_lowercase();
            lower.ends_with(".md") || lower.ends_with(".markdown")
        })
        .cloned()
}

#[tauri::command]
fn take_pending_file(state: tauri::State<PendingFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// 把一个文件挪进系统回收站。**不是永久删除**——这是这条命令存在的全部理由。
///
/// `tauri-plugin-fs` 的 `remove()` 只能永久删，官方的 move-to-trash 需求
/// （tauri#5680，2022 年开的）至今没做，所以没有内置路子，只能自己开一条。
/// 走 `trash` crate 而不是手写 `SHFileOperationW`：Windows 上它用的是
/// 微软自 Vista 起推荐的 `IFileOperation`，而且 mac/Linux 也一并有了。
///
/// 错误只回原文给前端打日志用，**不在这里拼给用户看的话**——
/// 那属于 i18n，词典在 src/i18n/，Rust 这边不该有第二份中文。
#[tauri::command]
fn move_to_trash(path: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        trash::delete(&path).map_err(|error| error.to_string())
    }
    // 移动端没有回收站这个概念，trash crate 也不支持——这条命令在那边不该被调到。
    // 与其让它编不过，不如明确地失败：前端拿到 Err 会按「删不掉」提示，文件毫发无损。
    #[cfg(not(desktop))]
    {
        let _ = path;
        Err("trash is not available on this platform".to_string())
    }
}

/// 把刚扔进回收站的那个文件捞回原处。给「删错了按 Ctrl+Z」用。
///
/// **只有 Windows 和 Linux 有**：`trash` crate 的 `os_limited` 模块自己就是这么划的，
/// macOS 那边压根没有列举／还原回收站的 API。所以打 mac 包时这条命令一定失败，
/// 前端的撤销入口届时要跟着收掉（见 ROADMAP 第 9 条）。
///
/// 为什么要现列一遍回收站而不是删的时候把凭据存下来：`trash::delete` 只回 `()`，
/// 拿不到那一项的 id。好在这是用户按一下键才触发的一次性操作，列一遍不心疼。
///
/// 同一个路径可能在回收站里躺着好几份（删了又建、再删）——取 `time_deleted` 最大的那个，
/// 也就是刚扔进去的这份。取错了就是把用户的旧版本盖回现场，比不还原更糟。
#[tauri::command]
fn restore_from_trash(original_path: String) -> Result<(), String> {
    #[cfg(any(windows, target_os = "linux"))]
    {
        use std::path::Path;

        // Windows 路径不分大小写，两种分隔符也都可能出现，统一成小写正斜杠再比
        fn normalize(path: &Path) -> String {
            path.to_string_lossy().replace('\\', "/").to_lowercase()
        }
        let want = normalize(Path::new(&original_path));

        let items = trash::os_limited::list().map_err(|error| error.to_string())?;
        let newest = items
            .into_iter()
            .filter(|item| normalize(&item.original_parent.join(&item.name)) == want)
            .max_by_key(|item| item.time_deleted);

        match newest {
            // 找不到就明确报错，不要静默成功——前端会照「还原不了」提示，
            // 而「说还原了其实没还原」会让用户以为文件回来了，之后才发现没有
            None => Err(format!("not found in trash: {original_path}")),
            // 原位置已经有同名文件时这里回 RestoreCollision，同样如实往上报
            Some(item) => trash::os_limited::restore_all([item]).map_err(|error| error.to_string()),
        }
    }
    #[cfg(not(any(windows, target_os = "linux")))]
    {
        let _ = original_path;
        Err("restoring from trash is not available on this platform".to_string())
    }
}

/// 让已经在跑的那个窗口自己跳到最前。光调 `set_focus()` 不够，实测（0.1.0 起就有）
/// 双击第二篇 .md 时正文切过去了、窗口却留在后面，非得手点任务栏。
///
/// 翻了 tao 0.35.3 的 `platform_impl/windows/window.rs` 才看清两层原因：
///
/// 1. `set_focus()` 开头有个门槛——`is_visible && !is_minimized && !is_foreground`
///    才往下走。所以窗口一旦最小化，这句话是**彻底的空操作**，连试都没试。
///    因此顺序不能换：先 `unminimize()` 还原、再 `show()` 确保可见，最后才谈焦点。
///
/// 2. 过了门槛它调 `SetForegroundWindow`。Windows 会拦住非前台进程的这个调用
///    （前台锁），tao 的兜底是模拟按一下 Alt 键去「偷」前台权限——这个 hack 不保证生效。
///    而这里正好命中最坏情况：双击 .md 时前台是资源管理器，前台权限在**新起的那个进程**
///    手上（`tauri-plugin-single-instance` 2.4.3 拿到消息就 `exit(0)`，不会把权限转交过来）。
///
/// 所以补一手不需要前台权限的：改 Z 序。置顶再取消，窗口就浮到最上面——
/// 键盘焦点未必跟着来，但用户至少看得见它，这正是这条 bug 抱怨的东西。
fn bring_to_front<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();

    #[cfg(windows)]
    {
        let _ = window.set_always_on_top(true);
        let _ = window.set_always_on_top(false);
    }
}

/// 把「谁有资格把窗口提到最前」这份权限让出去。
///
/// 双击 .md 时，前台是资源管理器，它启动的**新进程**才有资格调 `SetForegroundWindow`；
/// 已经在跑的那个 Sheaf 没有。而 `tauri-plugin-single-instance` 2.4.3 把参数用
/// `WM_COPYDATA` 转发过去之后就直接 `exit(0)`——源码里确认没有把这份权限交出去。
/// 结果就是那边 `set_focus()` 拿不到键盘焦点：窗口浮上来了，却得先点一下才能打字。
///
/// 这里在进程最开头把权限让给所有人（`ASFW_ANY`）。对第一个实例是空操作；
/// 对随后被插件拦下来的第二个实例，这一让正好补上缺的那一环——
/// 它此刻手里有权限，让完再去发 `WM_COPYDATA`，老实例那边就能真正抢到前台。
///
/// 位置不能挪：必须在 `tauri::Builder` 之前，因为插件的 setup（也就是发消息然后退出的那段）
/// 是在 `.run()` 里才跑的。
#[cfg(windows)]
fn allow_foreground_handoff() {
    // ASFW_ANY = 0xFFFFFFFF：不指定某个进程，允许任何进程提自己的窗口
    const ASFW_ANY: u32 = u32::MAX;
    // 失败没有补救办法，也不该因此拦住启动——顶多退回「窗口浮上来但要手点一下」
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::AllowSetForegroundWindow(ASFW_ANY);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(windows)]
    allow_foreground_handoff();

    let initial_path = extract_md_path(&std::env::args().collect::<Vec<_>>());

    tauri::Builder::default()
        // 必须是第一个注册的 plugin——这是 tauri-plugin-single-instance 自己的要求。
        // 双击第二个 .md 时，操作系统其实是想「再开一个 Sheaf」；这个插件拦住那次新启动，
        // 把它的参数转发给已经在跑的这个实例，而不是真的开第二个窗口。
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(path) = extract_md_path(&argv) {
                let _ = app.emit("open-file", path);
            }
            if let Some(window) = app.get_webview_window("main") {
                bring_to_front(&window);
            }
        }))
        .manage(PendingFile(Mutex::new(initial_path)))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            take_pending_file,
            move_to_trash,
            restore_from_trash
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // 自动更新。装在 setup 里而不是跟其它插件排在一起，是因为它只对桌面成立，
            // `#[cfg(desktop)]` 在链式调用中间会把整条 builder 的类型切开。
            // 前端什么时候去查、查到了怎么问用户，全在 src/update.ts；这里只负责把能力挂上。
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
