import { useMemo, useState } from 'react'

export type Heading = {
  level: number // 1-6
  text: string
  line: number // line number in markdown (1-indexed)
  id: string
}

/** 剥掉 heading text 里的 md inline 符号（反引号 / 星号 / 下划线），
 *  用于显示和 DOM 文本比对。不是完整 inline md 解析，只处理最常见的。*/
function cleanHeadingText(raw: string): string {
  return raw
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim()
}

/**
 * Parse markdown for ATX headings (# ... ######).
 * 不处理 setext (underline) 形式。忽略 fenced code block 内的 #。
 * 自动 strip inline md 符号。
 */
export function parseHeadings(markdown: string): Heading[] {
  const lines = markdown.split('\n')
  const out: Heading[] = []
  let inFence = false
  let fenceMarker: string | null = null

  lines.forEach((line, i) => {
    const fenceMatch = line.match(/^(\s{0,3})(```+|~~~+)/)
    if (fenceMatch) {
      const marker = fenceMatch[2][0]
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (fenceMarker === marker) {
        inFence = false
        fenceMarker = null
      }
      return
    }
    if (inFence) return

    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!m) return
    const level = m[1].length
    const text = cleanHeadingText(m[2])
    const id = `h-${i}-${text.replace(/[^\w\u4e00-\u9fa5]+/g, '-').slice(0, 40)}`
    out.push({ level, text, line: i + 1, id })
  })
  return out
}

/** 判断每个 heading 是否有直接子项（后面紧跟一个更深 level 的 heading） */
function computeHasChildren(headings: Heading[]): boolean[] {
  return headings.map((h, i) => {
    const next = headings[i + 1]
    return !!next && next.level > h.level
  })
}

/** 根据 collapsed set 过滤出可见 headings。
 *  被折叠的 parent 吃掉所有 level 更深的后续 heading 直到遇到 level <= parent 的 */
function computeVisible(
  headings: Heading[],
  collapsed: Set<string>,
): Heading[] {
  const out: Heading[] = []
  let hideUntilLevel = Infinity
  for (const h of headings) {
    if (h.level > hideUntilLevel) continue
    hideUntilLevel = Infinity
    out.push(h)
    if (collapsed.has(h.id)) hideUntilLevel = h.level
  }
  return out
}

type Props = {
  markdown: string
  /** 当前正在阅读的 heading 索引（对应 parseHeadings 返回的序列）*/
  activeIndex: number | null
  /** 点击时传 heading + 它在 parseHeadings 里的原始 index（App 用来立即更新 active 高亮） */
  onNavigate: (heading: Heading, originalIndex: number) => void
  onClose: () => void
}

export function TOC({ markdown, activeIndex, onNavigate, onClose }: Props) {
  const headings = useMemo(() => parseHeadings(markdown), [markdown])
  const hasChildrenArr = useMemo(() => computeHasChildren(headings), [headings])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const minLevel = headings.length
    ? Math.min(...headings.map((h) => h.level))
    : 1

  const visibleHeadings = useMemo(
    () => computeVisible(headings, collapsed),
    [headings, collapsed],
  )

  const toggleOne = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setCollapsed(new Set())

  const collapseToFirstLevel = () => {
    // "展开第一层级" = depth 0 + depth 1 可见，更深收起
    // 实现：把所有 depth >= 1 且有子的 heading 折叠——depth 0 不折叠保持
    // 其 depth 1 子可见；depth 1 被折叠则其 depth 2+ 不可见
    const next = new Set<string>()
    headings.forEach((h, i) => {
      const depth = h.level - minLevel
      if (depth >= 1 && hasChildrenArr[i]) next.add(h.id)
    })
    setCollapsed(next)
  }

  // 原 headings 里的 index（用于 activeIndex 比对），为每个 visible heading 缓存
  const indexInOriginal = useMemo(() => {
    const map = new Map<string, number>()
    headings.forEach((h, i) => map.set(h.id, i))
    return map
  }, [headings])

  return (
    <aside className="w-60 h-full border-r border-[color:var(--ink-border)] bg-[color:var(--ink-bg)] flex flex-col select-none">
      <div className="h-9 flex items-center justify-between pl-3 pr-1 text-xs text-[color:var(--ink-muted)] border-b border-[color:var(--ink-border)]">
        <span>大纲</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={collapseToFirstLevel}
            title="只展第一层"
            aria-label="折叠到第一层"
            className="w-6 h-6 rounded-sm flex items-center justify-center hover:bg-[color:var(--ink-border)] text-[11px] leading-none"
          >
            ▸
          </button>
          <button
            onClick={expandAll}
            title="全部展开"
            aria-label="全部展开"
            className="w-6 h-6 rounded-sm flex items-center justify-center hover:bg-[color:var(--ink-border)] text-[11px] leading-none"
          >
            ▾
          </button>
          <button
            onClick={onClose}
            title="关闭 (⌘⇧O)"
            aria-label="Close outline"
            className="w-6 h-6 rounded-sm flex items-center justify-center hover:bg-[color:var(--ink-border)] text-[11px] leading-none ml-0.5"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {headings.length === 0 ? (
          <div className="px-3 py-4 text-xs text-[color:var(--ink-muted)]">
            文档里没有标题
          </div>
        ) : (
          <ul className="pb-3">
            {visibleHeadings.map((h) => {
              const originalIdx = indexInOriginal.get(h.id) ?? 0
              const depth = h.level - minLevel
              const isActive = originalIdx === activeIndex
              const hasChildren = hasChildrenArr[originalIdx]
              const isCollapsed = collapsed.has(h.id)

              const styleClass =
                depth === 0
                  ? 'text-[14px] font-semibold text-[color:var(--ink-fg)] tracking-tight'
                  : depth === 1
                    ? 'text-[13px] font-medium text-[color:var(--ink-fg)]/90'
                    : depth === 2
                      ? 'text-[12px] font-normal text-[color:var(--ink-fg)]/65'
                      : 'text-[11px] font-normal text-[color:var(--ink-fg)]/45'

              const sectionSpacing =
                depth === 0 && originalIdx > 0 ? 'mt-3' : ''

              return (
                <li key={h.id} className={`${sectionSpacing} group/item`}>
                  <div
                    className={`relative flex items-stretch transition-colors ${
                      isActive
                        ? 'bg-[color:var(--ink-accent)]/8 before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[2px] before:bg-[color:var(--ink-accent)] before:rounded-r'
                        : 'hover:bg-[color:var(--ink-border)]/40'
                    }`}
                  >
                    {/* Toggle · 只在有子项时渲染，独立可点 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (hasChildren) toggleOne(h.id)
                      }}
                      disabled={!hasChildren}
                      tabIndex={hasChildren ? 0 : -1}
                      aria-label={
                        hasChildren
                          ? isCollapsed
                            ? '展开'
                            : '折叠'
                          : undefined
                      }
                      style={{ marginLeft: 4 + depth * 16 }}
                      className={`flex-shrink-0 w-4 h-6 flex items-center justify-center text-[9px] transition-colors ${
                        hasChildren
                          ? 'text-[color:var(--ink-muted)]/70 hover:text-[color:var(--ink-fg)] cursor-pointer'
                          : 'opacity-0 cursor-default'
                      }`}
                    >
                      {isCollapsed ? '▸' : '▾'}
                    </button>
                    {/* Label · 点击跳转 */}
                    <button
                      onClick={() => onNavigate(h, originalIdx)}
                      title={h.text}
                      className={`flex-1 min-w-0 text-left py-[3px] pr-3 truncate leading-snug ${
                        isActive
                          ? 'text-[color:var(--ink-accent)]'
                          : `${styleClass} group-hover/item:text-[color:var(--ink-fg)]`
                      }`}
                    >
                      {h.text}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
