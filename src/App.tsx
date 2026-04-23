import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openUrl } from '@tauri-apps/plugin-opener'
import { MilkdownProvider } from '@milkdown/react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { type EditorHandle } from './components/Editor'
import { Welcome } from './components/Welcome'
import { TOC, parseHeadings, type Heading } from './components/TOC'
import { Settings } from './components/Settings'
import { Toasts } from './components/Toasts'
import { UnsavedPrompt } from './components/UnsavedPrompt'
import {
  BackupRestorePrompt,
  type BackupEntry,
} from './components/BackupRestorePrompt'
import { SearchBar } from './components/SearchBar'
import { ShortcutHelp } from './components/ShortcutHelp'
import { PaneView } from './components/PaneView'
import { Lightbox } from './components/Lightbox'
import { useWorkspace } from './store/workspace'
import { toast } from './store/toasts'
import { statusInfo } from './store/statusInfo'
import { useSettings } from './store/settings'
import { useFile } from './hooks/useFile'
import { useKeybinding } from './hooks/useKeybinding'
import { useTheme } from './hooks/useTheme'
import { useDragDrop } from './hooks/useDragDrop'
import { useExternalFileWatch } from './hooks/useExternalFileWatch'
import { useBackup, flushAllBackups } from './hooks/useBackup'
import { saveSession, type SessionState } from './store/session'
import {
  resolveHeadingIndex,
  resolveHeadingOccurrence,
  tocHeadingSelector,
} from './lib/tocNavigation'
import {
  buildBackupDiscardSummary,
  buildBackupRestoreSummary,
} from './lib/statusMessages'

/**
 * Ink — Markdown reader/editor
 *
 * Layout:
 *   ┌──────────────────────────────────────┐
 *   │ [traffic lights]  title              │ ← titlebar (draggable)
 *   ├─────┬─────────────────┬──────────────┤
 *   │     │ TabBar p0       │ TabBar p1    │
 *   │ TOC ├─────────────────┼──────────────┤
 *   │     │  Editor (p0)    │ Editor (p1)  │
 *   │     │                 │              │
 *   └─────┴─────────────────┴──────────────┘
 *
 * App 是 coordination layer——组合 hooks（主题/拖拽/外部文件 poll 等）
 * 然后渲染 layout。各个 panel 的内部渲染在 PaneView 里。
 */
