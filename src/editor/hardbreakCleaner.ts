import { $prose } from '@milkdown/utils'
import { Plugin } from '@milkdown/prose/state'

/**
 * 清理 WebKit contentEditable "phantom BR" 污染 doc 的 trailing hardbreak。
 *
 * 根因（社区确认的已知问题）：
 * - WKWebView（Tauri 用的 webview）在 contentEditable 内会自动往空行/行末
 *   插入 <br> 作为"光标占位符"（著名的 WebKit phantom BR）。
 * - Milkdown commonmark 的 hardbreak schema 定义了 parseDOM: [{ tag: "br" }]
 *   —— 任何 <br> 都被 DOMObserver 解析成 hardbreak node 塞进 doc。
 * - 用户正常打字时 doc 里累积 phantom hardbreak。保存时 Milkdown serialize
 *   每个 hardbreak 为 "\\\n"，导致磁盘文件末尾多一串 "\\\n\\\n..."，
 *   重新打开时可见 "\" 字符。
 *
 * 修法：每次 transaction 后扫描 doc，对每个 textblock 保留最多 1 个
 * trailing hardbreak（Milkdown 的 serializeText 会自动剥掉最后 1 个——
 * 保 1 个让"用户打的 trailing hardbreak 意图"不被吞）。多余的删掉。
 *
 * 只删 trailing——中间的 hardbreak（用户显式 Shift+Enter 插的硬换行）保留。
 *
 * ProseMirror 官方博客 / changelog 提到 clipboard parser 里已对此做了
 * 过滤（"ignore trailing BR nodes that look like they might be there as a
 * contenteditable kludge"）——但那只在 paste 时有效。DOMObserver 的
 * 日常 sync 需要这层 cleaner 兜底。
 */
export const inkHardbreakCleaner = $prose(
  () =>
    new Plugin({
      appendTransaction(trs, _oldState, newState) {
        if (!trs.some((t) => t.docChanged)) return null

        const toRemove: Array<{ from: number; to: number }> = []
        newState.doc.descendants((node, pos) => {
          if (!node.isTextblock) return
          // 数尾部连续 hardbreak
          let trailing = 0
          for (let i = node.childCount - 1; i >= 0; i--) {
            if (node.child(i).type.name === 'hardbreak') trailing++
            else break
          }
          if (trailing > 1) {
            const end = pos + 1 + node.content.size
            const from = end - (trailing - 1)
            toRemove.push({ from, to: end })
          }
        })

        if (!toRemove.length) return null

        const tr = newState.tr
        // 逆序 delete 避免 position shift
        toRemove.sort((a, b) => b.from - a.from)
        for (const r of toRemove) tr.delete(r.from, r.to)
        return tr
      },
    }),
)
