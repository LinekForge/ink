import { convertFileSrc } from '@tauri-apps/api/core'

/**
 * Markdown 里图片路径 → Tauri webview 能加载的 URL。
 *
 * - `http://` / `https://` / `data:` → 原样返回（CSP = null 会放行）
 * - `asset://` → 已处理，原样
 * - `file:///abs/path.png` → 抽绝对路径走 convertFileSrc
 * - `/abs/path.png`（绝对路径）→ convertFileSrc
 * - 相对路径（`./foo.png` / `foo.png` / `../a/b.png`）→ 结合 tab 所在目录
 *   拼成绝对路径再 convertFileSrc
 *
 * 没有 tabPath（Untitled tab）且遇到相对路径时无法 resolve，返回原样；
 * 图片显示不出来是能接受的 degradation（Untitled 没保存也没 dirname）。
 */
export function resolveImageSrc(
  src: string,
  tabPath: string | null,
): string {
  if (!src) return src
  if (/^(https?:|data:|blob:|asset:)/i.test(src)) return src

  if (src.startsWith('file://')) {
    const abs = src.slice('file://'.length)
    return convertFileSrc(abs)
  }

  if (src.startsWith('/')) {
    return convertFileSrc(src)
  }

  // 相对路径
  if (!tabPath) return src
  const dir = tabPath.slice(0, tabPath.lastIndexOf('/'))
  const abs = normalizePath(`${dir}/${src}`)
  return convertFileSrc(abs)
}

/** 简单 normalize：折叠 `./` 和 `../`。只处理 POSIX 风格（macOS）*/
function normalizePath(p: string): string {
  const parts = p.split('/')
  const stack: string[] = []
  for (const seg of parts) {
    if (seg === '' || seg === '.') {
      if (stack.length === 0) stack.push('') // 保留开头的 `/`
      continue
    }
    if (seg === '..') {
      if (stack.length > 1) stack.pop()
      continue
    }
    stack.push(seg)
  }
  return stack.join('/') || '/'
}
