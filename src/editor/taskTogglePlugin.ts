import { $prose } from '@milkdown/utils'
import { Plugin } from '@milkdown/prose/state'
import type { Node as PMNode } from '@milkdown/prose/model'

/**
 * Task list checkbox 点击切换 · 让阅读者能直接勾掉 `- [ ]`。
 *
 * Milkdown preset-gfm 的 task list schema：list_item 多一个 `checked` attr
 * （boolean | null，null = 普通 list item）。但 toDOM 只渲染
 * `<li data-item-type="task" data-checked="...">`，**没有 input**——CSS 用
 * ::before 伪元素画 checkbox 视觉，本插件拦住点击 toggle `checked` attr。
 *
 * 从 DOM event target 向上找最近的 `li[data-item-type="task"]`，判断点击
 * 是否命中左侧 22px 的 checkbox 区域，再用 posAtDOM 拿 li 在 doc 里的位置，
 * resolve 找祖先 list_item node，setNodeMarkup 翻转 checked。
 *
 * 用 handleDOMEvents.mousedown 而不是 handleClickOn——后者传入的 node 是点击
 * 命中的最深层 node（text 节点），我们需要的是 list_item（祖先），DOM
 * 路径更直接。
 */
export const inkTaskTogglePlugin = $prose(
  () =>
    new Plugin({
      props: {
        handleDOMEvents: {
          mousedown(view, event) {
            const target = event.target as HTMLElement | null
            if (!target) return false
            const li = target.closest(
              'li[data-item-type="task"]',
            ) as HTMLElement | null
            if (!li) return false
            const rect = li.getBoundingClientRect()
            // checkbox 定位 left:0 宽 16px，给 22px 命中容差
            if (event.clientX - rect.left > 22) return false

            let pos: number
            try {
              pos = view.posAtDOM(li, 0)
            } catch {
              return false
            }
            if (pos < 0) return false

            const $pos = view.state.doc.resolve(pos)
            let liPos = -1
            let liNode: PMNode | null = null
            for (let d = $pos.depth; d >= 0; d--) {
              const n = $pos.node(d)
              if (n.type.name === 'list_item') {
                liNode = n
                liPos = $pos.before(d)
                break
              }
            }
            if (!liNode || liPos < 0) return false
            if (liNode.attrs.checked == null) return false

            view.dispatch(
              view.state.tr.setNodeMarkup(liPos, undefined, {
                ...liNode.attrs,
                checked: !liNode.attrs.checked,
              }),
            )
            event.preventDefault()
            return true
          },
        },
      },
    }),
)
