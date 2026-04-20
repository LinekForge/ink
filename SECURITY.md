# Security Policy

## 报告漏洞

发现安全问题请**不要**直接 PR 或 public issue。

**唯一报告渠道**：GitHub Security Advisory—— 到 [https://github.com/LinekForge/ink/security/advisories/new](https://github.com/LinekForge/ink/security/advisories/new) 提交 private advisory。

我们尽量在 7 天内回复，30 天内提供 fix 或缓解方案。

如果 GitHub 不可用（极端场景），请在 repo 的 issue 里开一个**不含具体漏洞细节**的 placeholder（例如："security concern, please contact me"）并留联系方式，maintainer 会主动联络。**不要**把漏洞细节发在 public issue 里。

## 安全模型

Ink 是**本机桌面 app**。没有网络服务、不起 rpc、不调用外部 API（除了用户点击的 http 链接由系统浏览器打开）。

### 默认信任边界

- **用户主动打开的 md 文件是信任的**：通过 `File → Open` / 拖拽 / `open -a Ink foo.md` 打开。Ink 读取内容用 Milkdown 渲染，**不执行任何嵌入脚本**——Milkdown 走 ProseMirror doc model，HTML 里的 `<script>` 不会被执行。
- **粘贴 / 拖入的图片落盘路径受限**：Rust `save_image` / `save_image_from_path` 落到 `{tab_dir}/assets/` 或 `~/Pictures/Ink/`，路径经 `canonicalize()` 校验。
- **md 里的 http 链接由系统浏览器接管**：点击交给 `@tauri-apps/plugin-opener`，Ink 本身不发起任何 http 请求。

### 已知风险

- **Unsigned DMG**：Ink 是源码项目，不做 Apple Developer ID 签名 + notarize。首次打开 macOS 会报 Gatekeeper 警告，需右键「打开」绕过一次。介意者自行 clone + build。
- **macOS only（当前）**：仅构建 Apple Silicon DMG。Windows / Linux / Intel Mac 可自行交叉编译（Tauri 支持但未测试）。
- **asset 协议 scope 较宽**：`$HOME/**`、`/Volumes/**`、`/tmp/**` 都可读——为了渲染用户 md 里任意位置的本地图片。系统目录（`/etc` / `/var` / `/usr` 等）被隔离。
- **CSP img 不限域**：`tauri.conf.json` 里 `security.csp: null`，远程图片（http/https）可渲染。不**嵌入 script 执行**的前提下这是可控的，但打开**不信任来源**的 md 文件时注意——图片加载会产生 DNS 请求。

### 防护措施

- **路径 canonicalize 防穿越**：所有文件 IO 命令（`read_file` / `write_file` / `show_in_finder` / `stat_file` / `save_image` / `save_image_from_path`）在 Rust 侧走 `Path::canonicalize()` 解析 symlink + `..`。`write_file` 额外 canonicalize 父目录再拼文件名。
- **asset 协议 scope 白名单**：Tauri `assetProtocol.scope` 明确限定三个目录前缀——绝对路径 img 超出范围会 load 失败。
- **无脚本执行路径**：Milkdown schema 不含 script node，外部 md 里的 `<script>` 被当作文本渲染或忽略，不会执行。

## 升级 / Patch

订阅 [GitHub Releases](https://github.com/LinekForge/ink/releases)。安全 fix 会在 release notes 里标 `[security]`。