function App() {
  const panes = useWorkspace((s) => s.panes)
  const activePaneIndex = useWorkspace((s) => s.activePaneIndex)
  const newEmptyTab = useWorkspace((s) => s.newEmptyTab)
  const requestCloseTab = useWorkspace((s) => s.requestCloseTab)
  const setActiveTab = useWorkspace((s) => s.setActiveTab)
  const splitRight = useWorkspace((s) => s.splitRight)
  const confirmClose = useWorkspace((s) => s.confirmClose)
  const cancelCloseConfirm = useWorkspace((s) => s.cancelCloseConfirm)
  const confirmAndCloseTab = useWorkspace((s) => s.confirmAndCloseTab)

  const tocVisible = useSettings((s) => s.tocVisible)
  const toggleToc = useSettings((s) => s.toggleToc)

  const { openFileDialog, openPath, saveTab } = useFile()
  // openPath 每次 render 是新 reference；用 ref 让 Tauri listener effect 能
  // 只挂一次（deps=[]）而访问最新的 openPath——避免 listener 累加 pitfall
  const openPathRef = useRef(openPath)
  useEffect(() => {
    openPathRef.current = openPath
  }, [openPath])

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sessionRestored, setSessionRestored] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [zenMode, setZenMode] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null,
  )
  const [windowClose, setWindowClose] = useState<{
    dirtyIds: string[]
  } | null>(null)
  const [backupsToRestore, setBackupsToRestore] = useState<BackupEntry[] | null>(
    null,
  )

  /** TOC 当前高亮的 heading 索引（跟随滚动） */
  const [activeHeading, setActiveHeading] = useState<number | null>(null)
  /** TOC 点击锁 · 短时间内不让 scroll 反推覆盖用户意图 */
  const tocLockUntilRef = useRef(0)
  const TOC_LOCK_MS = 1000

  /** paneIndex → EditorHandle（Milkdown undo/redo / 拖图片插入 入口）*/
  const editorHandles = useRef<Map<number, EditorHandle>>(new Map())
  const registerEditorHandle = (
    paneIndex: number,
    handle: EditorHandle | null,
  ) => {
    if (handle) {
      editorHandles.current.set(paneIndex, handle)
      handle.setFocusMode(focusMode) // 新 editor mount 时继承当前 focus 状态
    } else editorHandles.current.delete(paneIndex)
  }

  const activePane = panes[activePaneIndex] ?? panes[0]
  const activeTab =
    activePane?.tabs.find((t) => t.id === activePane.activeTabId) ?? null
  const noContent =
    panes.length === 0 || (panes.length === 1 && panes[0].tabs.length === 0)

  // ─── Hooks 层 · 独立职责 ─────────────────────────────────
  useTheme()
  useDragDrop({ setDragOver, openPathRef, editorHandles })
  useExternalFileWatch({
    getHandleForPane: (paneIdx) => editorHandles.current.get(paneIdx) ?? null,
  })
  useBackup()

  // focusMode 变 → 推给所有已 mount 的 editor
  useEffect(() => {
    editorHandles.current.forEach((h) => h.setFocusMode(focusMode))
  }, [focusMode])

  const focusActiveEditor = () => {
    window.requestAnimationFrame(() => {
      editorHandles.current.get(activePaneIndex)?.focus()
    })
  }

  const closeSearch = (restoreFocus = false) => {
    setSearchOpen(false)
    if (restoreFocus) focusActiveEditor()
  }

  const openSearchBar = () => {
    setSettingsOpen(false)
    setHelpOpen(false)
    setSearchOpen(true)
  }

  const openSettingsPanel = () => {
    closeSearch(false)
    setHelpOpen(false)
    setSettingsOpen(true)
  }

  const openShortcutHelp = () => {
    closeSearch(false)
    setSettingsOpen(false)
    setHelpOpen(true)
  }

  const discardBackups = () => {
    const backups = backupsToRestore
    if (!backups?.length) return
    setBackupsToRestore(null)
    for (const b of backups) {
      invoke('delete_backup', { path: b.path }).catch(() => {})
    }
    statusInfo.info(buildBackupDiscardSummary(backups.length))
  }

  const restoreBackups = async () => {
    const backups = backupsToRestore
    if (!backups?.length) return
    setBackupsToRestore(null)
    const ws = useWorkspace.getState()
    for (const b of backups) {
      if (b.path.startsWith('untitled:')) {
        // Untitled · 新开空 tab + 灌 backup 内容 + 标 dirty
        ws.newEmptyTab()
        const state = useWorkspace.getState()
        const pane = state.panes[state.activePaneIndex]
        const newTab = pane.tabs[pane.tabs.length - 1]
        if (newTab) {
          ws.loadRestoredBackup(newTab.id, b.content)
        }
        // 旧 backup key（untitled:oldid）在新 tab ⌘S 或 close 时会清
        // 这里立刻清掉以免下次启动重复弹
        invoke('delete_backup', { path: b.path }).catch(() => {})
      } else {
        // 有 path · openPath → loadRestoredBackup 覆盖成 backup 内容
        await openPath(b.path)
        const state = useWorkspace.getState()
        const opened = state.panes
          .flatMap((p) => p.tabs)
          .find((t) => t.path === b.path)
        if (opened) {
          ws.loadRestoredBackup(opened.id, b.content)
        }
      }
    }
    statusInfo.info(buildBackupRestoreSummary(backups.length))
    focusActiveEditor()
  }

  const handleEscape = () => {
    if (lightbox) {
      setLightbox(null)
      return
    }
    if (confirmClose) {
      cancelCloseConfirm()
      return
    }
    if (windowClose) {
      setWindowClose(null)
      return
    }
    if (backupsToRestore) {
      discardBackups()
      return
    }
    if (settingsOpen) {
      setSettingsOpen(false)
      return
    }
    if (helpOpen) {
      setHelpOpen(false)
      return
    }
    if (searchOpen) {
      closeSearch(true)
      return
    }
    if (tocVisible && activeTab) {
      toggleToc()
      return
    }
    if (zenMode) {
      setZenMode(false)
    }
  }

  // ─── TOC 点击跳转：scroll to heading in active pane ───
  // h.text 已在 parseHeadings 里 strip 过 md inline 符号（反引号 / 星号 /
  // 下划线）。DOM textContent 里的 code tag 内容也只是纯文本，所以两边
  // clean 后可比对。再加 whitespace normalize 防 tab / 多空格差异。
  const onTocNavigate = (h: Heading, originalIndex: number) => {
    // 立即更新 active 到点击项 + 短锁一下（文档末尾 heading scroll 不动时
    // 也能让 TOC 蓝色高亮跳到被点的那个；期间 scroll listener 不覆盖）
    setActiveHeading(originalIndex)

    const headings = activeTab ? parseHeadings(activeTab.content) : []
    const headingIndex = resolveHeadingIndex(headings, h, originalIndex)
    const duplicateIndex = resolveHeadingOccurrence(headings, headingIndex, h.text)
    const didNavigate = editorHandles.current
      .get(activePaneIndex)
      ?.scrollToHeading(h.text, headingIndex, duplicateIndex)
    tocLockUntilRef.current = Date.now() + (didNavigate ? TOC_LOCK_MS : 120)
  }

  // ─── Keybindings ────────────────────────────────────────
  useKeybinding({
    'Cmd+o': () => openFileDialog(),
    'Cmd+n': () => newEmptyTab(),
    'Cmd+t': () => newEmptyTab(),
    'Cmd+s': () => {
      if (activeTab) saveTab(activeTab.id)
    },
    'Cmd+w': () => {
      if (activeTab) requestCloseTab(activeTab.id)
    },
    'Cmd+backslash': () => splitRight(),
    'Cmd+Shift+o': () => toggleToc(),
    'Cmd+comma': () => openSettingsPanel(),
    'Cmd+f': () => openSearchBar(),
    'Cmd+slash': () => openShortcutHelp(),
    'Cmd+Shift+enter': () => setZenMode((z) => !z),
    'Cmd+Shift+l': () => setFocusMode((f) => !f),
    escape: handleEscape,
    // Chrome 风格切 tab: Cmd+⇧] 下一个 / Cmd+⇧[ 上一个
    'Cmd+Shift+bracketright': () => {
      if (!activePane) return
      const idx = activePane.tabs.findIndex((t) => t.id === activeTab?.id)
      const next = activePane.tabs[(idx + 1) % activePane.tabs.length]
      if (next) setActiveTab(next.id)
    },
    'Cmd+Shift+bracketleft': () => {
      if (!activePane) return
      const idx = activePane.tabs.findIndex((t) => t.id === activeTab?.id)
      const prev =
        activePane.tabs[(idx - 1 + activePane.tabs.length) % activePane.tabs.length]
      if (prev) setActiveTab(prev.id)
    },
    // Cmd+1..9 切到 active pane 的第 N 个 tab
    'Cmd+1': () => activePane?.tabs[0] && setActiveTab(activePane.tabs[0].id),
    'Cmd+2': () => activePane?.tabs[1] && setActiveTab(activePane.tabs[1].id),
    'Cmd+3': () => activePane?.tabs[2] && setActiveTab(activePane.tabs[2].id),
    'Cmd+4': () => activePane?.tabs[3] && setActiveTab(activePane.tabs[3].id),
    'Cmd+5': () => activePane?.tabs[4] && setActiveTab(activePane.tabs[4].id),
    'Cmd+6': () => activePane?.tabs[5] && setActiveTab(activePane.tabs[5].id),
    'Cmd+7': () => activePane?.tabs[6] && setActiveTab(activePane.tabs[6].id),
    'Cmd+8': () => activePane?.tabs[7] && setActiveTab(activePane.tabs[7].id),
    'Cmd+9': () => {
      const last = activePane?.tabs[activePane.tabs.length - 1]
      if (last) setActiveTab(last.id)
    },
  })

  // ─── 启动：argv 文件 + 扫 backup ──────────────────────────
  // 冷启动干干净净——有 argv 就打开 argv；没 argv 就 Welcome。
  // 另外启动扫一次未保存 backup（上次 crash / 断电留的），非空弹恢复对话框。
  useEffect(() => {
    ;(async () => {
      let argvFiles: string[] = []
      try {
        argvFiles = await invoke<string[]>('get_pending_files')
      } catch (e) {
        console.warn('get_pending_files failed:', e)
      }
      for (const f of argvFiles) {
        await openPath(f)
      }
      setSessionRestored(true)

      // Backup 扫描 —— crash/断电后的 escape hatch
      try {
        const backups = await invoke<BackupEntry[]>('list_backups')
        if (backups.length > 0) setBackupsToRestore(backups)
      } catch (e) {
        console.warn('list_backups failed:', e)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Session save（每次 tabs/active 变化，restore 之后才启动）──
  useEffect(() => {
    if (!sessionRestored) return
    const state: SessionState = {
      panes: panes.map((p) => ({
        paths: p.tabs.map((t) => t.path).filter((x): x is string => !!x),
        activePath:
          p.tabs.find((t) => t.id === p.activeTabId)?.path ?? null,
      })),
      activePaneIndex,
    }
    saveSession(state)
  }, [panes, activePaneIndex, sessionRestored])

  // ─── 编辑区 img 单击 → Lightbox 大图预览 ───────────────────
  // capture phase 拦 mousedown——不让 ProseMirror 接到（否则会先走 NodeSelection
  // 给 img 套一层蓝色蒙版，视觉上闪一下）。作为阅读器，单击看大图是更合理默认；
  // 编辑 img（删除）可以把光标移过去按 Backspace。
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof HTMLImageElement)) return
      if (!target.closest('.milkdown-host')) return
      if (e.button !== 0) return // 只处理左键
      e.preventDefault()
      e.stopPropagation()
      setLightbox({ src: target.src, alt: target.alt })
    }
    document.addEventListener('mousedown', onMouseDown, true)
    return () => document.removeEventListener('mousedown', onMouseDown, true)
  }, [])

  // ─── 链接点击 → 外部浏览器（Tauri opener） ─────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href) return
      if (/^https?:\/\//i.test(href)) {
        e.preventDefault()
        openUrl(href).catch((err) => {
          console.warn('openUrl failed:', err)
          toast.error('打不开链接：' + String(err))
        })
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  // ─── 红叉/Cmd+Q 关窗口 → Rust block，前端 check dirty ──
  //     关前先 flushAllBackups（pending debounce 立刻写 backup · 防 last-second 丢字）
  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      unlisten = await listen('request-close-window', async () => {
        const ws = useWorkspace.getState()
        const dirty = ws.panes.flatMap((p) => p.tabs).filter((t) => t.dirty)
        // 无 dirty 时直接关，不需要 flush
        if (dirty.length === 0) {
          await getCurrentWindow().destroy()
        } else {
          // 有 dirty → 先 flush 所有 backup（不等 debounce）· 再弹确认对话框
          await flushAllBackups()
          setWindowClose({ dirtyIds: dirty.map((t) => t.id) })
        }
      })
    })()
    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  // ─── 运行中收到 file-open 事件（已 running 时双击 .md）──
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    ;(async () => {
      const fn = await listen<string[]>('files-opened', (evt) => {
        for (const p of evt.payload) {
          if (p.match(/\.(md|markdown|mdx)$/i)) {
            openPathRef.current(p)
          }
        }
      })
      if (cancelled) fn()
      else unlisten = fn
    })()
    return () => {
      cancelled = true
      if (unlisten) unlisten()
    }
  }, [])

  // ─── TOC 跟随滚动：找"最上方可见"的 heading ────────────
  useEffect(() => {
    if (!activeTab || !tocVisible) {
      setActiveHeading(null)
      return
    }
    const container = document.querySelector(
      `[data-pane-index="${activePaneIndex}"] .milkdown-host`,
    ) as HTMLElement | null
    if (!container) return

    const compute = () => {
      // TOC 点击后 1.5s 内 scroll listener 不覆盖（尊重用户点击意图）
      if (Date.now() < tocLockUntilRef.current) return
      const headings = container.querySelectorAll(
        tocHeadingSelector,
      ) as NodeListOf<HTMLElement>
      if (!headings.length) {
        setActiveHeading(null)
        return
      }
      const threshold = container.getBoundingClientRect().top + 80
      let lastPassed = -1
      for (let i = 0; i < headings.length; i++) {
        if (headings[i].getBoundingClientRect().top < threshold) {
          lastPassed = i
        } else {
          break
        }
      }
      setActiveHeading(lastPassed >= 0 ? lastPassed : 0)
    }

    compute()
    container.addEventListener('scroll', compute, { passive: true })
    const releaseLock = () => {
      tocLockUntilRef.current = 0
    }
    container.addEventListener('wheel', releaseLock, { passive: true })
    container.addEventListener('touchstart', releaseLock, { passive: true })
    const settle = window.setTimeout(compute, 200)
    return () => {
      container.removeEventListener('scroll', compute)
      container.removeEventListener('wheel', releaseLock)
      container.removeEventListener('touchstart', releaseLock)
      window.clearTimeout(settle)
    }
  }, [activePaneIndex, activeTab, tocVisible])

  // ─── 中文菜单 event 分发 ─────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      unlisten = await listen<string>('menu', (evt) => {
        const id = evt.payload
        switch (id) {
          case 'app.settings':
            openSettingsPanel()
            break
          case 'file.open':
            openFileDialog()
            break
          case 'file.new':
          case 'file.new_tab':
            newEmptyTab()
            break
          case 'file.save':
          case 'file.save_as':
            if (activeTab) saveTab(activeTab.id)
            break
          case 'file.close_tab':
            if (activeTab) requestCloseTab(activeTab.id)
            break
          case 'view.split':
            splitRight()
            break
          case 'view.toc':
            toggleToc()
            break
          case 'view.focus':
            setFocusMode((f) => !f)
            break
          case 'edit.undo':
            editorHandles.current.get(activePaneIndex)?.undo()
            break
          case 'edit.redo':
            editorHandles.current.get(activePaneIndex)?.redo()
            break
          case 'help.shortcuts':
            openShortcutHelp()
            break
        }
      })
    })()
    return () => {
      if (unlisten) unlisten()
    }
  }, [activeTab, activePaneIndex, openFileDialog, newEmptyTab, saveTab, requestCloseTab, splitRight, toggleToc])

  // TOC 只在有 active tab 且 visible 时显示
  const showToc = tocVisible && activeTab !== null

  return (
    <MilkdownProvider>
      <div className="ink-app-shell flex flex-col h-full w-full relative">
        {/* Titlebar —— zen 模式隐藏。单击 startDragging，双击 maximize */}
        {!zenMode && <div
          className="ink-titlebar h-10 flex items-center pl-20 pr-4 text-xs text-[color:var(--ink-muted)] select-none"
          onMouseDown={async (e) => {
            if (e.button !== 0) return
            const target = e.target as HTMLElement
            if (
              target.closest(
                'button, input, a, select, textarea, [role="button"]',
              )
            )
              return
            if (e.detail === 2) {
              await getCurrentWindow().toggleMaximize()
            } else {
              await getCurrentWindow().startDragging()
            }
          }}
        >
          <span className="truncate flex-1 flex items-center gap-1.5">
            {activeTab ? (
              <>
                {activeTab.dirty && (
                  <span
                    className="inline-block w-[6px] h-[6px] rounded-full bg-[color:var(--ink-accent)] flex-shrink-0"
                    aria-label="未保存"
                  />
                )}
                <span className="truncate">
                  {activeTab.path ?? activeTab.title}
                </span>
              </>
            ) : (
              <span>Ink</span>
            )}
          </span>
          {activeTab && (
            <button
              onClick={toggleToc}
              className={`ml-2 px-2 py-0.5 rounded text-[10px] transition-colors ${
                tocVisible
                  ? 'bg-[color:var(--ink-border)] text-[color:var(--ink-fg)]'
                  : 'text-[color:var(--ink-muted)] hover:bg-[color:var(--ink-border)]/60'
              }`}
              title="大纲 (⌘⇧O)"
            >
              大纲
            </button>
          )}
        </div>}

        <div className="flex-1 flex overflow-hidden">
          {!zenMode && showToc && (
            <TOC
              markdown={activeTab!.content}
              activeIndex={activeHeading}
              onNavigate={onTocNavigate}
              onClose={toggleToc}
            />
          )}
          <div className="flex-1 flex flex-col overflow-hidden">
            {noContent ? (
              <Welcome />
            ) : panes.length === 1 ? (
              <PaneView
                pane={panes[0]}
                paneIndex={0}
                zen={zenMode}
                onEditorRef={registerEditorHandle}
              />
            ) : (
              <PanelGroup direction="horizontal" autoSaveId="ink-split">
                <Panel defaultSize={50} minSize={25}>
                  <PaneView
                    pane={panes[0]}
                    paneIndex={0}
                    zen={zenMode}
                    onEditorRef={registerEditorHandle}
                  />
                </Panel>
                <PanelResizeHandle className="ink-pane-divider w-px bg-[color:var(--ink-border)] hover:bg-[color:var(--ink-accent)] transition-colors cursor-col-resize" />
                <Panel defaultSize={50} minSize={25}>
                  <PaneView
                    pane={panes[1]}
                    paneIndex={1}
                    zen={zenMode}
                    onEditorRef={registerEditorHandle}
                  />
                </Panel>
              </PanelGroup>
            )}
          </div>
        </div>

        <div className="ink-overlay-layer">
          {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
          {searchOpen && (
            <SearchBar
              getHandle={() => editorHandles.current.get(activePaneIndex)}
              onClose={() => closeSearch(true)}
            />
          )}
          {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}

          {confirmClose && (
            <UnsavedPrompt
              title={confirmClose.title}
              onSave={async () => {
                const tabId = confirmClose.tabId
                await saveTab(tabId)
                const still = useWorkspace
                  .getState()
                  .panes.flatMap((p) => p.tabs)
                  .find((t) => t.id === tabId)
                if (still && !still.dirty) {
                  confirmAndCloseTab()
                } else {
                  cancelCloseConfirm()
                }
              }}
              onDiscard={() => {
                // discard = 明确丢弃未保存改动 · 连带清 backup（否则下次启动还会 prompt 恢复）
                const tab = useWorkspace
                  .getState()
                  .panes.flatMap((p) => p.tabs)
                  .find((t) => t.id === confirmClose.tabId)
                if (tab) {
                  invoke('delete_backup', {
                    path: tab.path ?? `untitled:${tab.id}`,
                  }).catch(() => {})
                }
                confirmAndCloseTab()
              }}
              onCancel={cancelCloseConfirm}
            />
          )}

          {backupsToRestore && (
            <BackupRestorePrompt
              backups={backupsToRestore}
              onRestoreAll={restoreBackups}
              onDiscardAll={discardBackups}
            />
          )}

          {windowClose && (() => {
            const ws = useWorkspace.getState()
            const dirty = ws.panes
              .flatMap((p) => p.tabs)
              .filter((t) => windowClose.dirtyIds.includes(t.id))
            const title =
              dirty.length === 1
                ? dirty[0].title
                : `${dirty.length} 个未保存的文件`
            const message =
              dirty.length === 1
                ? undefined
                : `有 ${dirty.length} 个文件未保存：${dirty.map((t) => t.title).join('、')}。关闭前要保存吗？`
            return (
              <UnsavedPrompt
                title={title}
                message={message}
                onSave={async () => {
                  for (const t of dirty) {
                    await saveTab(t.id)
                  }
                  const still = useWorkspace
                    .getState()
                    .panes.flatMap((p) => p.tabs)
                    .filter((t) => t.dirty)
                  if (still.length === 0) {
                    setWindowClose(null)
                    await getCurrentWindow().destroy()
                  } else {
                    setWindowClose({ dirtyIds: still.map((t) => t.id) })
                  }
                }}
                onDiscard={async () => {
                  // 关窗口时 discard 所有 dirty tab · 连带清它们的 backup
                  for (const t of dirty) {
                    invoke('delete_backup', {
                      path: t.path ?? `untitled:${t.id}`,
                    }).catch(() => {})
                  }
                  setWindowClose(null)
                  await getCurrentWindow().destroy()
                }}
                onCancel={() => setWindowClose(null)}
              />
            )
          })()}
          {dragOver && (
            <div
              className="ink-drop-zone pointer-events-none absolute inset-0 z-30 bg-[color:var(--ink-accent)]/[0.06] ring-1 ring-inset ring-[color:var(--ink-accent)]/25"
              aria-hidden
            />
          )}
          {lightbox && (
            <Lightbox
              src={lightbox.src}
              alt={lightbox.alt}
              onClose={() => setLightbox(null)}
            />
          )}
          <Toasts />
        </div>
      </div>
    </MilkdownProvider>
  )
}

export default App
