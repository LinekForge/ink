// Ink — Markdown reader/editor

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::menu::{
    AboutMetadata, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{Emitter, Manager, State};

// ─── Shared state ──────────────────────────────────────────────────────

struct PendingFiles(Mutex<Vec<String>>);

fn is_markdown(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".mdx")
}

/// 读路径要求文件存在，走 canonicalize 解析 symlink / .. 避免 traversal。
fn canon_read(path: &str) -> Result<PathBuf, String> {
    if path.is_empty() {
        return Err("empty path".to_string());
    }
    Path::new(path)
        .canonicalize()
        .map_err(|e| format!("invalid path {}: {}", path, e))
}

/// 写路径可能还不存在（Save As 新文件）。canonicalize 父目录以防 traversal，
/// 再拼回文件名。父目录必须存在。
fn canon_write(path: &str) -> Result<PathBuf, String> {
    if path.is_empty() {
        return Err("empty path".to_string());
    }
    let p = Path::new(path);
    let name = p
        .file_name()
        .ok_or_else(|| format!("no filename in {}", path))?;
    let parent = p
        .parent()
        .filter(|pp| !pp.as_os_str().is_empty())
        .ok_or_else(|| format!("no parent dir in {}", path))?;
    let canon = parent
        .canonicalize()
        .map_err(|e| format!("invalid parent of {}: {}", path, e))?;
    Ok(canon.join(name))
}

// ─── Commands ──────────────────────────────────────────────────────────

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let p = canon_read(&path)?;
    fs::read_to_string(&p).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    let p = canon_write(&path)?;
    fs::write(&p, content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
fn show_in_finder(path: String) -> Result<(), String> {
    let p = canon_read(&path)?;
    std::process::Command::new("open")
        .arg("-R")
        .arg(&p)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_pending_files(state: State<PendingFiles>) -> Vec<String> {
    let mut files = state.0.lock().unwrap();
    std::mem::take(&mut *files)
}

/// 返回文件 mtime (ms since epoch)；前端 poll 判断外部改动
#[tauri::command]
fn stat_file(path: String) -> Result<u64, String> {
    use std::time::UNIX_EPOCH;
    let p = canon_read(&path)?;
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    let mt = meta.modified().map_err(|e| e.to_string())?;
    let dur = mt.duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?;
    Ok(dur.as_millis() as u64)
}

/// 保存 image bytes 到 `{tab_dir}/assets/img_{timestamp}.{ext}` 或 `tab_dir` 为空时
/// 存到 `~/Pictures/Ink/img_{timestamp}.{ext}`。返回一个可在 md 里使用的路径：
/// - 若 tab_dir 有：返回 `./assets/img_xxx.ext`（相对路径）
/// - 若 tab_dir 无：返回 absolute path（用户 Untitled tab，没有相对基准）
#[tauri::command]
fn save_image(
    tab_dir: Option<String>,
    bytes: Vec<u8>,
    ext: String,
) -> Result<String, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    let clean_ext: String = ext
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    let ext_final = if clean_ext.is_empty() {
        "png".to_string()
    } else {
        clean_ext.to_lowercase()
    };

    let filename = format!("img_{}.{}", ts, ext_final);

    let (target_dir, return_path) = match tab_dir {
        Some(dir) if !dir.is_empty() => {
            let d = Path::new(&dir).join("assets");
            let ret = format!("./assets/{}", filename);
            (d, ret)
        }
        _ => {
            let home = std::env::var("HOME").map_err(|e| e.to_string())?;
            let d = Path::new(&home).join("Pictures").join("Ink");
            let abs = d.join(&filename).to_string_lossy().to_string();
            (d, abs)
        }
    };

    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("create assets dir failed: {}", e))?;
    let target_file = target_dir.join(&filename);
    fs::write(&target_file, bytes).map_err(|e| format!("write image failed: {}", e))?;
    Ok(return_path)
}

/// 拖进来的图片文件 → 复制到 `{tab_dir}/assets/img_{timestamp}.{ext}`。
/// 若 tab_dir 是 None 则落到 `~/Pictures/Ink/`。返回可在 md 里使用的路径。
#[tauri::command]
fn save_image_from_path(
    src_path: String,
    tab_dir: Option<String>,
) -> Result<String, String> {
    let src = canon_read(&src_path)?;
    let ext = src
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let bytes = fs::read(&src).map_err(|e| format!("read source failed: {}", e))?;
    save_image(tab_dir, bytes, ext)
}

// ─── 中文菜单构建 ───────────────────────────────────────────────────────

