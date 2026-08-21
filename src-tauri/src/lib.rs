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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
                let _ = window.set_focus();
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
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
