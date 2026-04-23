import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  useWorkspace,
  splitFrontmatter,
  joinFrontmatter,
} from '../store/workspace'
import { mergeTexts } from '../lib/diff3'
import {
  detectExternalActivityPhase,
  EXTERNAL_ACTIVITY_ACTIVE_MS,
  EXTERNAL_ACTIVITY_COOLDOWN_MS,
  type ExternalActivityPhase,
} from '../lib/externalActivity'
import { toast } from '../store/toasts'
import { externalActivity, useExternalActivity } from '../store/externalActivity'
import { statusInfo } from '../store/statusInfo'
import type { EditorHandle } from '../components/Editor'

const basename = (p: string) => p.split('/').pop() || p

/** 生成 sidecar 路径：{dir}/{name}.conflict-{YYYYMMDDHHMMSS}.{ext}
 *  冲突时把外部版本（theirs）写到这里备份——Obsidian 1.9.7 的做法 */
function makeSidecarPath(origPath: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const ts =
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  const lastSlash = origPath.lastIndexOf('/')
  const dir = lastSlash >= 0 ? origPath.slice(0, lastSlash) : '.'
  const fname = lastSlash >= 0 ? origPath.slice(lastSlash + 1) : origPath
  const lastDot = fname.lastIndexOf('.')
  const stem = lastDot > 0 ? fname.slice(0, lastDot) : fname
  const ext = lastDot > 0 ? fname.slice(lastDot) : ''
  return `${dir}/${stem}.conflict-${ts}${ext}`
}

type FileChangedPayload = { tabId: string; content: string }
type FileRemovedPayload = { tabId: string; newPath: string | null }

type Params = {
  /** paneIndex → EditorHandle 查询函数（App 层 editorHandles.current.get） */
  getHandleForPane: (paneIndex: number) => EditorHandle | null
}

/**
 * fs.watch 事件 → 三路合并 → 应用到 tab。
 *
 * - 有 path 的打开 tab 自动 watch_file；关闭 tab 自动 unwatch
 * - 同文件多 tab（splitRight）按 (path, tab_id) 独立 watch
 * - Active tab（pane 当前显示）：调 handle 注入 merged（保留光标）
 * - Non-active tab（pane 没显示）：更新 store + bumpReloadRevision，
 *   切回来时 Editor 用新 content 重 mount
 * - 同一 tab 并发 merge 串行化（base 不会落后，避免假冲突）
 */
