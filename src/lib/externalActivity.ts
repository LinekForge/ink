export type ExternalActivityPhase = 'idle' | 'active' | 'cooldown'

export const EXTERNAL_ACTIVITY_BURST_GAP_MS = 2000
export const EXTERNAL_ACTIVITY_ACTIVE_MS = 3000
export const EXTERNAL_ACTIVITY_COOLDOWN_MS = 2000

/**
 * 连续的外部写入更像“有人正在写”，孤立的一次外部改动更像普通 reload。
 * 这里延续 ColaMD 的判断：只有连续事件才进入 active。
 */
export function detectExternalActivityPhase(args: {
  previousAt: number | null
  now: number
  currentPhase: ExternalActivityPhase
}): ExternalActivityPhase | null {
  const { previousAt, now, currentPhase } = args
  const gap = previousAt == null ? null : now - previousAt
  if (gap != null && gap > 0 && gap < EXTERNAL_ACTIVITY_BURST_GAP_MS) {
    return 'active'
  }
  if (currentPhase === 'active') return 'active'
  return null
}
