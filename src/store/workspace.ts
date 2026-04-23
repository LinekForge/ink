import { create } from 'zustand'
import { copyScrollTop, forgetScrollTop } from '../lib/viewportMemory'

/**
 * Workspace state —— 支持 1 或 2 个 panes，每 pane 有自己的 tabs 组。
 *
 * Dirty tracking 架构（v0.3.5 重构）：
 * 不再用"字符串 diff"判断 dirty——踩了太多 edge case（Milkdown serialize 在
 * undo/redo/换行/特殊格式 后和原始 md 的字符可能不等，但 ProseMirror doc tree
 * 是等价的）。改成 **Editor 内部用 ProseMirror `doc.eq()` 判断**，dirty 作为
 * Editor emit 的 signal 经 setDirty action 写入 store。
 *
 * 相关 revision 递增 marker：
 * - savedRevision: markSaved 时 +1，Editor watch 此 marker 重置内部 savedDoc
 * - reloadRevision: reloadTabFromExternal 时 +1，强制 Editor remount 重新 parse
 */

export type Tab = {
  id: string
  path: string | null
  title: string
  content: string // body only（frontmatter 已剥离）
  frontmatter: string | null
  dirty: boolean
  savedRevision: number
  reloadRevision: number
  /** 3-way merge 的共同祖先——Ink 上次从 disk 读到的 raw 内容（含 frontmatter）。
   *  openTab 初始化，markSaved 同步成当前保存内容，外部 merge 后同步成 theirs。*/
  baseContent: string
  /** 文件从 disk 消失（移动 / 删除）。⌘S 时弹"另存为"对话框，避免 ghost 写回 */
  missing: boolean
}

export type Pane = {
  tabs: Tab[]
  activeTabId: string | null
}

type WorkspaceState = {
  panes: Pane[]
  activePaneIndex: number

  // —— Tab ops ——
  openTab: (path: string, rawContent: string, paneIndex?: number) => void
  newEmptyTab: (paneIndex?: number) => void
  closeTab: (id: string) => void
  requestCloseTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateContent: (id: string, content: string) => void
  setDirty: (id: string, dirty: boolean) => void
  markSaved: (id: string, savedPath?: string) => void
  reloadTabFromExternal: (id: string, rawContent: string) => void
  /** 外部改动三路合并结果注入：更新 content + frontmatter + baseContent。
   *  dirty 由 Editor 的 doc.eq 自己重算（merge 可能让用户的未保存改动仍在 ours 里）。*/
  applyExternalMerge: (id: string, mergedRaw: string, newBaseContent: string) => void
  /** 强制让 Editor 下次 mount 重新 parse content（non-active tab 合并后用）*/
  bumpReloadRevision: (id: string) => void
  /** 让 Editor 把当前 doc 作为新的 savedDoc（dirty 归零）· 外部 auto-sync
   *  后编辑器内容 == 磁盘内容，应标记为"已同步"，否则 dirty 误判 true */
  bumpSavedRevision: (id: string) => void
  /** Backup 恢复：灌入未保存 content，保持 dirty=true 让用户看到蓝点 · ⌘W 关时弹 UnsavedPrompt */
  loadRestoredBackup: (id: string, rawContent: string) => void
  reorderTabs: (paneIndex: number, from: number, to: number) => void
  setMissing: (id: string, missing: boolean) => void

  // —— Unsaved confirm ——
  confirmClose: { tabId: string; title: string } | null
  cancelCloseConfirm: () => void
  confirmAndCloseTab: () => void

  // —— Pane ops ——
  setActivePane: (index: number) => void
  splitRight: () => void
  closePane: (index: number) => void
}

const nextId = () => Math.random().toString(36).slice(2, 10)
const basename = (p: string) => p.split('/').pop() || p

const emptyPane = (): Pane => ({ tabs: [], activeTabId: null })

export function splitFrontmatter(md: string): {
  frontmatter: string | null
  body: string
} {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n){0,2}([\s\S]*)$/)
  if (m) return { frontmatter: m[1], body: m[2] }
  return { frontmatter: null, body: md }
}

