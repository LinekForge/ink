import { merge } from 'node-diff3'

export type DiffMergeResult = {
  conflict: boolean
  merged: string
}

/**
 * 三路合并（行级粒度）——base 是共同祖先，ours / theirs 是双方改后的版本。
 *
 * 输入都应为 raw markdown（含 frontmatter），避免 frontmatter 分隔符格式差异
 * 造成假冲突。输出 merged 也是 raw，caller 用 splitFrontmatter 再拆。
 *
 * 无冲突：merged 包含双方的非冲突改动。
 * 有冲突：merged 含 git 风格标记：
 *   <<<<<<<
 *   ours 内容
 *   =======
 *   theirs 内容
 *   >>>>>>>
 */
export function mergeTexts(
  base: string,
  ours: string,
  theirs: string,
): DiffMergeResult {
  const r = merge(ours, base, theirs, {
    stringSeparator: /\r?\n/,
  })
  return {
    conflict: r.conflict,
    merged: r.result.join('\n'),
  }
}
