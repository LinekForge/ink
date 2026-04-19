import { create } from 'zustand'
import { statusInfo } from './statusInfo'

/**
 * Toast 系统 —— 右下角飘过的轻提示，给"必须看到"的事件：
 * - error（一切）
 * - warn（冲突、操作无效）
 *
 * info 级别**不走这里**——直接调 `statusInfo.info(...)` 进 status bar。
 *
 * 每条 toast 都同步 push 到 statusInfo 历史，便于之后回溯——错过的
 * 敏感事件需要能在 status bar 翻回去。
 */

export type ToastLevel = 'info' | 'warn' | 'error'

export type Toast = {
  id: string
  level: ToastLevel
  message: string
  createdAt: number
}

type State = {
  toasts: Toast[]
  push: (level: ToastLevel, message: string) => void
  dismiss: (id: string) => void
}

const nextId = () => Math.random().toString(36).slice(2, 10)
const AUTO_DISMISS_MS = 7000

export const useToasts = create<State>((set, get) => ({
  toasts: [],
  push: (level, message) => {
    const id = nextId()
    set((s) => ({
      toasts: [...s.toasts, { id, level, message, createdAt: Date.now() }],
    }))
    setTimeout(() => {
      if (get().toasts.some((t) => t.id === id)) {
        get().dismiss(id)
      }
    }, AUTO_DISMISS_MS)
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** 快捷函数 —— toast 和 statusInfo 历史双写 */
export const toast = {
  warn: (msg: string) => {
    useToasts.getState().push('warn', msg)
    statusInfo.warn(msg)
  },
  error: (msg: string) => {
    useToasts.getState().push('error', msg)
    statusInfo.error(msg)
  },
}