export function joinFrontmatter(fm: string | null, body: string): string {
  if (fm === null) return body
  return `---\n${fm}\n---\n\n${body}`
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  panes: [emptyPane()],
  activePaneIndex: 0,
  confirmClose: null,

  openTab: (path, rawContent, paneIndex) => {
    const targetIdx = paneIndex ?? get().activePaneIndex

    const { panes } = get()
    for (let i = 0; i < panes.length; i++) {
      const exist = panes[i].tabs.find((t) => t.path === path)
      if (exist) {
        set((s) => ({
          activePaneIndex: i,
          panes: s.panes.map((p, idx) =>
            idx === i ? { ...p, activeTabId: exist.id } : p,
          ),
        }))
        return
      }
    }

    const { frontmatter, body } = splitFrontmatter(rawContent)
    const tab: Tab = {
      id: nextId(),
      path,
      title: basename(path),
      content: body,
      frontmatter,
      dirty: false,
      savedRevision: 0,
      reloadRevision: 0,
      baseContent: rawContent,
      missing: false,
    }
    set((s) => ({
      activePaneIndex: targetIdx,
      panes: s.panes.map((p, idx) =>
        idx === targetIdx
          ? { ...p, tabs: [...p.tabs, tab], activeTabId: tab.id }
          : p,
      ),
    }))
  },

  newEmptyTab: (paneIndex) => {
    const targetIdx = paneIndex ?? get().activePaneIndex
    const tab: Tab = {
      id: nextId(),
      path: null,
      title: 'Untitled',
      content: '',
      frontmatter: null,
      dirty: false,
      savedRevision: 0,
      reloadRevision: 0,
      baseContent: '',
      missing: false,
    }
    set((s) => ({
      activePaneIndex: targetIdx,
      panes: s.panes.map((p, idx) =>
        idx === targetIdx
          ? { ...p, tabs: [...p.tabs, tab], activeTabId: tab.id }
          : p,
      ),
    }))
  },

  requestCloseTab: (id) => {
    const tab = get()
      .panes.flatMap((p) => p.tabs)
      .find((t) => t.id === id)
    if (!tab) return
    if (tab.dirty) {
      set({ confirmClose: { tabId: id, title: tab.title } })
    } else {
      get().closeTab(id)
    }
  },

  cancelCloseConfirm: () => set({ confirmClose: null }),

  confirmAndCloseTab: () => {
    const cc = get().confirmClose
    if (!cc) return
    get().closeTab(cc.tabId)
    set({ confirmClose: null })
  },

  closeTab: (id) => {
    forgetScrollTop(id)
    set((s) => {
      const newPanes = s.panes.map((p) => {
        const idx = p.tabs.findIndex((t) => t.id === id)
        if (idx === -1) return p
        const newTabs = p.tabs.filter((t) => t.id !== id)
        let newActive = p.activeTabId
        if (p.activeTabId === id) {
          newActive = newTabs[Math.min(idx, newTabs.length - 1)]?.id ?? null
        }
        return { tabs: newTabs, activeTabId: newActive }
      })

      if (newPanes.length === 2 && newPanes[1].tabs.length === 0) {
        return { panes: [newPanes[0]], activePaneIndex: 0 }
      }
      if (newPanes.length === 2 && newPanes[0].tabs.length === 0) {
        return { panes: [newPanes[1]], activePaneIndex: 0 }
      }
      return { panes: newPanes }
    })
  },

  setActiveTab: (id) => {
    const { panes } = get()
    for (let i = 0; i < panes.length; i++) {
      if (panes[i].tabs.some((t) => t.id === id)) {
        set((s) => ({
          activePaneIndex: i,
          panes: s.panes.map((p, idx) =>
            idx === i ? { ...p, activeTabId: id } : p,
          ),
        }))
        return
      }
    }
  },

  updateContent: (id, content) =>
    set((s) => ({
      panes: s.panes.map((p) => ({
        ...p,
        tabs: p.tabs.map((t) => (t.id === id ? { ...t, content } : t)),
      })),
    })),

  setDirty: (id, dirty) =>
    set((s) => ({
      panes: s.panes.map((p) => ({
        ...p,
        tabs: p.tabs.map((t) => (t.id === id ? { ...t, dirty } : t)),
      })),
    })),

  markSaved: (id, savedPath) =>
    set((s) => ({
      panes: s.panes.map((p) => ({
        ...p,
        tabs: p.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                path: savedPath ?? t.path,
                title: savedPath ? basename(savedPath) : t.title,
                dirty: false,
                savedRevision: t.savedRevision + 1,
                // 保存完 disk 内容 = joinFrontmatter(fm, body)，同步 base
                baseContent: joinFrontmatter(t.frontmatter, t.content),
                missing: false,
              }
            : t,
        ),
      })),
    })),

  reloadTabFromExternal: (id, raw) => {
    const { frontmatter, body } = splitFrontmatter(raw)
    set((s) => ({
      panes: s.panes.map((p) => ({
        ...p,
        tabs: p.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                content: body,
                frontmatter,
                dirty: false,
                reloadRevision: t.reloadRevision + 1,
                savedRevision: t.savedRevision + 1,
                baseContent: raw,
                missing: false,
              }
            : t,
        ),
      })),
    }))
  },

  applyExternalMerge: (id, mergedRaw, newBaseContent) => {
    const { frontmatter, body } = splitFrontmatter(mergedRaw)
    set((s) => ({
      panes: s.panes.map((p) => ({
        ...p,
        tabs: p.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                content: body,
                frontmatter,
                // baseContent 更新为 theirs（disk 当前真相）。dirty 由 Editor 层
                // 按 doc.eq 自己算——merge 后 doc 可能仍非 saved，保持 dirty=true
                baseContent: newBaseContent,
                missing: false,
              }
            : t,
        ),
      })),
    }))
  },

  bumpReloadRevision: (id) =>
    set((s) => ({
      panes: s.panes.map((p) => ({
        ...p,
        tabs: p.tabs.map((t) =>
          t.id === id ? { ...t, reloadRevision: t.reloadRevision + 1 } : t,
        ),
      })),
    })),

  bumpSavedRevision: (id) =>
    set((s) => ({
      panes: s.panes.map((p) => ({
        ...p,
        tabs: p.tabs.map((t) =>
          t.id === id
            ? { ...t, savedRevision: t.savedRevision + 1, dirty: false }
            : t,
        ),
      })),
    })),

  loadRestoredBackup: (id, rawContent) => {
    const { frontmatter, body } = splitFrontmatter(rawContent)
    set((s) => ({
      panes: s.panes.map((p) => ({
        ...p,
        tabs: p.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                content: body,
                frontmatter,
                dirty: true,
                reloadRevision: t.reloadRevision + 1,
              }
            : t,
        ),
      })),
    }))
  },

  setMissing: (id, missing) =>
    set((s) => ({
      panes: s.panes.map((p) => ({
        ...p,
        tabs: p.tabs.map((t) => (t.id === id ? { ...t, missing } : t)),
      })),
    })),

  reorderTabs: (paneIndex, from, to) =>
    set((s) => ({
      panes: s.panes.map((p, idx) => {
        if (idx !== paneIndex) return p
        const next = [...p.tabs]
        const [moved] = next.splice(from, 1)
        next.splice(to, 0, moved)
        return { ...p, tabs: next }
      }),
    })),

  setActivePane: (index) => set({ activePaneIndex: index }),

  splitRight: () => {
    set((s) => {
      if (s.panes.length >= 2) return s
      const activePane = s.panes[s.activePaneIndex]
      const active = activePane.tabs.find(
        (t) => t.id === activePane.activeTabId,
      )
      const newPane: Pane = active
        ? {
            // 浅拷贝：path 相同但 id 独立，两个 tab 在新系统下各自 watch file
            // 各自维护 baseContent（外部 merge 时各自 diff3）
            tabs: [
              (() => {
                const nextIdValue = nextId()
                copyScrollTop(active.id, nextIdValue)
                return { ...active, id: nextIdValue }
              })(),
            ],
            activeTabId: null,
          }
        : emptyPane()
      if (newPane.tabs[0]) newPane.activeTabId = newPane.tabs[0].id

      return {
        panes: [...s.panes, newPane],
        activePaneIndex: 1,
      }
    })
  },

  closePane: (index) => {
    const pane = get().panes[index]
    pane?.tabs.forEach((tab) => forgetScrollTop(tab.id))
    set((s) => {
      if (s.panes.length <= 1) return s
      const newPanes = s.panes.filter((_, i) => i !== index)
      return { panes: newPanes, activePaneIndex: 0 }
    })
  },
}))
