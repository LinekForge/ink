# Contributing to Ink

谢谢想 contribute！下面是基本约定。

## 本地开发

前置：Node 20+、pnpm、Rust stable、Xcode Command Line Tools（macOS 打包需要）。

```bash
git clone https://github.com/LinekForge/ink.git
cd ink
pnpm install
pnpm tauri dev                    # 开发模式（前端 HMR 秒级生效）
pnpm tauri build                  # 打包 DMG · 成功 build = smoke pass
pnpm exec tsc --noEmit            # 前端类型检查
(cd src-tauri && cargo check --release)  # 后端类型检查
```

Ink 没有 `doctor` 命令——**`pnpm tauri build` 通 = 通过自检**。提 PR 前跑一次确认没破坏构建。

## 报 Bug / 提需求

GitHub Issues。请带：

- 复现步骤（打开什么 md 文件 / 点了什么）
- 预期 vs 实际
- macOS 版本 + Apple Silicon / Intel
- 可选：Web Inspector 控制台日志（菜单「开发 → 查看 Web Inspector」）

## Code 改动

- **遵循现有结构**：前端 React/TS 在 `src/` 下按 `components` / `editor`（Milkdown / ProseMirror 插件）/ `store`（Zustand）/ `hooks` / `lib` 分层；后端 Rust 在 `src-tauri/src/lib.rs`；样式全在 `src/index.css`（自定义 class 以 `ink-` 或 `milkdown-host` 前缀）
- **新 ProseMirror 插件**：新文件放 `src/editor/`，`Editor.tsx` 里 `.use(inkXxxPlugin)` 接入
- **不引入 `console.log` 残留**：debug 完删
- **不引入硬编码路径**：Rust 侧所有文件 IO 走 `canonicalize()` 防路径穿越；JS 侧用 `tabPath` + relative resolve
- **不随意加 npm 依赖**：保持 < 10 MB bundle 目标，新依赖需理由
- **不引入私人 ID / 凭证**（test code 也不行）—— PR 自检：
  ```bash
  grep -rE '@(gmail|qq|163|outlook|foxmail|yahoo|hotmail)\.com|sk-[A-Za-z0-9_\-]{16,}|Bearer [A-Za-z0-9_\-]{20,}' src src-tauri README.md
  ```

## PR 流程

1. Fork → branch（命名：`fix/xxx` / `feat/xxx` / `docs/xxx` / `refactor/xxx`）
2. 改 + `pnpm tauri build` 通过
3. PR 描述带：动机、改动概要、影响范围、build 结果

## 安全问题

不要发 public issue。通过 GitHub Security Advisory 提交 private report，详见 [SECURITY.md](SECURITY.md)。

## License

MIT。提交 PR 即同意你的代码以 MIT 开源。
