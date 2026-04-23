import { useState } from 'react'
import { TabBar } from './TabBar'
import { Editor, type EditorHandle } from './Editor'
import { StatusBar } from './StatusBar'
import { useWorkspace, type Pane } from '../store/workspace'
import { useSettings } from '../store/settings'

type Props = {
  pane: Pane
  paneIndex: number
  active: boolean
  /** Zen 模式：隐藏 TabBar / StatusBar / frontmatter strip，只留正文 */
  zen: boolean
  /** 注册 editor handle 给 App（菜单 undo/redo / 拖拽插图用）*/
  onEditorRef: (paneIndex: number, handle: EditorHandle | null) => void
}

/**
 * 单个 pane 的渲染：TabBar + frontmatter 折叠条 + Editor + StatusBar。
 * 跟 App 是"组合 vs 组件"关系——App 管 pane 布局（单栏/分栏），PaneView 管
 * 单 pane 内部。
 */
export function PaneView({ pane, paneIndex, active, zen, onEditorRef }: Props) {
  const updateContent = useWorkspace((s) => s.updateContent)
  const setDirty = useWorkspace((s) => s.setDirty)
  const fontFamily = useSettings((s) => s.fontFamily)
  const fontSize = useSettings((s) => s.fontSize)
  const lineHeight = useSettings((s) => s.lineHeight)
  const maxWidth = useSettings((s) => s.maxWidth)

  const [fmOpen, setFmOpen] = useState(false)

  const tab = pane.tabs.find((t) => t.id === pane.activeTabId) ?? null

  const fontClass =
    fontFamily === 'sans'
      ? 'font-sans'
      : fontFamily === 'serif'
        ? 'font-serif'
        : 'font-mono'

  return (
    <div
      data-pane-index={paneIndex}
      data-print-active={active ? 'true' : 'false'}
      className="ink-pane h-full flex flex-col overflow-hidden"
    >
      {!zen && <TabBar paneIndex={paneIndex} />}
      {tab ? (
        <div
          className={`ink-pane-body flex-1 flex flex-col overflow-hidden ${fontClass}`}
          style={{ fontSize, lineHeight }}
        >
          {/* Column container —— 统一左轴对齐。宽度上限 = text-max-width × 1.5
              （允许代码块 / 表格 / 图片伸展的最大宽度）；在窗口里水平居中。
              内部 frontmatter 和 Editor 都从 container 左边开始，不再各自 center。
              min-w-0 防极端窄窗口下 flex child 传导失败 */}
          <div
            className="ink-document-shell mx-auto w-full min-w-0 flex-1 flex flex-col overflow-hidden px-10 py-6"
            style={
              {
                '--ink-text-max-width': `${maxWidth}px`,
                maxWidth: `${Math.round(maxWidth * 1.5)}px`,
              } as React.CSSProperties
            }
          >
            {/* frontmatter 折叠 strip —— 限到 text-max-width 左对齐（zen 隐藏） */}
            {!zen && tab.frontmatter && (
              <div
                className="ink-frontmatter-strip pb-3 text-[11px] select-none"
                style={{ maxWidth: `${maxWidth}px` }}
              >
                <button
                  onClick={() => setFmOpen((o) => !o)}
                  className="text-[color:var(--ink-muted)] hover:text-[color:var(--ink-fg)] transition-colors italic"
                  title="点击展开 / 折叠 frontmatter（保存时保留，不在此编辑）"
                >
                  {fmOpen ? '▾' : '▸'} frontmatter ·{' '}
                  {tab.frontmatter.split('\n').length} 行
                </button>
                {fmOpen && (
                  <pre className="mt-2 p-3 rounded-md bg-[color:var(--ink-code-bg)] text-[12px] whitespace-pre-wrap font-mono text-[color:var(--ink-fg)]/85 overflow-x-auto">
                    {tab.frontmatter}
                  </pre>
                )}
              </div>
            )}
            <Editor
              ref={(h) => onEditorRef(paneIndex, h)}
              tabId={tab.id}
              tabPath={tab.path}
              initialValue={tab.content}
              savedRevision={tab.savedRevision}
              reloadRevision={tab.reloadRevision}
              initiallyDirty={tab.dirty}
              onChange={(md) => updateContent(tab.id, md)}
              onDirtyChange={(dirty) => setDirty(tab.id, dirty)}
            />
          </div>
          {!zen && (
            <StatusBar tabId={tab.id} content={tab.content} dirty={tab.dirty} />
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[color:var(--ink-muted)] text-sm select-none">
          Pane 空。⌘O 打开 / ⌘N 新建
        </div>
      )}
    </div>
  )
}
