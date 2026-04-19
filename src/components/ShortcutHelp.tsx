import { useEffect } from 'react'

type Props = {
  onClose: () => void
}

type Group = {
  title: string
  items: Array<[label: string, keys: string]>
}

const GROUPS: Group[] = [
  {
    title: '文件',
    items: [
      ['打开文件', '⌘O'],
      ['新建', '⌘N'],
      ['新建页签', '⌘T'],
      ['保存', '⌘S'],
      ['另存为', '⌘⇧S'],
      ['关闭页签', '⌘W'],
    ],
  },
  {
    title: '编辑',
    items: [
      ['撤销', '⌘Z'],
      ['重做', '⌘⇧Z'],
      ['剪切 / 拷贝 / 粘贴', '⌘X / ⌘C / ⌘V'],
      ['全选', '⌘A'],
      ['文档内搜索', '⌘F'],
      ['粘贴图片', '⌘V（自动存到 assets/）'],
    ],
  },
  {
    title: '视图',
    items: [
      ['分栏', '⌘\\'],
      ['大纲', '⌘⇧O'],
      ['聚焦模式', '⌘⇧L'],
      ['Zen 模式', '⌘⇧↵（再按或 ESC 退出）'],
      ['设置', '⌘,'],
      ['快捷键（这个面板）', '⌘/'],
    ],
  },
  {
    title: '页签',
    items: [
      ['下一个 / 上一个页签', '⌘⇧] / ⌘⇧['],
      ['切到第 N 个页签', '⌘1 – ⌘9'],
      ['第 9 个 = 最后一个', '⌘9'],
    ],
  },
]

/**
 * 快捷键 help 面板。⌘/ 打开，ESC / 点击背景 / ✕ 关闭。
 * 不是 Settings，纯 reference；不持久化任何状态。
 */
export function ShortcutHelp({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 bg-black/25 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="快捷键"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[90vw] max-h-[80vh] overflow-y-auto bg-[color:var(--ink-bg)] border border-[color:var(--ink-border)] rounded-lg shadow-xl px-6 py-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium text-[color:var(--ink-fg)]">
            快捷键
          </h2>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-sm flex items-center justify-center hover:bg-[color:var(--ink-border)]/50 text-[color:var(--ink-muted)] text-sm"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <div className="text-[11px] uppercase tracking-wider text-[color:var(--ink-muted)] mb-2 font-medium">
                {group.title}
              </div>
              <ul className="text-sm">
                {group.items.map(([label, keys]) => (
                  <li
                    key={label}
                    className="flex items-center justify-between gap-3 py-1"
                  >
                    <span className="text-[color:var(--ink-fg)]/85">
                      {label}
                    </span>
                    <kbd className="font-mono text-[11px] text-[color:var(--ink-muted)] bg-[color:var(--ink-border)]/40 px-1.5 py-0.5 rounded whitespace-nowrap">
                      {keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
