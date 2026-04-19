import { invoke } from '@tauri-apps/api/core'
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { useWorkspace, joinFrontmatter } from '../store/workspace'
import { pushRecent, removeRecent } from '../store/recents'
import { toast } from '../store/toasts'
import { statusInfo } from '../store/statusInfo'

const basename = (p: string) => p.split('/').pop() || p

/** 从文档内容推导默认文件名：取第一行前 20 字，剥 md 符号 + 不合法字符。
 *  没内容时 fallback 到 "未命名"。*/
function deriveFilename(content: string): string {
  const firstLine = content.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const stripped = firstLine.replace(/^[\s#>*\-`[\]()]+/, '').trim()
  const safe = stripped
    .replace(/[/\\:*?"<>|]/g, '')
    .slice(0, 20)
    .trim()
  return safe || '未命名'
}

/**
 * File operations — 打开 / 保存 / 另存为。
 * 基于 Rust 的 read_file / write_file 命令（不走 plugin-fs）。
 */

export function useFile() {
  const openTab = useWorkspace((s) => s.openTab)
  const markSaved = useWorkspace((s) => s.markSaved)
  const panes = useWorkspace((s) => s.panes)

  /** 弹窗选文件打开 */
  const openFileDialog = async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [
        {
          name: 'Markdown',
          extensions: ['md', 'markdown', 'mdx'],
        },
      ],
    })
    // Tauri v2: single-select 返回 `string | null`
    if (!selected || typeof selected !== 'string') return
    await openPath(selected)
  }

  /** 直接按路径打开。silent=true 不弹 toast（用在 session restore） */
  const openPath = async (path: string, silent = false) => {
    try {
      const content = await invoke<string>('read_file', { path })
      openTab(path, content)
      pushRecent(path)
    } catch (e) {
      console.error('Failed to open', path, e)
      if (silent) {
        // session/recents 里的文件可能已删/移动——静默清理 recent
        removeRecent(path)
      } else {
        toast.error(`打不开 ${basename(path)}：${String(e)}`)
      }
    }
  }

  /** 保存当前 tab（走原路径 or 触发 save dialog）*/
  const saveTab = async (tabId: string) => {
    const tab = panes.flatMap((p) => p.tabs).find((t) => t.id === tabId)
    if (!tab) return
    let targetPath = tab.path
    if (!targetPath) {
      // Untitled → 用文档前几个字当默认文件名（"Untitled" 太机器，文档开头更人性）
      const defaultName = deriveFilename(tab.content) + '.md'
      const chosen = await saveDialog({
        defaultPath: defaultName,
        filters: [
          {
            name: 'Markdown',
            extensions: ['md', 'markdown'],
          },
        ],
      })
      if (!chosen) return
      targetPath = chosen
    }
    // 写回时把 frontmatter 重新 prepend
    const finalContent = joinFrontmatter(tab.frontmatter, tab.content)
    try {
      await invoke('write_file', { path: targetPath, content: finalContent })
      markSaved(tabId, targetPath)
      statusInfo.info(`已保存：${basename(targetPath)}`, { path: targetPath })
    } catch (e) {
      console.error('Failed to save', targetPath, e)
      toast.error(`保存失败：${String(e)}`)
    }
  }

  return { openFileDialog, openPath, saveTab }
}