export function useExternalFileWatch({ getHandleForPane }: Params) {
  const panes = useWorkspace((s) => s.panes)

  const watchedRef = useRef<Set<string>>(new Set())
  const mergingRef = useRef<Map<string, Promise<void>>>(new Map())
  // fs event debounce: 200ms coalesce · Git checkout / sed -i 一次改动常
  // 触发多个 FSEvents，debounce 合成一次处理，避免重复 merge 扰动光标
  const debounceRef = useRef<
    Map<string, { timer: number; latestContent: string }>
  >(new Map())
  const lastExternalAtRef = useRef<Map<string, number>>(new Map())
  const activityTimersRef = useRef<
    Map<string, { cooldown: number | null; idle: number | null }>
  >(new Map())
  const DEBOUNCE_MS = 200

  // ─── event listen（挂一次） ────────────────────────────
  useEffect(() => {
    const unlisteners: Array<() => void> = []
    let cancelled = false

    const clearActivityTimers = (tabId: string) => {
      const timers = activityTimersRef.current.get(tabId)
      if (!timers) return
      if (timers.cooldown) window.clearTimeout(timers.cooldown)
      if (timers.idle) window.clearTimeout(timers.idle)
      activityTimersRef.current.delete(tabId)
    }

    const scheduleActivity = (tabId: string) => {
      clearActivityTimers(tabId)
      const next = {
        cooldown: window.setTimeout(() => {
          externalActivity.setPhase(tabId, 'cooldown')
          const current = activityTimersRef.current.get(tabId)
          if (!current) return
          current.cooldown = null
          current.idle = window.setTimeout(() => {
            externalActivity.clear(tabId)
            const settled = activityTimersRef.current.get(tabId)
            if (settled?.idle) window.clearTimeout(settled.idle)
            activityTimersRef.current.delete(tabId)
          }, EXTERNAL_ACTIVITY_COOLDOWN_MS)
        }, EXTERNAL_ACTIVITY_ACTIVE_MS),
        idle: null,
      }
      activityTimersRef.current.set(tabId, next)
    }

    const handleExternalActivity = (tabId: string) => {
      const now = Date.now()
      const previousAt = lastExternalAtRef.current.get(tabId) ?? null
      lastExternalAtRef.current.set(tabId, now)
      const currentPhase =
        useExternalActivity.getState().byTabId[tabId]?.phase ?? 'idle'
      const nextPhase = detectExternalActivityPhase({
        previousAt,
        now,
        currentPhase: currentPhase as ExternalActivityPhase,
      })
      if (nextPhase !== 'active') return
      externalActivity.setPhase(tabId, 'active')
      scheduleActivity(tabId)
    }

    /** 把给定的 merged raw content apply 到 editor + store + 提示。
     *  isShownInPane=true 时走 handle 精细 diff 注入（保光标）；否则 bump
     *  reloadRevision 等切回来重 mount。baseContent 总是同步成 theirs。*/
    const applyAndSync = (args: {
      tabId: string
      paneIdx: number
      mergedRaw: string
      theirs: string
      isShownInPane: boolean
      infoMsg: string
      infoPath: string | undefined
    }) => {
      const { tabId, paneIdx, mergedRaw, theirs, isShownInPane, infoMsg, infoPath } = args
      if (isShownInPane) {
        const handle = getHandleForPane(paneIdx)
        if (handle) {
          const { body } = splitFrontmatter(mergedRaw)
          handle.applyMergedMarkdown(body)
        }
      }
      useWorkspace.getState().applyExternalMerge(tabId, mergedRaw, theirs)
      if (!isShownInPane) useWorkspace.getState().bumpReloadRevision(tabId)
      statusInfo.info(infoMsg, { path: infoPath, passive: true })
    }

    const handleChange = async (tabId: string, theirs: string) => {
      const state = useWorkspace.getState()
      const paneIdx = state.panes.findIndex((p) =>
        p.tabs.some((t) => t.id === tabId),
      )
      if (paneIdx === -1) return
      const tab = state.panes[paneIdx].tabs.find((t) => t.id === tabId)!
      const base = tab.baseContent
      const ours = joinFrontmatter(tab.frontmatter, tab.content)

      // 三者一致：no-op（理论上不会触发，因 hash skip 已挡自己的写入）
      if (theirs === base && theirs === ours) return

      const isShownInPane = state.panes[paneIdx].activeTabId === tabId
      const infoPath = tab.path ?? undefined

      // Ink 无 dirty（ours === base）：直接采用 theirs
      // editor 更新后内容 == 磁盘，语义上"已同步" → bump savedRevision 让
      // Editor 重置 savedDoc，dirty 归零（否则新 doc != 旧 savedDoc 会误判 dirty）
      if (ours === base) {
        applyAndSync({
          tabId, paneIdx, mergedRaw: theirs, theirs, isShownInPane,
          infoMsg: `${tab.title} 外部改动已同步`, infoPath,
        })
        useWorkspace.getState().bumpSavedRevision(tabId)
        return
      }

      // Ink 有 dirty：三路合并
      const { conflict, merged } = mergeTexts(base, ours, theirs)

      if (conflict) {
        // 真冲突 · 不在 WYSIWYG 正文插 `<<<<<<<` markers（Obsidian 1.9.7+ 做法）。
        // editor 保留 ours，外部版本写到 sidecar 备份，base 同步成 theirs 让下
        // 次 diff3 基点不落后。
        if (tab.path) {
          const sidecar = makeSidecarPath(tab.path)
          try {
            await invoke('write_file', { path: sidecar, content: theirs })
            toast.warn(
              `${tab.title} 有冲突 · 外部版本已另存为 ${basename(sidecar)}`,
            )
          } catch (e) {
            toast.warn(
              `${tab.title} 有冲突 · sidecar 保存失败：${String(e)}`,
            )
          }
        } else {
          toast.warn(`${tab.title} 有冲突（无 path 无法 sidecar）`)
        }
        // 传 ours 当 mergedRaw：applyExternalMerge 里 splitFrontmatter(ours)
        // 拆出的 content/frontmatter 与当前一致，set 是幂等——实质只更新 base
        useWorkspace.getState().applyExternalMerge(tabId, ours, theirs)
        return
      }

      // 干净合并：两边改动都保留
      applyAndSync({
        tabId, paneIdx, mergedRaw: merged, theirs, isShownInPane,
        infoMsg: `${tab.title} 外部改动已合并`, infoPath,
      })
    }

    listen<FileChangedPayload>('file-externally-changed', (evt) => {
      const { tabId, content } = evt.payload
      handleExternalActivity(tabId)
      // Debounce · 200ms 内的同一 tab 多次 event 合并成一次（取最新 content）
      const existing = debounceRef.current.get(tabId)
      if (existing) {
        window.clearTimeout(existing.timer)
        existing.latestContent = content
      }
      const entry = existing ?? { timer: 0, latestContent: content }
      entry.latestContent = content
      entry.timer = window.setTimeout(() => {
        const latest = entry.latestContent
        debounceRef.current.delete(tabId)
        // 串行化：等上一次 merge 完成再跑，避免 base 落后造成假冲突
        const prev = mergingRef.current.get(tabId) ?? Promise.resolve()
        const next = prev.then(() => handleChange(tabId, latest))
        mergingRef.current.set(tabId, next)
      }, DEBOUNCE_MS)
      debounceRef.current.set(tabId, entry)
    })
      .then((fn) => {
        if (cancelled) fn()
        else unlisteners.push(fn)
      })
      .catch((e) => console.warn('listen file-externally-changed failed:', e))

    listen<FileRemovedPayload>('file-removed', (evt) => {
      const { tabId, newPath } = evt.payload
      const tab = useWorkspace
        .getState()
        .panes.flatMap((p) => p.tabs)
        .find((t) => t.id === tabId)
      if (!tab || tab.missing) return
      useWorkspace.getState().setMissing(tabId, true)
      // 能识别出 rename 新位置就显示，否则 fallback
      const msg = newPath
        ? `${tab.title} 已移动到 ${basename(newPath)}`
        : `${tab.title} 已从原位置移动或删除`
      statusInfo.warn(msg, { path: tab.path ?? undefined })
      // missing 是 destructive 变化（等 ⌘S 弹 saveTabAs 就太晚）· toast 确保看到
      toast.warn(msg)
    })
      .then((fn) => {
        if (cancelled) fn()
        else unlisteners.push(fn)
      })
      .catch((e) => console.warn('listen file-removed failed:', e))

    return () => {
      cancelled = true
      unlisteners.forEach((fn) => fn())
      // 清理 pending debounce timers · 避免 unmount 后 still firing
      debounceRef.current.forEach((e) => window.clearTimeout(e.timer))
      debounceRef.current.clear()
      activityTimersRef.current.forEach((timers) => {
        if (timers.cooldown) window.clearTimeout(timers.cooldown)
        if (timers.idle) window.clearTimeout(timers.idle)
      })
      activityTimersRef.current.clear()
      lastExternalAtRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── watch 注册同步（新开 tab → watch；关 tab → unwatch） ──
  useEffect(() => {
    const makeKey = (path: string, tabId: string) => `${path}::${tabId}`
    const parseKey = (key: string) => {
      const i = key.lastIndexOf('::')
      return { path: key.slice(0, i), tabId: key.slice(i + 2) }
    }
    const current = new Set<string>()
    panes.forEach((pane) =>
      pane.tabs.forEach((t) => {
        if (t.path) current.add(makeKey(t.path, t.id))
      }),
    )
    const prev = watchedRef.current

    current.forEach((key) => {
      if (prev.has(key)) return
      const { path, tabId } = parseKey(key)
      invoke('watch_file', { path, tabId }).catch((e) =>
        console.warn('watch_file failed:', path, e),
      )
    })
    prev.forEach((key) => {
      if (current.has(key)) return
      const { path, tabId } = parseKey(key)
      invoke('unwatch_file', { path, tabId }).catch(() => {})
      externalActivity.clear(tabId)
      lastExternalAtRef.current.delete(tabId)
      const timers = activityTimersRef.current.get(tabId)
      if (timers?.cooldown) window.clearTimeout(timers.cooldown)
      if (timers?.idle) window.clearTimeout(timers.idle)
      activityTimersRef.current.delete(tabId)
    })

    watchedRef.current = current
  }, [panes])
}
