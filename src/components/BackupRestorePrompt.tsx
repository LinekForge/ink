import { useEffect } from 'react'

export type BackupEntry = {
  path: string
  content: string
  savedAt: number
}

type Props = {
  backups: BackupEntry[]
  onRestoreAll: () => void
  onDiscardAll: () => void
}

const basename = (p: string) => p.split('/').pop() || p
const labelFor = (p: string) =>
  p.startsWith('untitled:') ? '未命名草稿' : basename(p)

function formatAge(savedAt: number): string {
  const diff = Date.now() / 1000 - savedAt
  if (diff < 60) return '刚才'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return `${Math.floor(diff / 86400)} 天前`
}

/**
 * 启动时发现未保存 backup 的恢复对话框——Hot Exit 的前端入口。
 *
 * 一期简化：只"全部恢复 / 全部丢弃"两选，不做逐个勾选。
 */
export function BackupRestorePrompt({
  backups,
  onRestoreAll,
  onDiscardAll,
}: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDiscardAll()
      } else if (e.key === 'Enter' && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        onRestoreAll()
      }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onRestoreAll, onDiscardAll])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[480px] max-h-[70vh] bg-[color:var(--ink-bg)] border border-[color:var(--ink-border)] rounded-lg shadow-2xl p-6 space-y-4 flex flex-col"
      >
        <div className="space-y-1">
          <div className="text-sm font-medium text-[color:var(--ink-fg)]">
            发现 {backups.length} 份未保存的备份
          </div>
          <div className="text-xs text-[color:var(--ink-muted)] leading-relaxed">
            上次退出前，这些改动还没写回文件。恢复后会以“未保存”状态打开，你再决定要不要保存。
          </div>
        </div>

        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1">
          {backups.map((b) => (
            <div
              key={b.path}
              className="flex items-baseline justify-between gap-3 text-xs py-1.5 px-2 rounded border border-[color:var(--ink-border)]/40"
            >
              <span
                className="font-mono text-[color:var(--ink-fg)] truncate flex-1"
                title={b.path}
              >
                {labelFor(b.path)}
              </span>
              <span className="text-[10px] text-[color:var(--ink-muted)] flex-shrink-0">
                {formatAge(b.savedAt)}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onDiscardAll}
            className="px-3 py-1.5 text-xs rounded border border-red-500/40 text-red-500 hover:bg-red-500/10 transition-colors"
          >
            全部丢弃
            <span className="ml-1.5 opacity-60">esc</span>
          </button>
          <button
            onClick={onRestoreAll}
            className="px-3 py-1.5 text-xs rounded bg-[color:var(--ink-accent)] text-white hover:opacity-90 transition-opacity"
          >
            全部恢复
            <span className="ml-1.5 opacity-80">↵</span>
          </button>
        </div>
      </div>
    </div>
  )
}
