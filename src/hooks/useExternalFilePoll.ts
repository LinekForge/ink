import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useWorkspace } from '../store/workspace'
import { toast } from '../store/toasts'
import { statusInfo } from '../store/statusInfo'

/**
 * 每 2 秒 poll active tab 文件 mtime，检测外部改动。
 *
 * 有 dirty → 黄 toast 警告"被外部修改，⌘S 会覆盖"，不自动 reload（保护
 * 用户未保存内容）。无 dirty → silent reload + status bar 回执（passive）。
 *
 * 依赖里加 savedRevision：Ink 自己 ⌘S 写文件也改 mtime，poll 会误判。
 * savedRevision 变时 effect 重启，lastMtime 以当前 mtime 为新 baseline
 * ——自己写的那次变化被吞，下次 mtime 再变才算真外部。
 */
export function useExternalFilePoll(
  path: string | null | undefined,
  tabId: string | undefined,
  savedRevision: number | undefined,
) {
  useEffect(() => {
    if (!path || !tabId) return
    let lastMtime: number | null = null
    let stopped = false

    const tick = async () => {
      if (stopped) return
      try {
        const mtime = await invoke<number>('stat_file', { path })
        if (lastMtime === null) {
          lastMtime = mtime
          return
        }
        if (mtime === lastMtime) return
        lastMtime = mtime

        const current = useWorkspace
          .getState()
          .panes.flatMap((p) => p.tabs)
          .find((t) => t.id === tabId)
        if (!current) return

        if (current.dirty) {
          toast.warn(`${current.title} 被外部修改。⌘S 保存会覆盖外部改动`)
        } else {
          try {
            const raw = await invoke<string>('read_file', { path })
            useWorkspace.getState().reloadTabFromExternal(tabId, raw)
            statusInfo.info(`${current.title} 外部改动已同步`, {
              path: current.path ?? undefined,
              passive: true,
            })
          } catch (e) {
            console.warn('reload failed:', e)
          }
        }
      } catch {
        // 文件可能被删/移动，skip 这轮
      }
    }

    const interval = setInterval(tick, 2000)
    tick()
    return () => {
      stopped = true
      clearInterval(interval)
    }
  }, [path, tabId, savedRevision])
}
