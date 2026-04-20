import { useEffect } from 'react'

type Props = {
  title: string
  /** 可选——覆盖默认的 body 文案 */
  message?: string
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

/**
 * 未保存更改确认弹窗 —— 3 按钮：保存 / 丢弃 / 取消。
 * ⌘S 保存、⌘⌫ 丢弃、Esc 取消。
 */
export function UnsavedPrompt({
  title,
  message,
  onSave,
  onDiscard,
  onCancel,
}: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.metaKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        onSave()
      } else if (e.metaKey && e.key === 'Backspace') {
        e.preventDefault()
        onDiscard()
      }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onCancel, onDiscard, onSave])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[400px] bg-[color:var(--ink-bg)] border border-[color:var(--ink-border)] rounded-lg shadow-2xl p-6 space-y-4"
      >
        <div className="space-y-2">
          <div className="text-sm font-medium text-[color:var(--ink-fg)]">
            未保存的更改
          </div>
          <div className="text-xs text-[color:var(--ink-muted)] leading-relaxed">
            {message ?? (
              <>
                <span className="font-mono text-[color:var(--ink-fg)]/80">
                  {title}
                </span>{' '}
                有未保存的修改。要先保存吗？
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded border border-[color:var(--ink-border)] text-[color:var(--ink-muted)] hover:text-[color:var(--ink-fg)] transition-colors"
          >
            取消
            <span className="ml-1.5 opacity-60">esc</span>
          </button>
          <button
            onClick={onDiscard}
            className="px-3 py-1.5 text-xs rounded border border-red-500/40 text-red-500 hover:bg-red-500/10 transition-colors"
          >
            不保存
            <span className="ml-1.5 opacity-60">⌘⌫</span>
          </button>
          <button
            onClick={onSave}
            className="px-3 py-1.5 text-xs rounded bg-[color:var(--ink-accent)] text-white hover:opacity-90 transition-opacity"
          >
            保存
            <span className="ml-1.5 opacity-80">⌘S</span>
          </button>
        </div>
      </div>
    </div>
  )
}
