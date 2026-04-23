// Ink — Markdown reader/editor

use std::collections::{HashMap, HashSet};
use std::fs;
use std::hash::Hasher;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::menu::{
    AboutMetadata, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{Emitter, Manager, State};
use twox_hash::XxHash64;

// ─── Shared state ──────────────────────────────────────────────────────

struct PendingFiles(Mutex<Vec<String>>);

/// fs.watch 状态：每 (path, tab_id) 一个 watcher；自己 write_file 的 hash 进
/// skip_hashes 避 echo（watch 事件内容 hash 命中就 consume 掉、不 emit）。
struct WatchState {
    watchers: Mutex<HashMap<String, RecommendedWatcher>>,
    skip_hashes: Arc<Mutex<HashSet<u64>>>,
}

impl WatchState {
    fn new() -> Self {
        Self {
            watchers: Mutex::new(HashMap::new()),
            skip_hashes: Arc::new(Mutex::new(HashSet::new())),
        }
    }
}

fn xxhash64(content: &str) -> u64 {
    let mut hasher = XxHash64::with_seed(0);
    hasher.write(content.as_bytes());
    hasher.finish()
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileChangedPayload {
    tab_id: String,
    content: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileRemovedPayload {
    tab_id: String,
    /// 若可以识别出文件被 rename 到的新位置（notify event.paths 里有 to path）
    /// 就带上，前端 status bar 能显示"移动到了 XXX"。rm / 跨卷 mv 时 None
    new_path: Option<String>,
}

/// 未保存改动的隔离备份——断电 / crash 时的 escape hatch。
/// 写到 ~/Library/Application Support/live.linek.ink/backups/{hash(path)}.json
/// 原文件不动，只 editor 里 dirty 的内容被 debounce 2s 写这里。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Backup {
    path: String,
    content: String,
    saved_at: u64,
}

fn backup_dir<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = base.join("backups");
    fs::create_dir_all(&dir).map_err(|e| format!("backup dir create: {}", e))?;
    Ok(dir)
}

fn backup_filename(path: &str) -> String {
    // xxHash64 path 作为稳定 id · 不同机器 / 不同运行都一致
    let mut hasher = XxHash64::with_seed(0);
    hasher.write(path.as_bytes());
    format!("{:016x}.json", hasher.finish())
}

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
fn write_file(
    path: String,
    content: String,
    watch_state: State<WatchState>,
) -> Result<(), String> {
    let p = canon_write(&path)?;
    fs::write(&p, &content).map_err(|e| format!("Failed to write {}: {}", path, e))?;
    // 写完把内容 hash 入 skip set——watch 事件回来时命中就丢弃，避免回弹 reload
    let hash = xxhash64(&content);
    watch_state.skip_hashes.lock().unwrap().insert(hash);
    Ok(())
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

/// 开始监听文件变化——(path, tab_id) 复合 key，支持同一文件多 tab（splitRight）。
/// watch 事件：
///   - Modify/Create（hash 不在 skip set）→ emit "file-externally-changed"
///   - Remove → emit "file-removed"
///   - Ink 自己 write_file 的内容 hash 命中 skip set → 静默丢弃（避 echo）
#[tauri::command]
fn watch_file(
    path: String,
    tab_id: String,
    app: tauri::AppHandle,
    watch_state: State<WatchState>,
) -> Result<(), String> {
    let canon = canon_read(&path)?;
    let key = format!("{}::{}", path, tab_id);

    let canon_for_callback = canon.clone();
    let skip = Arc::clone(&watch_state.skip_hashes);
    let app_clone = app.clone();
    let tab_id_clone = tab_id.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        // 所有事件（Remove/Modify/Create/Rename）统一走"先检查路径是否还在"的
        // 流程——macOS 上 `mv file` 是 Modify(Name(RenameMode::From))，不是 Remove；
        // 跨卷 mv 是 Create+Remove；直接 rm 是 Remove。路径不存在即视作 missing。
        match event.kind {
            EventKind::Remove(_) | EventKind::Modify(_) | EventKind::Create(_) => {
                // 先 stat：文件已不存在（rename away / rm / mv 走）→ emit file-removed
                if !canon_for_callback.exists() {
                    // Rename 事件 event.paths 会含 [from, to]——取 to 给前端显示新位置
                    // rm / 跨卷 mv 只有 [from]，取不到 to 就传 None
                    let new_path = event
                        .paths
                        .get(1)
                        .map(|p| p.to_string_lossy().to_string());
                    let _ = app_clone.emit(
                        "file-removed",
                        FileRemovedPayload {
                            tab_id: tab_id_clone.clone(),
                            new_path,
                        },
                    );
                    return;
                }
                // 文件仍在 → 读回当前内容
                let Ok(content) = fs::read_to_string(&canon_for_callback) else {
                    return;
                };
                // 命中 skip set 就丢弃（自己写的）
                let hash = xxhash64(&content);
                {
                    let mut skip_set = skip.lock().unwrap();
                    if skip_set.remove(&hash) {
                        return;
                    }
                }
                let _ = app_clone.emit(
                    "file-externally-changed",
                    FileChangedPayload {
                        tab_id: tab_id_clone.clone(),
                        content,
                    },
                );
            }
            _ => {}
        }
    })
    .map_err(|e| format!("create watcher failed: {}", e))?;

    watcher
        .watch(&canon, RecursiveMode::NonRecursive)
        .map_err(|e| format!("watch {} failed: {}", path, e))?;

    watch_state.watchers.lock().unwrap().insert(key, watcher);
    Ok(())
}

