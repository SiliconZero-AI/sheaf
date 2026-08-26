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
        .invoke_handler(tauri::generate_handler![take_pending_file])
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
