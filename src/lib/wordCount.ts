/**
 * 中英混合的 markdown 字数统计。
 * - 中文 / 日文 / 韩文字符：每字算 1
 * - 英文：按 "单词" 算（连续字母 / 数字）
 * - 忽略 fence code block、inline code、图片、链接 URL（但保留链接文字）
 * - 阅读速率按 250 单位 / 分钟（中英通用近似）
 */

const SPEED = 250 // read units per minute

export type WordStats = {
  words: number
  minutes: number
}

export function countWords(md: string): WordStats {
  if (!md) return { words: 0, minutes: 0 }

  // 剥离 fence code block（整块代码不计字数）
  let text = md.replace(/```[\s\S]*?```/g, ' ').replace(/~~~[\s\S]*?~~~/g, ' ')
  // 剥离 inline code
  text = text.replace(/`[^`\n]+`/g, ' ')
  // 图片 ![alt](url) 不计；但 alt 保留
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  // 链接 [text](url) 保留 text
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // Markdown 符号
  text = text.replace(/[#>*_~`|]/g, ' ')

  // CJK 字符（中日韩统一表意）
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff]/g)
  // 英文 / 数字单词
  const en = text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff]/g, ' ')
    .match(/[A-Za-z0-9]+/g)

  const words = (cjk?.length ?? 0) + (en?.length ?? 0)
  const minutes = words === 0 ? 0 : Math.max(1, Math.round(words / SPEED))
  return { words, minutes }
}
