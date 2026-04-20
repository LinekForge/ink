import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Editor as MilkdownEditor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  parserCtx,
} from '@milkdown/core'
// ProseMirror Node 实例——不强 type（transitive dep 不稳）。只用 .eq() runtime 方法
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm, remarkGFMPlugin } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import {
  history,
  historyProviderConfig,
  undoCommand,
  redoCommand,
} from '@milkdown/plugin-history'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { cursor } from '@milkdown/plugin-cursor'
import { clipboard } from '@milkdown/plugin-clipboard'
import { indent } from '@milkdown/plugin-indent'
import { prism } from '@milkdown/plugin-prism'
import { callCommand } from '@milkdown/utils'
import { Slice } from '@milkdown/prose/model'
import { TextSelection } from '@milkdown/prose/state'
import { closeHistory } from '@milkdown/prose/history'
import { computeDocDiff } from '../lib/milkdownDocDiff'
import { resolveImageSrc } from '../lib/imagePath'
import { toast } from '../store/toasts'
import { statusInfo } from '../store/statusInfo'
import { inkSearchPlugin } from '../editor/searchMilkdown'
import { searchPluginKey, type SearchMode } from '../editor/searchPlugin'
import { inkKeymapOverrides } from '../editor/keymapOverrides'
import { inkPlaceholderPlugin } from '../editor/placeholderPlugin'
import { inkHardbreakCleaner } from '../editor/hardbreakCleaner'
import { inkCalloutPlugin } from '../editor/calloutPlugin'
import { inkFocusPlugin, focusPluginKey } from '../editor/focusPlugin'
import { inkTaskTogglePlugin } from '../editor/taskTogglePlugin'

type Props = {
  tabId: string
  /** 文件绝对路径（Untitled tab 为 null），用于解析相对路径的图片 + 粘贴图片落盘 */
  tabPath: string | null
  initialValue: string
  /** caller 递增此 marker → Editor 把"当前 doc" 作为新的 savedDoc，dirty 重置为 false */
  savedRevision: number
  /** caller 递增此 marker → Editor 重新 mount 加载新 content（用于外部文件 reload）*/
  reloadRevision: number
  /** Mount 时 store 里 dirty 状态——true 表示 initialValue 和 disk 不一致
   *  （如 backup 恢复）· 此时 Editor 不 reset dirty，保留 store 的值 */
  initiallyDirty: boolean
  onChange: (markdown: string) => void
  /** doc 变化时 emit——基于 ProseMirror doc.eq(savedDoc) 的 ground-truth dirty */
  onDirtyChange: (dirty: boolean) => void
}

/** Imperative handle 供外部（菜单 undo/redo / 拖拽插图 / SearchBar）调用 */
export type EditorHandle = {
  undo: () => void
  redo: () => void
  insertImage: (src: string) => void
  /** 打开搜索（让 plugin active=true，decoration 开始生效） */
  searchOpen: () => void
  /** 关闭搜索（清 query 和 matches，decoration 退场） */
  searchClose: () => void
  /** 设置 query（可同时改 mode），触发 rescan */
  searchSet: (query: string, mode?: Partial<SearchMode>) => void
  /** 下一个 / 上一个 match，current 循环 */
  searchNavigate: (dir: 1 | -1) => void
  /** Focus Mode 切换 · 当前段落清晰、其他 dim */
  setFocusMode: (enabled: boolean) => void
  /** 外部三路合并结果注入 editor。
   *  - 用 Milkdown plugin-diff 的 computeDocDiff 算精细变化区
   *  - 只对变化区做 replace · 未变化区域 mapping 是 identity
   *  - 光标用 tr.mapping.map(oldPos) 天然保留（Obsidian review 点）
   *  - closeHistory 让这次 merge 成为独立 undo unit */
  applyMergedMarkdown: (md: string) => void
}

