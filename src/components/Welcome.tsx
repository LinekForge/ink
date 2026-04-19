import { useEffect, useState } from 'react'
import { useFile } from '../hooks/useFile'
import { useWorkspace } from '../store/workspace'
import { topRecents, type RecentFile } from '../store/recents'
import { loadSession, type SessionState } from '../store/session'

const basename = (p: string) => p.split('/').pop() || p
const folder = (p: string) => {
  const parts = p.split('/')
  parts.pop()
  return parts.slice(-2).join('/')
}

const GREETING = "To an island where we'll meet."

/**
 * 开屏 · 上下两段 + 下方双栏。
 *
 * 上半：封面（墨字 + 副标 + 引言），居中，大留白，不抢交互。
 * 下半：左"开始"（打开 / 新建 / 恢复）+ 右"最近"，双栏视觉平衡。
 * 底部：拖拽提示 absolute 落款。
 * 入场 800ms fade-in + 轻微上浮 + blur→clear。
 */
export function Welcome() {
  const { openFileDialog, openPath } = useFile()
  const newEmptyTab = useWorkspace((s) => s.newEmptyTab)
  const setActiveTab = useWorkspace((s) => s.setActiveTab)
  const [recents, setRecents] = useState<RecentFile[]>([])
  const [session, setSession] = useState<SessionState | null>(null)

  useEffect(() => {
    setRecents(topRecents(10))
    setSession(loadSession())
  }, [])

  const sessionCount = session
    ? session.panes.reduce((sum, p) => sum + p.paths.length, 0)
    : 0

  const restoreSession = async () => {
    if (!session) return
    for (let i = 0; i < session.panes.length; i++) {
      for (const path of session.panes[i].paths) {
        await openPath(path, true)
        if (i > 0) break
      }
    }
    const active0 = session.panes[0]?.activePath
    if (active0) {
      const tab = useWorkspace
        .getState()
        .panes[0]?.tabs.find((t) => t.path === active0)
      if (tab) setActiveTab(tab.id)
    }
    setSession(null)
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center select-none relative overflow-hidden px-10 py-12">
      {/* ─── 上半 · 封面 ─── */}
      <div className="ink-welcome-enter text-center mb-14">
        <h1 className="text-[9rem] leading-none font-serif text-[color:var(--ink-fg)] tracking-tight">
          墨
        </h1>
        <p className="mt-4 text-[10px] tracking-[0.5em] uppercase text-[color:var(--ink-muted)]/70 font-light">
          Ink · A Markdown Reader
        </p>
        <blockquote className="mt-7 text-sm italic text-[color:var(--ink-muted)] leading-relaxed">
          {GREETING}
        </blockquote>
      </div>

      {/* 淡墨短分隔 */}
      <div
        className="ink-welcome-enter w-8 h-px bg-[color:var(--ink-border)] mb-10"
        style={{ animationDelay: '80ms' }}
      />

      {/* ─── 下半 · 双栏 ─── */}
      <div
        className="ink-welcome-enter grid grid-cols-2 gap-x-16 w-full max-w-xl"
        style={{ animationDelay: '160ms' }}
      >
        {/* 左 · 开始 */}
        <section>
          <SectionLabel>开始</SectionLabel>
          <div className="space-y-1.5">
            <ActionButton
              onClick={openFileDialog}
              primary
              label="打开文件"
              shortcut="⌘O"
            />
            <ActionButton
              onClick={() => newEmptyTab()}
              label="新建空白"
              shortcut="⌘N"
            />
            {sessionCount > 0 && (
              <ActionButton
                onClick={restoreSession}
                subtle
                label="恢复上次会话"
                detail={`${sessionCount} 个文件`}
              />
            )}
          </div>
        </section>

        {/* 右 · 最近 */}
        <section className="min-w-0">
          <SectionLabel>最近打开</SectionLabel>
          {recents.length > 0 ? (
            <ul className="space-y-0.5 max-h-[104px] overflow-y-auto pr-1 -mr-1">
              {recents.map((r) => (
                <li key={r.path}>
                  <button
                    onClick={() => openPath(r.path)}
                    className="group w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[color:var(--ink-border)]/40 transition-colors"
                    title={r.path}
                  >
                    <div className="text-[13px] text-[color:var(--ink-fg)] truncate group-hover:text-[color:var(--ink-accent)] transition-colors">
                      {basename(r.path)}
                    </div>
                    <div className="text-[10px] text-[color:var(--ink-muted)] truncate mt-0.5">
                      {folder(r.path) || r.path}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[color:var(--ink-muted)] italic py-2 px-2.5">
              还没有打开过文件
            </p>
          )}
        </section>
      </div>

      {/* 落款 · 拖拽提示 */}
      <p
        className="ink-welcome-enter absolute bottom-5 text-[color:var(--ink-muted)]/60 text-[10px] tracking-wide"
        style={{ animationDelay: '240ms' }}
      >
        或将{' '}
        <code className="px-1.5 py-0.5 rounded bg-[color:var(--ink-code-bg)] text-[9px]">
          .md
        </code>{' '}
        文件拖进窗口
      </p>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[0.25em] text-[color:var(--ink-muted)]/70 mb-3 font-medium">
      {children}
    </div>
  )
}

type ActionButtonProps = {
  onClick: () => void
  label: string
  shortcut?: string
  detail?: string
  primary?: boolean
  subtle?: boolean
}

function ActionButton({
  onClick,
  label,
  shortcut,
  detail,
  primary,
  subtle,
}: ActionButtonProps) {
  const base =
    'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-all'
  const tone = primary
    ? 'bg-[color:var(--ink-accent)] text-white hover:opacity-90 shadow-sm'
    : subtle
      ? 'text-[color:var(--ink-muted)] hover:text-[color:var(--ink-fg)] hover:bg-[color:var(--ink-border)]/30 text-xs py-1.5'
      : 'text-[color:var(--ink-fg)] hover:bg-[color:var(--ink-border)]/40 border border-[color:var(--ink-border)]'
  return (
    <button onClick={onClick} className={`${base} ${tone}`}>
      <span>{label}</span>
      {shortcut && (
        <span
          className={`text-xs ${primary ? 'opacity-70' : 'opacity-60'}`}
        >
          {shortcut}
        </span>
      )}
      {detail && <span className="text-[10px] opacity-70">{detail}</span>}
    </button>
  )
}
