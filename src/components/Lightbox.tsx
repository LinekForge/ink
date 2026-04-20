import { useEffect } from 'react'

type Props = {
  src: string
  alt?: string
  onClose: () => void
}

/**
 * 图片 Lightbox · 全屏 overlay 看大图。
 * 触发：单击编辑区 img。关闭：Esc / 点击任意位置。
 * max 90vw × 90vh，保持比例。
 */
export function Lightbox({ src, alt, onClose }: Props) {
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

  return (
    <div
      className="ink-lightbox-enter fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm cursor-zoom-out"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt || '图片预览'}
    >
      <img
        src={src}
        alt={alt ?? ''}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] object-contain select-none shadow-2xl rounded-sm cursor-default"
        draggable={false}
      />
      {alt && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 max-w-[80vw] px-3 py-1.5 rounded-md bg-black/50 text-white text-xs backdrop-blur-sm truncate"
        >
          {alt}
        </div>
      )}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center bg-black/40 hover:bg-black/70 text-white text-sm transition-colors"
        aria-label="关闭"
      >
        ✕
      </button>
    </div>
  )
}