/**
 * Milkdown 编辑器包裹。
 *
 * Dirty 判断（v0.3.5）：用 ProseMirror `doc.eq(savedDoc)` 比对 doc tree 等价性。
 * savedDoc 在 mount 时初始化，savedRevision 变化时重置。
 *
 * Undo/Redo（v1.0）：菜单 Cmd+Z 走 custom menu item → 前端路由到此 handle.undo()
 * → callCommand(undoCommand.key) → Milkdown history plugin（ProseMirror-history）。
 * 不用 PredefinedMenuItem::undo（那个走 WebKit DOM undo bypass ProseMirror）。
 * newGroupDelay=100ms 让快速连续输入能拆成更细颗粒的 undo group（避免一口气删 50 字）。
 */
export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  {
    tabId,
    tabPath,
    initialValue,
    savedRevision,
    reloadRevision,
    initiallyDirty,
    onChange,
    onDirtyChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<MilkdownEditor | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ProseMirror Node transitive type 不稳
  const savedDocRef = useRef<any>(null)

  // ─── Imperative handle for menu undo/redo / 拖拽插图 / SearchBar ─────
  useImperativeHandle(
    ref,
    () => ({
      undo: () => {
        editorRef.current?.action(callCommand(undoCommand.key))
      },
      redo: () => {
        editorRef.current?.action(callCommand(redoCommand.key))
      },
      insertImage: (src: string) => {
        insertImageAtCursor(editorRef.current, src)
      },
      searchOpen: () => {
        dispatchSearchMeta(editorRef.current, { type: 'open' })
      },
      searchClose: () => {
        dispatchSearchMeta(editorRef.current, { type: 'close' })
      },
      searchSet: (query, mode) => {
        dispatchSearchMeta(editorRef.current, { type: 'set', query, mode })
      },
      searchNavigate: (dir) => {
        dispatchSearchMeta(editorRef.current, { type: 'navigate', dir })
      },
      setFocusMode: (enabled) => {
        // 1) plugin meta（让 Decoration 知道跟 cursor 高亮当前块）
        const editor = editorRef.current
        if (editor) {
          try {
            editor.action((ctx) => {
              const view = ctx.get(editorViewCtx)
              view.dispatch(
                view.state.tr.setMeta(focusPluginKey, { enabled }),
              )
            })
          } catch {
            /* ignore */
          }
        }
        // 2) host 级 class（让 CSS dim 非 current 块）
        const el = containerRef.current
        if (el) el.classList.toggle('ink-focus-mode', enabled)
      },
      applyMergedMarkdown: (md) => {
        applyMerged(editorRef.current, md)
      },
    }),
    [],
  )

  // ─── 创建 / 重建 Editor ─────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let cancelled = false

    const init = async () => {
      const editor = await MilkdownEditor.make()
        .config((ctx) => {
          ctx.set(rootCtx, el)
          ctx.set(defaultValueCtx, initialValue)

          // 细化 undo group 粒度（默认 500ms，快速输入会合成一大段）
          ctx.set(historyProviderConfig.key, { newGroupDelay: 100 })

          // GFM strict 模式：remark-gfm 默认 singleTilde=true（~text~ 也当删除线），
          // 不符合 GitHub Flavored Markdown 标准——标准只认 ~~text~~。改严格。
          // 这样打开含单个 ~ 字符的 md 文件时不会误渲染成 strike。
          ctx.set(remarkGFMPlugin.options.key, { singleTilde: false })

          // 所有 doc 变化都走这里 —— dirty 基于 doc tree 比对
          ctx.get(listenerCtx).updated((_ctx, doc) => {
            if (!savedDocRef.current) return
            const dirty = !doc.eq(savedDocRef.current)
            onDirtyChange(dirty)
          })

          // 同步 markdown content 给 store（用于保存 / 搜索 / TOC / 字数）
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onChange(markdown)
          })
        })
        .config(nord)
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(cursor)
        .use(clipboard)
        .use(indent)
        .use(prism)
        .use(inkSearchPlugin)
        .use(inkKeymapOverrides)
        .use(inkHardbreakCleaner)
        .use(inkPlaceholderPlugin)
        .use(inkCalloutPlugin)
        .use(inkFocusPlugin)
        .use(inkTaskTogglePlugin)
        .create()

      if (cancelled) {
        editor.destroy()
        return
      }
      editorRef.current = editor

      // Mount 完成——把当前 doc 作为初始 savedDoc + focus 编辑器
      // 例外：initiallyDirty=true（如 backup 恢复场景）· savedDoc 保持 null，
      // listener 的 null-guard 跳过 dirty 重算，store 的 dirty=true 得以保留。
      // 直到 markSaved (savedRevision++) 才把当前 doc 作为 savedDoc + 清 dirty。
      try {
        const doc = editor.action((ctx) => ctx.get(editorViewCtx).state.doc)
        if (initiallyDirty) {
          savedDocRef.current = null
        } else {
          savedDocRef.current = doc
          onDirtyChange(false)
        }
        // 打开文件 / 新建空白后直接能打字。用 setTimeout(100) 让 React
        // + DOM 稳定（requestAnimationFrame 太早——rendering chain 还
        // 没结束 focus 会被 unmount/remount 冲掉，"新建空白没法输入"就这）
        setTimeout(() => {
          try {
            editor.action((ctx) => ctx.get(editorViewCtx).focus())
          } catch {
            /* focus 不是关键路径，失败忽略 */
          }
        }, 100)
      } catch (e) {
        console.warn('Editor init savedDoc failed:', e)
      }
    }

    init()

    return () => {
      cancelled = true
      editorRef.current?.destroy()
      editorRef.current = null
      savedDocRef.current = null
    }
    // tabId 或 reloadRevision 变化都重建。onChange/onDirtyChange 是 parent
    // 稳定 closure，不应触发 remount；initialValue 仅用于初始挂载。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, reloadRevision])

  // ─── 外部 "已保存" signal → 更新 savedDoc，dirty 重置 ────
  useEffect(() => {
    if (!editorRef.current) return
    if (savedRevision === 0) return // 初始 mount 时 savedDoc 已在 init 里设
    try {
      const doc = editorRef.current.action((ctx) =>
        ctx.get(editorViewCtx).state.doc,
      )
      savedDocRef.current = doc
      onDirtyChange(false)
    } catch (e) {
      console.warn('Editor savedRevision update failed:', e)
    }
    // onDirtyChange 是稳定 closure，不应触发重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRevision])

  // ─── 图片路径 rewrite：`./img.png` → `asset://...` ─────
  // Milkdown 渲染后的 <img> 原样拿 md 里的 src。Tauri webview 不直接加载 file://。
  // MutationObserver 扫 img，resolveImageSrc 根据 tabPath 转 absolute + convertFileSrc。
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const rewrite = () => {
      el.querySelectorAll('img').forEach((img) => {
        if (img.dataset.inkResolved === '1') return
        const raw = img.getAttribute('src')
        if (!raw) return
        const resolved = resolveImageSrc(raw, tabPath)
        if (resolved !== raw) img.setAttribute('src', resolved)
        img.dataset.inkResolved = '1'
      })
    }

    const observer = new MutationObserver(rewrite)
    observer.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    })
    rewrite()
    return () => observer.disconnect()
  }, [tabPath])

  // ─── 粘贴图片：image/* blob → save_image → 插入 md ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onPaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue
        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) return
        const ext = item.type.split('/')[1] || 'png'
        try {
          const bytes = new Uint8Array(await blob.arrayBuffer())
          const tabDir = tabPath
            ? tabPath.slice(0, tabPath.lastIndexOf('/'))
            : null
          const path = await invoke<string>('save_image', {
            tabDir,
            bytes: Array.from(bytes),
            ext,
          })
          insertImageAtCursor(editorRef.current, path)
          statusInfo.info(`图片已保存：${path}`, { path, tabDir })
        } catch (err) {
          toast.error('图片保存失败：' + String(err))
        }
        return
      }
    }

    el.addEventListener('paste', onPaste)
    return () => el.removeEventListener('paste', onPaste)
  }, [tabPath])

  return (
    <div
      ref={containerRef}
      // min-w-0：破 flex child 默认 min-width: auto，允许按父宽收缩
      // overflow-x-hidden：显式写，阻止 CSS spec 把 overflow-x: visible
      // 自动升级成 auto（= 消除"整个 editor 出现水平滚动条"的根因）
      className="milkdown-host flex-1 min-w-0 overflow-y-auto overflow-x-hidden"
    />
  )
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 绕开 PluginKey / Meta 传递的 type 耦合（接口稳定在 searchPlugin.ts）
type SearchMetaPayload = any

