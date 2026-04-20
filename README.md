# Ink · 墨

[![Latest Release](https://img.shields.io/github/v/release/LinekForge/ink?label=download&color=24C8DB)](https://github.com/LinekForge/ink/releases/latest)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Apple%20Silicon%20%2B%20Intel-lightgrey.svg)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB.svg)

**让 Markdown 看起来就像它该有的样子**——打开 md，眼睛不累；想改一个字，光标点过去改就行。

- **WYSIWYG** — Milkdown 渲染后就是最终样子，点哪改哪，不分左源右预览
- **GFM 全套** — Callout 5 类 · Task list 可点击 · 代码块 Prism 高亮 · 图片粘贴即存
- **阅读沉浸** — 聚焦模式（`⌘⇧L`）当前小节清晰、其他 dim · Zen 模式（`⌘⇧↵`）剥离全部 UI · 图片单击 Lightbox 全屏
- **长文导航** — 文档大纲（`⌘⇧O`）滚动时自动高亮当前节 · 文档内搜索（`⌘F`）带 N / M 计数
- **极轻原生** — < 10 MB app bundle（对比 Electron 的 150 MB+），Rust + Web 混合

基于 [Tauri 2](https://tauri.app)（Rust 后端 + Web 前端）+ [Milkdown 7](https://milkdown.dev)（ProseMirror-based WYSIWYG）+ React 19。

## 前置要求

- macOS（aarch64 / x86_64 均有预构建）
- **下 DMG**：无额外依赖，直接用
- **源码 build**：[Node 20+](https://nodejs.org) + [pnpm](https://pnpm.io) + [Rust stable](https://rustup.rs) + Xcode Command Line Tools

## 快速开始

**下载预构建 DMG（推荐，< 1 分钟）** · GitHub Actions 自动 build aarch64 + x86_64 DMG：

→ [**Latest Release**](https://github.com/LinekForge/ink/releases/latest)（选对应架构的 DMG）

Ink **不做** Apple Developer ID 签名（$99/年对这种小工具性价比低），所有 DMG 都 unsigned。

**或从源码 build**（想 customize / 审代码）：

```bash
git clone https://github.com/LinekForge/ink.git
cd ink
pnpm install
pnpm tauri build
open src-tauri/target/release/bundle/dmg/Ink_0.3.0_aarch64.dmg
# 拖 Ink.app 到 Applications
```

> [!NOTE]
> 首次打开 macOS 会报 Gatekeeper 警告（unsigned app）。右键 app 选「打开」一次即可永久放行。

> [!TIP]
> 想用但不想自己装？把这个 GitHub 链接发给 Claude Code / Cursor / 任何能读 README + 跑 shell 的 agent——它会照上面的步骤装起来。

> [!TIP]
> **国内用户**：编译时 crates.io 下载超时，可以配置国内镜像：
>
> ```bash
> # ~/.cargo/config.toml
> [source.crates-io]
> replace-with = "rsproxy"
>
> [source.rsproxy]
> registry = "https://rsproxy.cn/crates.io-index"
>
> [registries.rsproxy]
> index = "https://rsproxy.cn/crates.io-index"
> ```

## 打开 md 的姿势

- Finder 双击 `.md` / `.markdown` / `.mdx`
- 拖文件到 Dock 图标或窗口内
- 命令行 `open -a Ink foo.md`
- `⌘O` 弹窗选

## 快捷键

| 操作 | 键 | 操作 | 键 |
|---|---|---|---|
| 打开 / 新建 / 新页签 | `⌘O` / `⌘N` / `⌘T` | 分栏 | `⌘\` |
| 保存 / 另存为 | `⌘S` / `⌘⇧S` | 大纲 | `⌘⇧O` |
| 关闭页签 | `⌘W` | 搜索 | `⌘F` |
| 撤销 / 重做 | `⌘Z` / `⌘⇧Z` | 聚焦模式 | `⌘⇧L` |
| 切第 N 页签 | `⌘1..⌘9` | Zen 模式 | `⌘⇧↵` |
| 下 / 上一页签 | `⌘⇧]` / `⌘⇧[` | 设置 / 快捷键面板 | `⌘,` / `⌘/` |

## 已知限制

| 限制 | 原因 |
|------|------|
| 仅 macOS（aarch64 + x86_64） | Tauri 支持 Windows / Linux，未测试 |
| Unsigned DMG | 源码项目定位，不走 Apple Developer ID 签名 + notarize |
| 无 Mermaid / KaTeX 渲染 | Roadmap |
| 无 PDF / HTML 导出 | 暂用系统「打印 → 另存为 PDF」过渡 |
| 外部 reload 会跳顶 | cursor + 滚动位置保留待实现 |

## 不做的

- 文件管理器 / workspace 概念——Ink 不是 IDE
- 云同步 / 插件系统 / 全局跨文件搜索
- 上下分栏 / 三栏以上 / 嵌套分栏——永远不做

> [!IMPORTANT]
> 「**只做一件事做好**」是 Ink 的核心原则。md 阅读 + 顺手编辑 = 全部范围。想做更多的请用 Obsidian / VS Code。

<details>
<summary><strong>架构</strong></summary>

```
src/                           # React frontend（TypeScript + Vite）
├── App.tsx                    # 布局主组件 · 菜单/键位/pane 编排
├── components/                # Editor / PaneView / TabBar / TOC / Welcome / Settings / SearchBar / StatusBar / Lightbox / ...
├── editor/                    # Milkdown / ProseMirror 插件：搜索 · callout · focus · task · placeholder · hardbreak cleaner · keymap overrides
├── lib/                       # imagePath（asset:// rewrite）· wordCount
├── store/                     # Zustand: workspace / settings / session / recents / toasts / statusInfo / searchStore
└── hooks/                     # useFile / useKeybinding / useTheme / useDragDrop / useExternalFilePoll

src-tauri/                     # Rust backend
├── src/lib.rs                 # 文件 IO commands + 图片落盘 + 中文菜单 + 窗口事件（canonicalize 防路径穿越）
├── tauri.conf.json            # 窗口配置 + file associations (.md/.markdown/.mdx) + assetProtocol scope
└── capabilities/default.json  # 权限
```

**关键架构决策**：

- **Dirty tracking** 用 ProseMirror `doc.eq()` 比 doc tree 等价性，不用字符串 diff——序列化后的 md 字符可能与原始字符不等（换行 / 空白 / 格式化差异），但 doc tree 是等价的
- **菜单 undo/redo** 用 custom `MenuItemBuilder` + 前端路由到 Milkdown 的 `undoCommand`，不用 `PredefinedMenuItem::undo`（后者走 macOS 原生 `undo:` selector → WebKit DOM undo，完全 bypass ProseMirror history）
- **图片路径** 走 `convertFileSrc` → `asset://`。Tauri webview 不加载 `file://`，MutationObserver 扫 `<img>` rewrite src
- **Phantom BR cleaner**：WKWebView 在 contentEditable 内自动插 `<br>`，Milkdown hardbreak schema 把它当 hardbreak 解析；`appendTransaction` 插件每次 tx 后清 trailing hardbreak，避免保存文件末尾出现一串 `\\`

</details>

<details>
<summary><strong>开发</strong></summary>

```bash
# 开发模式（HMR，改前端秒级生效）
pnpm tauri dev

# 打包 DMG（Apple Silicon）
pnpm tauri build
# 输出：src-tauri/target/release/bundle/dmg/Ink_0.3.0_aarch64.dmg

# 类型检查
pnpm exec tsc --noEmit
(cd src-tauri && cargo check --release)
```

欢迎贡献，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题走 [SECURITY.md](SECURITY.md) 的 Security Advisory 渠道。

</details>

## 贡献者

- [@lightallspiritthing](https://github.com/lightallspiritthing) — 国内镜像指引（[#2](https://github.com/LinekForge/ink/pull/2)）· GitHub Actions CI 建议（[#1](https://github.com/LinekForge/ink/issues/1)）

## 致谢

- [Milkdown](https://milkdown.dev) — 所见即所得 Markdown 引擎
- [Tauri](https://tauri.app) — Rust + Web 混合外壳，让 app 小到 < 10 MB
- [ColaMD](https://github.com/marswaveai/ColaMD) — UI 审美参考
- Songti（宋体）— app icon 字体

## License

[MIT](LICENSE) — Linek & Forge
