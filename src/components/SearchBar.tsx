import { type MouseEvent, useEffect, useRef, useState } from 'react'
import type { EditorHandle } from './Editor'
import { useSearchStore } from '../store/searchStore'

type Props = {
  /** 当前 active pane 的 editor handle（App.tsx 注入） */
  getHandle: () => EditorHandle | undefined
  onClose: () => void
}

/**
 * 文档内搜索 —— ProseMirror Decoration 驱动。
 *
 * 所有匹配同时高亮（淡黄底），current 叠加 accent（橙底黑字）。
 * 计数和 current 走同一份 plugin state，不会对不上。
 * 支持 case sensitive / regex toggle。输入 150ms debounce 友好中文输入法。
 */
export function SearchBar({ getHandle, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const state = useSearchStore((s) => s.state)

  // 打开即 focus + 激活 plugin
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    getHandle()?.searchOpen()
    return () => {
      getHandle()?.searchClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // query / mode 变 → debounce 150ms 发 set（中文输入法 composition 期不抖）
  // getHandle 不放 deps——它是"拿最新 handle"的 getter，每次 App render 都是新
  // reference，放 deps 会 effect 重跑 → searchSet 重发 → plugin current 闪回 0
  useEffect(() => {
    const t = window.setTimeout(() => {
      getHandle()?.searchSet(query, { caseSensitive, regex })
    }, 150)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, regex])

  const total = state?.matches.length ?? 0
  const current = state?.current ?? -1
  const error = state?.error ?? null
  const hasQuery = query.length > 0
  const noMatch = hasQuery && !error && total === 0

  const navigate = (dir: 1 | -1) => {
    if (total === 0) return
    getHandle()?.searchNavigate(dir)
  }

  const close = () => onClose()
  const keepInputFocus = (e: MouseEvent<HTMLButtonElement>) => e.preventDefault()

  return (
    <div className="absolute top-12 right-4 z-30 bg-[color:var(--ink-bg)] border border-[color:var(--ink-border)] rounded-md shadow-lg flex items-center gap-1 px-2 py-1 text-xs">
      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              navigate(e.shiftKey ? -1 : 1)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              close()
            }
          }}
          placeholder={regex ? '正则搜索' : '文档内搜索'}
          className={`w-56 pl-2 pr-16 py-1 bg-transparent outline-none ${
            error || noMatch
              ? 'text-red-500'
              : 'text-[color:var(--ink-fg)] placeholder:text-[color:var(--ink-muted)]'
          }`}
        />
        {hasQuery && (
          <span
            className={`absolute right-2 top-1/2 -translate-y-1/2 tabular-nums pointer-events-none text-[10px] ${
              error || noMatch
                ? 'text-red-500'
                : 'text-[color:var(--ink-muted)]'
            }`}
            aria-live="polite"
          >
            {error
              ? '正则错误'
              : total > 0
                ? `${current + 1} / ${total}`
                : '0 / 0'}
          </span>
        )}
      </div>

      <button
        onMouseDown={keepInputFocus}
        onClick={() => setCaseSensitive((v) => !v)}
        title={`大小写${caseSensitive ? '敏感' : '不敏感'}`}
        className={`w-6 h-6 flex items-center justify-center rounded font-mono text-[10px] transition-colors ${
          caseSensitive
            ? 'bg-[color:var(--ink-accent)]/15 text-[color:var(--ink-accent)]'
            : 'text-[color:var(--ink-muted)] hover:bg-[color:var(--ink-border)]/40'
        }`}
      >
        Aa
      </button>
      <button
        onMouseDown={keepInputFocus}
        onClick={() => setRegex((v) => !v)}
        title={regex ? '正则：开' : '正则：关'}
        className={`w-6 h-6 flex items-center justify-center rounded font-mono text-[10px] transition-colors ${
          regex
            ? 'bg-[color:var(--ink-accent)]/15 text-[color:var(--ink-accent)]'
            : 'text-[color:var(--ink-muted)] hover:bg-[color:var(--ink-border)]/40'
        }`}
      >
        .*
      </button>

      <div className="w-px h-4 bg-[color:var(--ink-border)] mx-0.5" />

      <button
        onMouseDown={keepInputFocus}
        onClick={() => navigate(-1)}
        disabled={total === 0}
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-[color:var(--ink-border)]/40 text-[color:var(--ink-muted)] disabled:opacity-40"
        title="上一个 (⇧↵)"
      >
        ↑
      </button>
      <button
        onMouseDown={keepInputFocus}
        onClick={() => navigate(1)}
        disabled={total === 0}
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-[color:var(--ink-border)]/40 text-[color:var(--ink-muted)] disabled:opacity-40"
        title="下一个 (↵)"
      >
        ↓
      </button>
      <button
        onMouseDown={keepInputFocus}
        onClick={close}
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-[color:var(--ink-border)]/40 text-[color:var(--ink-muted)]"
        title="关闭 (esc)"
      >
        ✕
      </button>
    </div>
  )
}
