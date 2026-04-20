import { $prose } from '@milkdown/utils'
import { Plugin } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'

/**
 * 空文档 placeholder —— doc 只有一个空 textblock 时给它加 class
 * `ink-empty-paragraph`，CSS 用 `::before` 伪元素显示"开始写..."。
 *
 * 关键：**用 Decoration.node（加 class）而不是 Decoration.widget（插 DOM）**。
 * widget 会在 contentEditable 内注入 span，WKWebView 的 DOMObserver
 * 误判成 DOM 异常，结果 serialize 时生成多余的 hardBreak——保存文件里
 * 会多出一串 `\\\n\\\n...`（phantom BR 根因）。Decoration.node 只改
 * class 不插 DOM，DOMObserver 不察觉，serialize 干净。
 */
export const inkPlaceholderPlugin = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state) {
          const { doc } = state
          if (doc.childCount !== 1) return null
          const first = doc.firstChild
          if (!first || !first.isTextblock || first.content.size !== 0) {
            return null
          }
          const deco = Decoration.node(0, first.nodeSize, {
            class: 'ink-empty-paragraph',
          })
          return DecorationSet.create(doc, [deco])
        },
      },
    }),
)