/// 停止监听——Tab 关闭或切到另一个文件时调用。Watcher drop 自动关闭 FSEvents 订阅。
#[tauri::command]
fn unwatch_file(
    path: String,
    tab_id: String,
    watch_state: State<WatchState>,
) -> Result<(), String> {
    let key = format!("{}::{}", path, tab_id);
    watch_state.watchers.lock().unwrap().remove(&key);
    Ok(())
}

/// 写 editor 当前 dirty 内容到隔离 backup 区（原子写 tmp+rename）·
/// ⌘S 才写原文件，backup 是 crash / 断电时的 escape hatch。
#[tauri::command]
fn write_backup<R: tauri::Runtime>(
    path: String,
    content: String,
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    let dir = backup_dir(&app)?;
    let fname = backup_filename(&path);
    let tmp = dir.join(format!("{}.tmp", fname));
    let final_path = dir.join(&fname);

    let saved_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup = Backup { path, content, saved_at };
    let json = serde_json::to_string(&backup).map_err(|e| format!("serialize: {}", e))?;

    fs::write(&tmp, json).map_err(|e| format!("backup tmp write: {}", e))?;
    fs::rename(&tmp, &final_path).map_err(|e| format!("backup rename: {}", e))?;
    Ok(())
}

/// 列所有 backup——启动时扫，非空则弹恢复对话框。
#[tauri::command]
fn list_backups<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Vec<Backup> {
    let Ok(dir) = backup_dir(&app) else { return vec![] };
    let Ok(entries) = fs::read_dir(&dir) else { return vec![] };
    entries
        .filter_map(|e| {
            let e = e.ok()?;
            let p = e.path();
            if p.extension().and_then(|s| s.to_str()) != Some("json") {
                return None;
            }
            let data = fs::read_to_string(&p).ok()?;
            serde_json::from_str::<Backup>(&data).ok()
        })
        .collect()
}

/// 删除指定 path 对应的 backup——⌘S 成功 / "不保存"关 tab / 用户主动丢弃时调
#[tauri::command]
fn delete_backup<R: tauri::Runtime>(
    path: String,
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    let dir = backup_dir(&app)?;
    let p = dir.join(backup_filename(&path));
    if p.exists() {
        fs::remove_file(&p).map_err(|e| format!("backup delete: {}", e))?;
    }
    Ok(())
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
        .item(
            &MenuItemBuilder::with_id("file.export_pdf", "导出 PDF")
                .accelerator("Cmd+P")
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
        .manage(WatchState::new())
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
            save_image,
            save_image_from_path,
            watch_file,
            unwatch_file,
            write_backup,
            list_backups,
            delete_backup,
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
