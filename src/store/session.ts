/**
 * Session 持久化 —— 关 app 前的 tabs + 分栏布局，下次开自动 restore。
 * 只存 paths，不存 content。rehydrate 时 read_file 重新加载。
 */

const KEY = 'ink-session'

export type PersistedPane = {
  paths: string[]
  activePath: string | null
}

export type SessionState = {
  panes: PersistedPane[]
  activePaneIndex: number
}

export function saveSession(state: SessionState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('saveSession failed:', e)
  }
}

export function loadSession(): SessionState | null {
  try {
    const s = localStorage.getItem(KEY)
    return s ? (JSON.parse(s) as SessionState) : null
  } catch {
    return null
  }
}