/** 给 search plugin 发 meta transaction */
function dispatchSearchMeta(
  editor: MilkdownEditor | null,
  meta: SearchMetaPayload,
): void {
  if (!editor) return
  try {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      view.dispatch(view.state.tr.setMeta(searchPluginKey, meta))
    })
  } catch (e) {
    console.warn('dispatchSearchMeta failed:', e)
  }
}

/** 在当前光标位置插入一个 image node（src = resolved path）*/
function insertImageAtCursor(
  editor: MilkdownEditor | null,
  src: string,
): void {
  if (!editor) return
  try {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { state, dispatch } = view
      const imgType = state.schema.nodes.image
      if (!imgType) return
      const node = imgType.create({ src, alt: '' })
      dispatch(state.tr.replaceSelectionWith(node).scrollIntoView())
    })
  } catch (e) {
    console.warn('insertImageAtCursor failed:', e)
  }
}

/** 外部合并结果注入 editor · 只 patch 变化区 · tr.mapping 天然保留光标。
 *
 * 整篇 tr.replace(0, size, slice) 的做法会把所有旧 position 压到 0 或 size
 * 边界——光标只能靠外部"行签名"土办法恢复。改成用 computeDocDiff 算精细
 * 变化区，对每段变化做独立 ReplaceStep，未变化区的 mapping 是 identity，
 * `tr.mapping.map(oldCursor)` 就自然保留光标位置。
 *
 * 参考：Milkdown plugin-streaming/src/flush.ts 里的 flushBuffer 实现。
 */
