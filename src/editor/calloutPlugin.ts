import { $prose } from '@milkdown/utils'
import { Plugin } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import type { Node as PMNode } from '@milkdown/prose/model'

/**
 * GitHub-flavored Markdown callout / alert 识别 + 样式化。
 *
 * 语法（和 GitHub 一致）：
 *   > [!NOTE]
 *   > 内容
 *
 *   > [!TIP]
 *   > 内容...
 *
 * 5 种类型：NOTE / TIP / IMPORTANT / WARNING / CAUTION。
 *
 * 实现：只加 Decoration.node（加 class），不改 doc。首行 `[!NOTE]` 文字
 * 仍保留在 DOM 里，CSS 把它排版成 label（小字 + accent 色 + 图标前缀）。
 *
 * 不做 widget 覆盖首行——WKWebView 对 contentEditable 内 widget 敏感，
 * 有 phantom BR 风险（参见 hardbreakCleaner.ts 注释）。
 */

const CALLOUT_REGEX = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i

type CalloutType = 'note' | 'tip' | 'important' | 'warning' | 'caution'

function detectCalloutType(blockquote: PMNode): CalloutType | null {
  if (blockquote.childCount === 0) return null
  const first = blockquote.firstChild
  if (!first || first.type.name !== 'paragraph') return null
  const firstLine = (first.textContent ?? '').split('\n')[0]
  const m = firstLine.match(CALLOUT_REGEX)
  if (!m) return null
  return m[1].toLowerCase() as CalloutType
}

export const inkCalloutPlugin = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state) {
          const decos: Decoration[] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'blockquote') return
            const type = detectCalloutType(node)
            if (!type) return
            decos.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: `ink-callout ink-callout-${type}`,
              }),
            )
          })
          if (!decos.length) return null
          return DecorationSet.create(state.doc, decos)
        },
      },
    }),
)
