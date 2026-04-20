import { useToasts } from '../store/toasts'

/** 右下角 toast 列表，自动消失（7s，见 store/toasts.ts AUTO_DISMISS_MS）。 */
export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`ink-toast-enter pointer-events-auto cursor-pointer px-4 py-2 rounded-md shadow-lg text-xs max-w-[360px] select-none
            ${
              t.level === 'error'
                ? 'bg-red-600 text-white'
                : t.level === 'warn'
                  ? 'bg-amber-500 text-white'
                  : 'bg-[color:var(--ink-fg)] text-[color:var(--ink-bg)]'
            }`}
          title="点击关闭"
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
