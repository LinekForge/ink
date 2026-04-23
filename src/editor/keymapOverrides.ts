import { $prose } from '@milkdown/utils'
import { keymap } from '@milkdown/prose/keymap'

/**
 * 拦截 frontend useKeybinding 绑定的全局快捷键，阻止 ProseMirror 默认
 * 行为（把 `\` / `/` 等字符插进文档）。
 *
 * 背景：useKeybinding 即使用 capture phase 挂 window，ProseMirror 在
 * editor DOM 上的 keymap 有时仍会先消化 keydown 生成 textInput。
 * 加一层 ProseMirror 级别 keymap 返回 true（consume）确保绝对不插字符，
 * frontend 仍正常响应（window capture 在 ProseMirror keymap 之前 fire）。
 */
export const inkKeymapOverrides = $prose(() =>
  keymap({
    'Mod-\\': () => true,
    'Mod-/': () => true,
    'Mod-f': () => true,
    'Mod-,': () => true,
    'Mod-o': () => true,
    'Mod-n': () => true,
    'Mod-t': () => true,
    'Mod-p': () => true,
    'Mod-w': () => true,
    'Mod-s': () => true,
    'Mod-Shift-s': () => true,
    'Mod-Shift-Enter': () => true,
    'Mod-Shift-l': () => true,
  }),
)
