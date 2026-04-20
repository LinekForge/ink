import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspace, joinFrontmatter } from '../store/workspace'

const DEBOUNCE_MS = 2000

/** Backup key —— 有 path 用 path，Untitled tab 用 `untitled:{id}` */
export function backupKey(tab: { path: string | null; id: string }): string {
  return tab.path ?? `untitled:${tab.id}`
}

/**
 * 未保存改动的隔离备份——断电 / crash 时的 escape hatch。
 *
 * - 每 tab 独立 debounce（2s 停顿后写一次）
 * - dirty=true 才写 · Untitled 有 content 也算（用 untitled:{id} 做 key）
 * - 写到 Rust 管的 app_data_dir/backups/，不碰原文件
 * - ⌘S 成功 / 关 tab discard 时由 caller delete_backup
 * - 启动恢复由 App.tsx 的 listBackups 扫描 + 恢复对话框负责
 *
 * 暴露 flushAll：关 app / 紧急 flush 时立即写（不等 debounce）
 */
export function useBackup() {
  const panes = useWorkspace((s) => s.panes)
  const timersRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const tabs = panes.flatMap((p) => p.tabs)
    const eligibleIds = new Set<string>()

    tabs.forEach((t) => {
      // Untitled 也参与 · 只要 dirty 就 backup
      if (!t.dirty) return
      // Untitled 且完全空白（没敲字）也不值得 backup
      if (!t.path && !t.content.trim() && !t.frontmatter) return
      eligibleIds.add(t.id)
      const existing = timersRef.current.get(t.id)
      if (existing) window.clearTimeout(existing)
      const key = backupKey(t)
      const content = joinFrontmatter(t.frontmatter, t.content)
      const timer = window.setTimeout(() => {
        invoke('write_backup', { path: key, content }).catch((e) =>
          console.warn('write_backup failed:', key, e),
        )
        timersRef.current.delete(t.id)
      }, DEBOUNCE_MS)
      timersRef.current.set(t.id, timer)
    })

    // 清 已关闭或已 clean 的 tab 的 pending timer
    for (const [tabId, timer] of timersRef.current.entries()) {
      if (!eligibleIds.has(tabId)) {
        window.clearTimeout(timer)
        timersRef.current.delete(tabId)
      }
    }
  }, [panes])

  // unmount 时全清
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      timers.clear()
    }
  }, [])
}

/** 立即 flush 所有 dirty tab 的 backup（不等 debounce）· 关 app 时用 */
export async function flushAllBackups(): Promise<void> {
  const panes = (await import('../store/workspace')).useWorkspace.getState().panes
  const tabs = panes.flatMap((p) => p.tabs)
  const jobs: Promise<unknown>[] = []
  for (const t of tabs) {
    if (!t.dirty) continue
    if (!t.path && !t.content.trim() && !t.frontmatter) continue
    const key = backupKey(t)
    const content = joinFrontmatter(t.frontmatter, t.content)
    jobs.push(
      invoke('write_backup', { path: key, content }).catch((e) =>
        console.warn('flush write_backup failed:', key, e),
      ),
    )
  }
  await Promise.all(jobs)
}
