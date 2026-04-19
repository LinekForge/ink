import { useEffect } from 'react'
import { useSettings, type Theme, type FontFamily } from '../store/settings'

type Props = {
  onClose: () => void
}

/**
 * Settings —— 模态浮层，Cmd+, 触发。
 * Esc 或点外面关闭。
 */
export function Settings({ onClose }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const s = useSettings()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[480px] max-h-[80vh] overflow-y-auto bg-[color:var(--ink-bg)] border border-[color:var(--ink-border)] rounded-lg shadow-2xl"
      >
        <div className="h-10 px-4 flex items-center justify-between border-b border-[color:var(--ink-border)]">
          <span className="text-sm text-[color:var(--ink-fg)]">设置</span>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center hover:bg-[color:var(--ink-border)] text-[color:var(--ink-muted)]"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Theme */}
          <section>
            <label className="block text-xs text-[color:var(--ink-muted)] mb-2">
              主题
            </label>
            <div className="flex gap-2">
              {(
                [
                  { v: 'system', label: '跟随系统' },
                  { v: 'light', label: '浅' },
                  { v: 'dark', label: '深' },
                  { v: 'sepia', label: '赭石' },
                ] as { v: Theme; label: string }[]
              ).map((t) => (
                <button
                  key={t.v}
                  onClick={() => s.setTheme(t.v)}
                  className={`flex-1 py-2 rounded border text-sm transition-colors ${
                    s.theme === t.v
                      ? 'border-[color:var(--ink-accent)] bg-[color:var(--ink-border)]/30 text-[color:var(--ink-fg)]'
                      : 'border-[color:var(--ink-border)] text-[color:var(--ink-muted)] hover:text-[color:var(--ink-fg)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          {/* Font family */}
          <section>
            <label className="block text-xs text-[color:var(--ink-muted)] mb-2">
              正文字体
            </label>
            <div className="flex gap-2">
              {(
                [
                  { v: 'serif', label: 'Serif 衬线', cls: 'font-serif' },
                  { v: 'sans', label: 'Sans 无衬线', cls: 'font-sans' },
                  { v: 'mono', label: 'Mono 等宽', cls: 'font-mono' },
                ] as { v: FontFamily; label: string; cls: string }[]
              ).map((f) => (
                <button
                  key={f.v}
                  onClick={() => s.setFontFamily(f.v)}
                  className={`flex-1 py-2 rounded border text-sm ${f.cls} transition-colors ${
                    s.fontFamily === f.v
                      ? 'border-[color:var(--ink-accent)] bg-[color:var(--ink-border)]/30 text-[color:var(--ink-fg)]'
                      : 'border-[color:var(--ink-border)] text-[color:var(--ink-muted)] hover:text-[color:var(--ink-fg)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </section>

          {/* Font size */}
          <section>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-[color:var(--ink-muted)]">
                字号
              </label>
              <span className="text-xs text-[color:var(--ink-fg)]">
                {s.fontSize}px
              </span>
            </div>
            <input
              type="range"
              min={13}
              max={22}
              value={s.fontSize}
              onChange={(e) => s.setFontSize(+e.target.value)}
              className="w-full accent-[color:var(--ink-accent)]"
            />
          </section>

          {/* Line height */}
          <section>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-[color:var(--ink-muted)]">
                行高
              </label>
              <span className="text-xs text-[color:var(--ink-fg)]">
                {s.lineHeight.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={1.3}
              max={2.2}
              step={0.05}
              value={s.lineHeight}
              onChange={(e) => s.setLineHeight(+e.target.value)}
              className="w-full accent-[color:var(--ink-accent)]"
            />
          </section>

          {/* Max width */}
          <section>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-[color:var(--ink-muted)]">
                正文最大宽度
              </label>
              <span className="text-xs text-[color:var(--ink-fg)]">
                {s.maxWidth}px
              </span>
            </div>
            <input
              type="range"
              min={520}
              max={1200}
              step={20}
              value={s.maxWidth}
              onChange={(e) => s.setMaxWidth(+e.target.value)}
              className="w-full accent-[color:var(--ink-accent)]"
            />
          </section>

          <div className="flex items-center justify-between pt-2 border-t border-[color:var(--ink-border)]">
            <span className="text-[11px] text-[color:var(--ink-muted)]">
              ⌘, 打开 · Esc 关闭
            </span>
            <button
              onClick={s.reset}
              className="text-xs text-[color:var(--ink-muted)] hover:text-[color:var(--ink-fg)] transition-colors"
            >
              恢复默认
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
