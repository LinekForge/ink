import { useEffect, type RefObject } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useWorkspace } from '../store/workspace'
import { toast } from '../store/toasts'
import { statusInfo } from '../store/statusInfo'
import { type EditorHandle } from '../components/Editor'

type Deps = {
  /** 设置拖拽视觉反馈（enter/over/leave/drop）*/
  setDragOver: (v: boolean) => void
  /** openPath 的稳定 getter（通过 ref 拿最新引用） */
  openPathRef: RefObject<(path: string, silent?: boolean) => Promise<void>>
  /** 注册过的 EditorHandle 按 paneIndex 索引——拖图片需要往 active pane 编辑器里插 */
  editorHandles: RefObject<Map<number, EditorHandle>>
}

/**
 * 拖 .md / 图片 进窗口。
 * - .md / .markdown / .mdx → 打开成 tab
 * - png / jpg / gif / webp / svg / bmp → save_image_from_path 存到
 *   active tab 的 assets/ 下，insertImage 把相对路径插入 md
 *
 * listener 挂一次（deps=[]）用 cancelled flag 兜底 async cleanup race。
 * 避免 Tauri listener 累加 pitfall（每次 re-render 堆一层）。
 */
export function useDragDrop({ setDragOver, openPathRef, editorHandles }: Deps) {
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    ;(async () => {
      const webview = getCurrentWebview()
      const fn = await webview.onDragDropEvent(async (event) => {
        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          setDragOver(true)
        } else if (event.payload.type === 'leave') {
          setDragOver(false)
        } else if (event.payload.type === 'drop') {
          setDragOver(false)
          for (const p of event.payload.paths) {
            if (p.match(/\.(md|markdown|mdx)$/i)) {
              await openPathRef.current?.(p)
            } else if (p.match(/\.(png|jpe?g|gif|webp|svg|bmp)$/i)) {
              const ws = useWorkspace.getState()
              const pane = ws.panes[ws.activePaneIndex] ?? ws.panes[0]
              const tab = pane?.tabs.find((t) => t.id === pane.activeTabId)
              if (!tab) {
                toast.warn('先打开一个 md 文件再拖图片进来')
                continue
              }
              const tabDir = tab.path
                ? tab.path.slice(0, tab.path.lastIndexOf('/'))
                : null
              try {
                const mdPath = await invoke<string>('save_image_from_path', {
                  srcPath: p,
                  tabDir,
                })
                editorHandles.current
                  ?.get(ws.activePaneIndex)
                  ?.insertImage(mdPath)
                statusInfo.info(`图片已保存：${mdPath}`, {
                  path: mdPath,
                  tabDir,
                })
              } catch (e) {
                toast.error('图片保存失败：' + String(e))
              }
            }
          }
        }
      })
      if (cancelled) fn()
      else unlisten = fn
    })()
    return () => {
      cancelled = true
      if (unlisten) unlisten()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 这些都是 ref/setter，稳定 reference
  }, [])
}
