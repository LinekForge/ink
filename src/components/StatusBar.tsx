import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { countWords } from '../lib/wordCount'
import { useExternalActivity } from '../store/externalActivity'
import {
  useStatusInfo,
  resolveEntryAbsolute,
  formatRelativeTime,
  type StatusEntry,
} from '../store/statusInfo'

type Props = {
  tabId: string
  content: string
  dirty?: boolean
}

/**
 * 编辑区底部细条。
 * 左：[ · ] = 历史 icon（有未看时 accent 色实心），点击弹 popover 看最近 50 条
 *     ✓ message = 当前回执（永不 fade，等被顶替），可点击路径 → Finder 定位
 * 右：字数 · 阅读时间 · 未保存
 */
export function StatusBar({ tabId, content, dirty }: Props) {
  const { words, minutes } = useMemo(() => countWords(content), [content])
  const current = useStatusInfo((s) => s.current)
  const history = useStatusInfo((s) => s.history)
  const unseen = useStatusInfo((s) => s.unseen)
  const markSeen = useStatusInfo((s) => s.markSeen)
  const activity = useExternalActivity((s) => s.byTabId[tabId] ?? null)

  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // 每秒重渲让相对时间刷新
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!popoverOpen && !current) return
    const t = setInterval(() => setTick((n) => n + 1), 15_000)
    return () => clearInterval(t)
  }, [popoverOpen, current])

  // 点击外部关 popover
  useEffect(() => {
    if (!popoverOpen) return
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [popoverOpen])

  const togglePopover = () => {
    setPopoverOpen((o) => {
      const next = !o
      if (next) markSeen()
      return next
    })
  }

  const clickable = current?.path != null
  const onCurrentClick = async () => {
    if (!current?.path) return
    const absolute = resolveEntryAbsolute(current)
    if (!absolute) return
    try {
      await invoke('show_in_finder', { path: absolute })
    } catch {
      /* Finder 打不开就算了 */
    }
  }

  return (
    <div className="ink-statusbar relative h-6 px-4 flex items-center justify-between gap-3 text-[11px] text-[color:var(--ink-muted)] select-none border-t border-[color:var(--ink-border)] bg-[color:var(--ink-bg)]">
      {/* ─── 左：历史 icon + 当前回执 ─── */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <button
          onClick={togglePopover}
          title={
            unseen > 0 ? `${unseen} 条未看的动作` : '打开动作历史'
          }
          aria-label="动作历史"
          className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-[color:var(--ink-border)]/50"
        >
          <span
            className={`inline-block w-2 h-2 rounded-full transition-colors ${
              unseen > 0
                ? 'bg-[color:var(--ink-accent)]'
                : 'bg-[color:var(--ink-muted)]'
            }`}
          />
        </button>

        {current && (
          <button
            onClick={onCurrentClick}
            disabled={!clickable}
            title={clickable ? '点击在 Finder 里定位' : undefined}
            className={`truncate text-left text-[color:var(--ink-fg)]/75 min-w-0 ${
              clickable
                ? 'hover:text-[color:var(--ink-accent)] hover:underline cursor-pointer'
                : 'cursor-default'
            }`}
          >
            <span
              className={`mr-1.5 ${
                current.kind === 'error'
                  ? 'text-red-500'
                  : current.kind === 'warn'
                    ? 'text-amber-500'
                    : 'text-[color:var(--ink-accent)]'
              }`}
            >
              {iconFor(current.kind)}
            </span>
            {current.message}
          </button>
        )}
      </div>

      {/* ─── 右：文档状态 ─── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {activity && activity.phase !== 'idle' && (
          <span
            title={
              activity.phase === 'active'
                ? '外部工具正在连续写入这个文件'
                : '外部连续写入刚刚停止'
            }
            className={`inline-flex items-center gap-1.5 ${
              activity.phase === 'active'
                ? 'text-emerald-600'
                : 'text-amber-600'
            }`}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                activity.phase === 'active'
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-amber-500'
              }`}
            />
            {activity.phase === 'active' ? '外部写入中' : '刚停止'}
          </span>
        )}
        {dirty && <span className="text-[color:var(--ink-accent)]">未保存</span>}
        {words > 0 ? (
          <span>
            {words.toLocaleString()} 字 · 约 {minutes} 分钟
          </span>
        ) : (
          <span className="opacity-60">空</span>
        )}
      </div>

      {/* ─── 历史 Popover ─── */}
      {popoverOpen && (
        <div
          ref={popoverRef}
          className="absolute bottom-full left-2 mb-2 w-[340px] max-w-[90vw] max-h-[60vh] overflow-y-auto bg-[color:var(--ink-bg)] border border-[color:var(--ink-border)] rounded-md shadow-xl z-40"
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-[color:var(--ink-muted)] border-b border-[color:var(--ink-border)] flex items-center justify-between">
            <span>动作历史</span>
            <span className="text-[color:var(--ink-muted)]/60 normal-case">
              最多 50 条 · 重启清空
            </span>
          </div>
          {history.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[color:var(--ink-muted)]">
              还没有动作记录
            </div>
          ) : (
            <ul className="py-1">
              {history.map((entry) => (
                <HistoryItem
                  key={entry.id}
                  entry={entry}
                  onAfterClick={() => setPopoverOpen(false)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function iconFor(kind: StatusEntry['kind']): string {
  if (kind === 'error') return '✕'
  if (kind === 'warn') return '⚠'
  return '✓'
}

function HistoryItem({
  entry,
  onAfterClick,
}: {
  entry: StatusEntry
  onAfterClick: () => void
}) {
  const clickable = entry.path != null
  const onClick = async () => {
    if (!entry.path) return
    const absolute = resolveEntryAbsolute(entry)
    if (!absolute) return
    try {
      await invoke('show_in_finder', { path: absolute })
      onAfterClick()
    } catch {
      /* ignore */
    }
  }

  const kindColor =
    entry.kind === 'error'
      ? 'text-red-500'
      : entry.kind === 'warn'
        ? 'text-amber-500'
        : 'text-[color:var(--ink-accent)]'

  return (
    <li
      className={`px-3 py-2 text-xs border-l-2 ${
        entry.passive
          ? 'border-[color:var(--ink-accent)]/60'
          : 'border-transparent'
      } ${clickable ? 'hover:bg-[color:var(--ink-border)]/30 cursor-pointer' : ''}`}
      onClick={clickable ? onClick : undefined}
      title={clickable ? '点击在 Finder 里定位' : undefined}
    >
      <div className="flex items-center gap-2">
        <span className={`${kindColor} flex-shrink-0`}>{iconFor(entry.kind)}</span>
        <span className="text-[10px] text-[color:var(--ink-muted)] flex-shrink-0">
          {formatRelativeTime(entry.at)}
        </span>
        {entry.passive && (
          <span className="text-[10px] text-[color:var(--ink-accent)] flex-shrink-0">
            · 被动
          </span>
        )}
      </div>
      <div className="mt-1 text-[color:var(--ink-fg)]/85 break-all">
        {entry.message}
      </div>
    </li>
  )
}
