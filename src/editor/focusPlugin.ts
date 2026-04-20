import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey, type EditorState } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import type { Node as PMNode } from '@milkdown/prose/model'

/**
 * Focus Mode · 按「小节」粒度高亮——一个 heading + 它下面的内容（到下一个
 * 同级或更高级 heading 之前）作为阅读单元。
 *
 * 为什么不是单顶层块：只高亮 heading 一行太小，只高亮 paragraph 一段也常
 * 常切开用户正在读的上下文（比如 heading + 首段该一起亮）。section 粒度
 * 更贴合阅读意图。
 *
 * 算法：
 * 1. 找 cursor 所在的顶层块 idx
 * 2. 向前找最近的 heading idx（或无 = 无 heading 包围）
 * 3. 如果有 heading，向后找下一个 level ≤ 当前的 heading，作为 section 末
 *    （或到文档末尾）
 * 4. 无 heading 包围时 fallback 到单顶层块
 * 5. 对 section 内每个顶层块加 Decoration.node(.ink-focus-current)
 *
 * 切换由外部 meta 触发（见 Editor.tsx.setFocusMode）。host 级 .ink-focus-mode
 * class 在 containerRef 上，配合 CSS 让非 current 块 dim。
 */

export const focusPluginKey = new PluginKey<{ enabled: boolean }>('ink-focus')

function findFocusSection(
  state: EditorState,
): { pos: number; size: number }[] | null {
  const { from } = state.selection

  // 拍平顶层 children · (pos, node)
  const tops: Array<{ pos: number; node: PMNode }> = []
  let offset = 0
  state.doc.forEach((child) => {
    tops.push({ pos: offset, node: child })
    offset += child.nodeSize
  })
  if (!tops.length) return null

  // cursor 所在的顶层块
  let currentIdx = -1
  for (let i = 0; i < tops.length; i++) {
    const { pos, node } = tops[i]
    if (from >= pos && from <= pos + node.nodeSize) {
      currentIdx = i
      break
    }
  }
  if (currentIdx < 0) currentIdx = tops.length - 1

  // 向前找 section 起始 heading
  let sectionStart = currentIdx
  let sectionLevel: number | null = null
  for (let i = currentIdx; i >= 0; i--) {
    const n = tops[i].node
    if (n.type.name === 'heading') {
      sectionStart = i
      sectionLevel = (n.attrs.level as number) ?? 1
      break
    }
  }

  // 找不到前导 heading → 单顶层块
  if (sectionLevel === null) {
    const cur = tops[currentIdx]
    return [{ pos: cur.pos, size: cur.node.nodeSize }]
  }

  // 向后找 section 结束（下一个 level <= sectionLevel 的 heading 前）
  let sectionEnd = tops.length - 1
  for (let i = sectionStart + 1; i < tops.length; i++) {
    const n = tops[i].node
    if (
      n.type.name === 'heading' &&
      ((n.attrs.level as number) ?? 1) <= sectionLevel
    ) {
      sectionEnd = i - 1
      break
    }
  }

  const out: { pos: number; size: number }[] = []
  for (let i = sectionStart; i <= sectionEnd; i++) {
    out.push({ pos: tops[i].pos, size: tops[i].node.nodeSize })
  }
  return out
}

export const inkFocusPlugin = $prose(
  () =>
    new Plugin<{ enabled: boolean }>({
      key: focusPluginKey,
      state: {
        init: () => ({ enabled: false }),
        apply(tr, prev) {
          const meta = tr.getMeta(focusPluginKey) as
            | { enabled: boolean }
            | undefined
          if (meta && typeof meta.enabled === 'boolean') {
            return { enabled: meta.enabled }
          }
          return prev
        },
      },
      props: {
        decorations(state) {
          const s = focusPluginKey.getState(state)
          if (!s?.enabled) return null
          const ranges = findFocusSection(state)
          if (!ranges || !ranges.length) return null
          const decos = ranges.map((r) =>
            Decoration.node(r.pos, r.pos + r.size, {
              class: 'ink-focus-current',
            }),
          )
          return DecorationSet.create(state.doc, decos)
        },
      },
    }),
)
