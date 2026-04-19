import { useWorkspace } from '../store/workspace'

type Props = {
  paneIndex: number
}

/**
 * TabBar —— 顶部一排页签。Each pane has its own TabBar.
 * Active: 下有 accent 横线。Dirty: 前缀 ●。Hover 显示 ×。
 */
export function TabBar({ paneIndex }: Props) {
  const pane = useWorkspace((s) => s.panes[paneIndex])
  const activePaneIndex = useWorkspace((s) => s.activePaneIndex)
  const setActiveTab = useWorkspace((s) => s.setActiveTab)
  const setActivePane = useWorkspace((s) => s.setActivePane)
  const requestCloseTab = useWorkspace((s) => s.requestCloseTab)
  const closePane = useWorkspace((s) => s.closePane)
  const newEmptyTab = useWorkspace((s) => s.newEmptyTab)
  const reorderTabs = useWorkspace((s) => s.reorderTabs)
  const panes = useWorkspace((s) => s.panes)

  if (!pane) return null
  const paneActive = paneIndex === activePaneIndex
  const canClosePane = panes.length > 1

  return (
    <div
      onClick={() => setActivePane(paneIndex)}
      className={`h-9 flex items-stretch border-b select-none overflow-x-auto transition-colors ${
        paneActive
          ? 'border-[color:var(--ink-border)] bg-[color:var(--ink-bg)]'
          : 'border-[color:var(--ink-border)] bg-[color:var(--ink-bg)]/60'
      }`}
      role="tablist"
    >
      {pane.tabs.map((tab) => {
        const active = tab.id === pane.activeTabId
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData(
                'application/ink-tab',
                JSON.stringify({ tabId: tab.id, paneIndex }),
              )
            }}
            onDragOver={(e) => {
              // 只接受来自同 pane 的 tab（跨 pane 移动 v0.3 再做）
              if (e.dataTransfer.types.includes('application/ink-tab')) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              try {
                const data = JSON.parse(
                  e.dataTransfer.getData('application/ink-tab'),
                )
                if (data.paneIndex !== paneIndex) return
                const from = pane.tabs.findIndex((t) => t.id === data.tabId)
                const to = pane.tabs.findIndex((t) => t.id === tab.id)
                if (from !== -1 && to !== -1 && from !== to) {
                  reorderTabs(paneIndex, from, to)
                }
              } catch {
                // ignore
              }
            }}
            onClick={(e) => {
              e.stopPropagation()
              setActivePane(paneIndex)
              setActiveTab(tab.id)
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                requestCloseTab(tab.id)
              }
            }}
            className={`group relative flex items-center gap-2 px-4 min-w-[80px] max-w-[220px] cursor-pointer border-r border-[color:var(--ink-border)] text-xs transition-colors ${
              active && paneActive
                ? 'bg-[color:var(--ink-bg)] text-[color:var(--ink-fg)]'
                : active
                  ? 'text-[color:var(--ink-fg)]/70'
                  : 'text-[color:var(--ink-muted)] hover:text-[color:var(--ink-fg)]'
            }`}
          >
            <span className="truncate flex-1 flex items-center gap-1.5">
              {tab.dirty && (
                <span
                  className="inline-block w-[6px] h-[6px] rounded-full bg-[color:var(--ink-accent)] flex-shrink-0"
                  aria-label="未保存"
                />
              )}
              <span className="truncate">{tab.title}</span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                requestCloseTab(tab.id)
              }}
              className="w-4 h-4 rounded-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[color:var(--ink-border)] transition-opacity text-[11px] leading-none text-[color:var(--ink-muted)] hover:text-[color:var(--ink-fg)]"
              aria-label="Close tab"
            >
              ✕
            </button>
            {active && (
              <span
                className={`absolute bottom-0 left-0 right-0 h-[2px] ${
                  paneActive
                    ? 'bg-[color:var(--ink-accent)]'
                    : 'bg-[color:var(--ink-border)]'
                }`}
              />
            )}
          </div>
        )
      })}

      {/* "+" new tab */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          newEmptyTab(paneIndex)
        }}
        className="px-3 border-r border-[color:var(--ink-border)] text-[color:var(--ink-muted)] hover:text-[color:var(--ink-fg)] hover:bg-[color:var(--ink-border)]/40 transition-colors text-sm"
        title="新建页签 (⌘T)"
      >
        +
      </button>

      <div className="flex-1" />

      {/* 右上关闭 pane 按钮 */}
      {canClosePane && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            closePane(paneIndex)
          }}
          className="px-3 text-[color:var(--ink-muted)] hover:text-[color:var(--ink-fg)] hover:bg-[color:var(--ink-border)]/40 transition-colors text-xs"
          title="关闭此栏"
        >
          ✕
        </button>
      )}
    </div>
  )
}
