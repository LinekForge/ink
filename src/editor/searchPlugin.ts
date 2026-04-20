import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import type { Node as PMNode } from '@milkdown/prose/model'
import { useSearchStore } from '../store/searchStore'

/**
 * 文档内搜索 · ProseMirror Decoration plugin。
 *
 * Decoration 是 ProseMirror 的"视觉叠加层"——不改 doc 不改 DOM 结构，
 * 和 Milkdown view 管理不打架。所有 match 标 inline decoration（淡黄底），
 * current 那个叠加 accent class（橙底 + 黑字）。
 *
 * State 走 PluginKey，外部（SearchBar）通过 dispatch meta 修改；每次 state
 * 变化在 view spec 里同步到 zustand `useSearchStore`，SearchBar 订阅拿到
 * 实时 total / current / error，不用轮询。
 *
 * 跨 mark match：按 block 累积所有 text node 再整体 search——
 * "hel**lo** world" 搜 "hello" 能对上（拼成一串 text 再 match）。
 * 跨段落（不同 paragraph）分段 match 不拼接，符合语义。
 */

export type Match = { from: number; to: number }
export type SearchMode = { caseSensitive: boolean; regex: boolean }
export type SearchState = {
  query: string
  mode: SearchMode
  matches: Match[]
  current: number // -1 = 没有匹配
  active: boolean
  error: string | null // 正则语法错误
}

type Meta =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'set'; query: string; mode?: Partial<SearchMode> }
  | { type: 'navigate'; dir: 1 | -1 }

export const searchPluginKey = new PluginKey<SearchState>('ink-search')

const initial: SearchState = {
  query: '',
  mode: { caseSensitive: false, regex: false },
  matches: [],
  current: -1,
  active: false,
  error: null,
}

export const searchPlugin = () =>
  new Plugin<SearchState>({
    key: searchPluginKey,
    state: {
      init: () => initial,
      apply(tr, prev): SearchState {
        const meta = tr.getMeta(searchPluginKey) as Meta | undefined
        if (meta) {
          switch (meta.type) {
            case 'open':
              return { ...prev, active: true }
            case 'close':
              return { ...initial }
            case 'set': {
              const mode = { ...prev.mode, ...(meta.mode ?? {}) }
              // 去重：query 和 mode 都没变就 no-op，保住 current 不被
              // SearchBar 重复 effect 打回 0（"3/6 闪回 1/6" bug 的根因）
              const same =
                meta.query === prev.query &&
                mode.caseSensitive === prev.mode.caseSensitive &&
                mode.regex === prev.mode.regex
              if (same) return prev
              if (!meta.query) {
                return {
                  ...prev,
                  query: '',
                  mode,
                  matches: [],
                  current: -1,
                  error: null,
                }
              }
              const { matches, error } = scan(tr.doc, meta.query, mode)
              return {
                ...prev,
                query: meta.query,
                mode,
                matches,
                current: matches.length ? 0 : -1,
                error,
              }
            }
            case 'navigate': {
              if (!prev.matches.length) return prev
              const n = prev.matches.length
              const i = (((prev.current + meta.dir) % n) + n) % n
              return { ...prev, current: i }
            }
          }
        }

        if (!tr.docChanged) return prev
        if (!prev.active || !prev.query) return prev
        const { matches, error } = scan(tr.doc, prev.query, prev.mode)
        const current = matches.length
          ? Math.min(Math.max(0, prev.current), matches.length - 1)
          : -1
        return { ...prev, matches, current, error }
      },
    },
    props: {
      decorations(state) {
        const s = searchPluginKey.getState(state)
        if (!s?.active || !s.matches.length) return DecorationSet.empty
        const decos = s.matches.map((m, i) =>
          Decoration.inline(m.from, m.to, {
            class:
              i === s.current
                ? 'ink-search-hit ink-search-hit-current'
                : 'ink-search-hit',
          }),
        )
        return DecorationSet.create(state.doc, decos)
      },
    },
    view(editorView) {
      let lastState: SearchState | null = null
      let lastCurrent = -1

      const sync = (s: SearchState | null) => {
        if (s !== lastState) {
          lastState = s
          useSearchStore.getState().set(s)
        }
      }

      sync(searchPluginKey.getState(editorView.state) ?? null)

      return {
        update(view, prev) {
          const prevS = searchPluginKey.getState(prev) ?? null
          const nextS = searchPluginKey.getState(view.state) ?? null
          if (prevS !== nextS) sync(nextS)

          // current 变化 → scroll 到那个 match 的 DOM 位置
          if (
            nextS &&
            nextS.active &&
            nextS.current >= 0 &&
            nextS.current !== lastCurrent
          ) {
            const match = nextS.matches[nextS.current]
            if (match) {
              try {
                const atPos = view.domAtPos(match.from)
                const el =
                  atPos.node.nodeType === 3
                    ? atPos.node.parentElement
                    : (atPos.node as HTMLElement)
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              } catch {
                /* ignore */
              }
            }
            lastCurrent = nextS.current
          } else if (!nextS?.active) {
            lastCurrent = -1
          }
        },
        destroy() {
          useSearchStore.getState().set(null)
        },
      }
    },
  })

/** 扫描 doc 找所有 match。按 block 累积 text node 再 match，支持跨 mark 匹配。*/
function scan(
  doc: PMNode,
  query: string,
  mode: SearchMode,
): { matches: Match[]; error: string | null } {
  const out: Match[] = []
  if (!query) return { matches: out, error: null }

  let regex: RegExp
  try {
    if (mode.regex) {
      regex = new RegExp(query, mode.caseSensitive ? 'g' : 'gi')
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      regex = new RegExp(escaped, mode.caseSensitive ? 'g' : 'gi')
    }
  } catch (e) {
    return { matches: out, error: String(e).replace(/^SyntaxError:\s*/, '') }
  }

  let text = ''
  let anchor = 0

  const flush = () => {
    if (!text) return
    // matchAll 自动处理 global flag；空 match 需要防死循环
    let safety = 0
    for (const m of text.matchAll(regex)) {
      if (m[0].length === 0) {
        safety++
        if (safety > 10000) break
        continue
      }
      out.push({
        from: anchor + (m.index ?? 0),
        to: anchor + (m.index ?? 0) + m[0].length,
      })
    }
    text = ''
  }

  doc.descendants((node, pos) => {
    if (node.isText) {
      if (!text) anchor = pos
      text += node.text ?? ''
      return false
    }
    if (node.isBlock) flush()
    return true
  })
  flush()

  return { matches: out, error: null }
}