fn build_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let about_meta = AboutMetadata {
        name: Some("Ink".to_string()),
        version: Some(env!("CARGO_PKG_VERSION").to_string()),
        copyright: Some("© 2026 Linek & Forge".to_string()),
        authors: Some(vec!["Linek & Forge".to_string()]),
        comments: Some("墨 · 极简、优雅的 Markdown 阅读器".to_string()),
        license: Some("MIT".to_string()),
        website: Some("https://github.com/LinekForge/ink".to_string()),
        website_label: Some("GitHub".to_string()),
        ..Default::default()
    };

    // 第一个菜单：Ink（app name menu）
    let app_menu = SubmenuBuilder::new(app, "Ink")
        .item(&PredefinedMenuItem::about(
            app,
            Some("关于 Ink"),
            Some(about_meta),
        )?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("app.settings", "设置...")
                .accelerator("Cmd+,")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::services(app, Some("服务"))?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some("隐藏 Ink"))?)
        .item(&PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?)
        .item(&PredefinedMenuItem::show_all(app, Some("显示全部"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("退出 Ink"))?)
        .build()?;

    // 文件
    let file_menu = SubmenuBuilder::new(app, "文件")
        .item(
            &MenuItemBuilder::with_id("file.open", "打开...")
                .accelerator("Cmd+O")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("file.new", "新建")
                .accelerator("Cmd+N")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("file.new_tab", "新建页签")
                .accelerator("Cmd+T")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("file.save", "保存")
                .accelerator("Cmd+S")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("file.save_as", "另存为...")
                .accelerator("Cmd+Shift+S")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("file.close_tab", "关闭页签")
                .accelerator("Cmd+W")
                .build(app)?,
        )
        .build()?;

    // 编辑菜单。
    // undo/redo 用 **custom** item + 前端路由到 Milkdown history command。
    // 不用 PredefinedMenuItem::undo —— 那个走 macOS 原生 `undo:` selector
    // → WebKit DOM-level undo，完全 bypass ProseMirror history plugin。
    // cut/copy/paste/select_all 仍用 predefined（WebKit 实现正确）。
    let edit_menu = SubmenuBuilder::new(app, "编辑")
        .item(
            &MenuItemBuilder::with_id("edit.undo", "撤销")
                .accelerator("Cmd+Z")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("edit.redo", "重做")
                .accelerator("Cmd+Shift+Z")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some("剪切"))?)
        .item(&PredefinedMenuItem::copy(app, Some("拷贝"))?)
        .item(&PredefinedMenuItem::paste(app, Some("粘贴"))?)
        .separator()
        .item(&PredefinedMenuItem::select_all(app, Some("全选"))?)
        .build()?;

    // 视图
    let view_menu = SubmenuBuilder::new(app, "视图")
        .item(
            &MenuItemBuilder::with_id("view.split", "分栏")
                .accelerator("Cmd+Backslash")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("view.toc", "大纲")
                .accelerator("Cmd+Shift+O")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("view.focus", "聚焦模式")
                .accelerator("Cmd+Shift+L")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, Some("进入全屏"))?)
        .build()?;

    // 窗口
    let window_menu = SubmenuBuilder::new(app, "窗口")
        .item(&PredefinedMenuItem::minimize(app, Some("最小化"))?)
        .item(&PredefinedMenuItem::maximize(app, Some("缩放"))?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("关闭窗口"))?)
        .build()?;

    // 帮助
    let help_menu = SubmenuBuilder::new(app, "帮助")
        .item(
            &MenuItemBuilder::with_id("help.shortcuts", "快捷键...")
                .accelerator("Cmd+Slash")
                .build(app)?,
        )
        .build()?;

    MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ])
        .build()
}

// ─── Entry ─────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // argv 文件（`open -a Ink foo.md` 或命令行启动时）
    let md_files: Vec<String> = std::env::args()
        .skip(1)
        .filter(|a| is_markdown(a))
        .collect();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingFiles(Mutex::new(md_files)))
        .setup(|app| {
            let menu = build_menu(&app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref().to_string();
            if let Some(window) = app.get_webview_window("main") {
                window.emit("menu", id).ok();
            }
        })
        .on_window_event(|window, event| {
            // 红叉关窗口 / Cmd+Q → 先 block，让前端 check dirty 再决定
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                window.emit("request-close-window", ()).ok();
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            show_in_finder,
            get_pending_files,
            stat_file,
            save_image,
            save_image_from_path,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // RunEvent loop —— 处理 macOS 双击 .md（走 Apple Event，不走 argv）
    app.run(|app_handle, event| {
        if let tauri::RunEvent::Opened { urls } = event {
            let paths: Vec<String> = urls
                .into_iter()
                .filter_map(|u| {
                    if u.scheme() == "file" {
                        u.to_file_path()
                            .ok()
                            .map(|p| p.to_string_lossy().to_string())
                    } else {
                        None
                    }
                })
                .filter(|p| is_markdown(p))
                .collect();

            if !paths.is_empty() {
                // 1) 总是推到 PendingFiles（cold start 时 webview 可能还没 ready）
                if let Some(state) = app_handle.try_state::<PendingFiles>() {
                    state.0.lock().unwrap().extend(paths.clone());
                }
                // 2) runtime 时把窗口从 Dock 最小化态弹出并 focus，再 emit
                if let Some(w) = app_handle.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.show();
                    let _ = w.set_focus();
                    w.emit("files-opened", &paths).ok();
                }
            }
        }
    });
}
