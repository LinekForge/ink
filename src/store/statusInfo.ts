import { create } from 'zustand'

/**
 * 动作回执历史 & status bar 左半当前显示。
 *
 * - 每次发生"值得记录"的事件（info / warn / error）都调 `statusInfo.push()`
 * - `current` 是最近一条，status bar 左半显示（永不 fade，等新动作替换）
 * - `history` 是完整 session 级列表（最多 MAX_HISTORY 条），点击 icon 弹 popover 回溯
 * - `unseen` 计数器：有新条目且未打开过 popover → 显示 accent 色实心 dot；
 *   `markSeen()` 清零（popover 打开时调）
 *
 * 与 toast 的关系：error / warn 依然跳 toast（moment of 注意力），
 * 同时也 push 到这里（持久记录）。info 只进这里。
 */

export type StatusKind = 'info' | 'warn' | 'error'

export type StatusEntry = {
  id: string
  kind: StatusKind
  message: string
  /** 回执指向的路径，有则 UI 渲染成可点击（点击在 Finder 里定位）*/
  path?: string
  /** 相对路径用 tabDir 拼绝对路径 */
  tabDir?: string | null
  /** 被动事件（外部同步等），popover 里 left border 标记让你一眼看到 */
  passive?: boolean
  at: number
}

type State = {
  current: StatusEntry | null
  history: StatusEntry[]
  unseen: number
  push: (entry: Omit<StatusEntry, 'id' | 'at'>) => void
  markSeen: () => void
  clear: () => void
}

const MAX_HISTORY = 50
const nextId = () => Math.random().toString(36).slice(2, 10)

export const useStatusInfo = create<State>((set) => ({
  current: null,
  history: [],
  unseen: 0,
  push: (entry) => {
    const full: StatusEntry = { ...entry, id: nextId(), at: Date.now() }
    set((s) => ({
      current: full,
      history: [full, ...s.history].slice(0, MAX_HISTORY),
      unseen: s.unseen + 1,
    }))
  },
  markSeen: () => set({ unseen: 0 }),
  clear: () => set({ current: null, history: [], unseen: 0 }),
}))

/** 便捷 API —— 组件外调 */
export const statusInfo = {
  info: (
    message: string,
    opts?: {
      path?: string
      tabDir?: string | null
      passive?: boolean
    },
  ) => useStatusInfo.getState().push({ kind: 'info', message, ...opts }),
  warn: (message: string, opts?: { path?: string; tabDir?: string | null }) =>
    useStatusInfo.getState().push({ kind: 'warn', message, ...opts }),
  error: (message: string, opts?: { path?: string; tabDir?: string | null }) =>
    useStatusInfo.getState().push({ kind: 'error', message, ...opts }),
}

/** 相对路径 + tabDir → 绝对路径；已是绝对则原样 */
export function resolveEntryAbsolute(entry: StatusEntry): string | null {
  if (!entry.path) return null
  if (entry.path.startsWith('/')) return entry.path
  if (!entry.tabDir) return null
  const clean = entry.path.replace(/^\.\//, '')
  return `${entry.tabDir}/${clean}`
}

/** 相对时间格式化："刚刚" / "2 分钟前" / "1 小时前" / "09-15 14:22" */
export function formatRelativeTime(ms: number): string {
  const now = Date.now()
  const diff = Math.floor((now - ms) / 1000) // 秒
  if (diff < 10) return '刚刚'
  if (diff < 60) return `${diff} 秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
