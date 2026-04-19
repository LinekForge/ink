import { useEffect } from 'react'

/**
 * Global keyboard shortcuts —— 整个 App 级别监听。
 */

type Handler = (e: KeyboardEvent) => void

type KeyMap = Record<string, Handler>

/** 简单快捷键解析：`Cmd+O`, `Cmd+Shift+P`, `Escape` 等 */
function matches(e: KeyboardEvent, spec: string): boolean {
  const parts = spec.split('+').map((p) => p.trim().toLowerCase())
  const key = parts[parts.length - 1]
  const needCmd = parts.includes('cmd') || parts.includes('meta')
  const needShift = parts.includes('shift')
  const needOpt = parts.includes('alt') || parts.includes('option')
  const needCtrl = parts.includes('ctrl')

  if (needCmd !== e.metaKey) return false
  if (needShift !== e.shiftKey) return false
  if (needOpt !== e.altKey) return false
  if (needCtrl !== e.ctrlKey) return false

  // 特殊键 map（用 e.code 规避 shift/layout 的 key 变化）
  const k = e.key.toLowerCase()
  if (key === 'escape') return k === 'escape'
  if (key === 'enter') return k === 'enter'
  if (key === 'backslash') return e.code === 'Backslash'
  if (key === 'comma') return e.code === 'Comma'
  if (key === 'bracketright' || key === ']') return e.code === 'BracketRight'
  if (key === 'bracketleft' || key === '[') return e.code === 'BracketLeft'
  if (key === 'slash' || key === '/') return e.code === 'Slash'
  return k === key
}

export function useKeybinding(keymap: KeyMap) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const [spec, cb] of Object.entries(keymap)) {
        if (matches(e, spec)) {
          e.preventDefault()
          e.stopPropagation()
          cb(e)
          return
        }
      }
    }
    // capture phase 优先：ProseMirror view 在 editor DOM 上挂 keydown
    // handler，bubble phase 会先让它消化（比如 Cmd+\ 里的 \ 被当字符插入）。
    // 用 capture 在 window 层最早拦住，preventDefault 真正阻止 ProseMirror。
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [keymap])
}
