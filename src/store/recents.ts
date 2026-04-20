/**
 * Recent files —— 打开过的文件路径，最多 10 条，LRU。
 * Welcome 页展示前 5 条做快速再打开。
 */

const KEY = 'ink-recents'
const MAX = 10

export type RecentFile = {
  path: string
  lastOpened: number // ms timestamp
}

export function loadRecents(): RecentFile[] {
  try {
    const s = localStorage.getItem(KEY)
    return s ? (JSON.parse(s) as RecentFile[]) : []
  } catch {
    return []
  }
}

export function pushRecent(path: string): void {
  if (!path) return
  const list = loadRecents()
  const filtered = list.filter((r) => r.path !== path)
  const next = [{ path, lastOpened: Date.now() }, ...filtered].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch (e) {
    console.warn('pushRecent failed:', e)
  }
}

export function removeRecent(path: string): void {
  const list = loadRecents()
  const next = list.filter((r) => r.path !== path)
  localStorage.setItem(KEY, JSON.stringify(next))
}

/** 显示用：最近 N 条，按 lastOpened 倒序 */
export function topRecents(n = 5): RecentFile[] {
  return loadRecents().slice(0, n)
}
