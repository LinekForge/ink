import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'

export type MergeHighlightRange = {
  from: number
  to: number
}

type MergeHighlightMeta =
  | { type: 'set'; ranges: MergeHighlightRange[] }
  | { type: 'clear' }

export const mergeHighlightPluginKey =
  new PluginKey<DecorationSet>('ink-merge-highlight')

function normalizeRanges(
  ranges: MergeHighlightRange[],
): MergeHighlightRange[] {
  const sorted = ranges
    .filter((range) => range.to > range.from)
    .sort((a, b) => a.from - b.from || a.to - b.to)

  const out: MergeHighlightRange[] = []
  for (const range of sorted) {
    const prev = out[out.length - 1]
    if (!prev || range.from > prev.to) {
      out.push({ ...range })
      continue
    }
    prev.to = Math.max(prev.to, range.to)
  }
  return out
}

export const inkMergeHighlightPlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: mergeHighlightPluginKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, prev) {
          const meta = tr.getMeta(mergeHighlightPluginKey) as
            | MergeHighlightMeta
            | undefined
          if (meta?.type === 'clear') return DecorationSet.empty
          if (meta?.type === 'set') {
            const ranges = normalizeRanges(meta.ranges)
            if (!ranges.length) return DecorationSet.empty
            const decos = ranges.map((range) =>
              Decoration.inline(range.from, range.to, {
                class: 'ink-merge-highlight',
              }),
            )
            return DecorationSet.create(tr.doc, decos)
          }
          if (tr.docChanged && prev !== DecorationSet.empty) {
            return prev.map(tr.mapping, tr.doc)
          }
          return prev
        },
      },
      props: {
        decorations(state) {
          return mergeHighlightPluginKey.getState(state) ?? DecorationSet.empty
        },
      },
    }),
)