function applyMerged(editor: MilkdownEditor | null, md: string): void {
  if (!editor) return
  try {
    editor.action((ctx) => {
      const view = ctx.get(editorViewCtx)
      const parser = ctx.get(parserCtx)
      const newDoc = parser(md)
      if (!newDoc) return

      const oldCursor = view.state.selection.head
      const changes = computeDocDiff(view.state.doc, newDoc)
      if (changes.length === 0) return // no-op

      let tr = view.state.tr
      // 倒序 apply——从尾到头改，前面的 position 不被后面的 replace 移位
      for (let i = changes.length - 1; i >= 0; i--) {
        const c = changes[i]
        tr = tr.replace(
          c.fromA,
          c.toA,
          new Slice(newDoc.slice(c.fromB, c.toB).content, 0, 0),
        )
      }

      // 把旧光标 position 透过 mapping 映射到新 doc · 未变化区 identity
      try {
        const mapped = tr.mapping.map(oldCursor)
        const clamped = Math.min(mapped, tr.doc.content.size)
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(clamped)))
      } catch {
        /* 极端情况映射失败，不恢复光标 */
      }

      // merge 成独立 undo unit —— Cmd+Z 一步撤回整段 merge
      tr = closeHistory(tr)

      view.dispatch(tr)
    })
  } catch (e) {
    console.warn('applyMerged failed:', e)
  }
}
