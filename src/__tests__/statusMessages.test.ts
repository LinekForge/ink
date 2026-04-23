import { describe, expect, it } from 'vitest'
import {
  buildBackupDiscardSummary,
  buildBackupRestoreSummary,
  buildConflictMessage,
  buildExternalSyncMessage,
  buildMissingFileMessage,
} from '../lib/statusMessages'

describe('statusMessages', () => {
  it('uses calm sync wording for passive external updates', () => {
    expect(buildExternalSyncMessage('日报.md', 'synced')).toBe(
      '日报.md 外部改动已同步',
    )
    expect(buildExternalSyncMessage('日报.md', 'merged')).toBe(
      '日报.md 外部改动已合并',
    )
  })

  it('explains conflict sidecars without exposing internal jargon', () => {
    expect(
      buildConflictMessage({
        title: '日报.md',
        sidecarPath: '/tmp/日报.conflict-20260423.md',
      }),
    ).toEqual({
      message: '日报.md 有冲突；当前内容已保留，外部版本已另存为 日报.conflict-20260423.md',
      path: '/tmp/日报.conflict-20260423.md',
    })

    expect(
      buildConflictMessage({
        title: '日报.md',
      }).message,
    ).toBe(
      '日报.md 有冲突；当前内容已保留。这个页签还没保存，没法另存外部版本。',
    )
  })

  it('makes missing-file next steps explicit', () => {
    expect(
      buildMissingFileMessage({
        title: '日报.md',
        previousPath: '/tmp/日报.md',
        newPath: '/tmp/archive/日报.md',
      }),
    ).toEqual({
      message: '日报.md 已从原位置移走；当前页签内容还在，按 ⌘S 可存到新位置。',
      path: '/tmp/archive/日报.md',
    })

    expect(
      buildMissingFileMessage({
        title: '日报.md',
        previousPath: '/tmp/日报.md',
      }),
    ).toEqual({
      message: '日报.md 在原位置找不到了；当前页签内容还在，按 ⌘S 可存到新位置。',
      path: '/tmp/日报.md',
    })
  })

  it('summarizes backup recovery actions in product language', () => {
    expect(buildBackupRestoreSummary(2)).toBe(
      '已恢复 2 份未保存改动；它们现在仍是未保存状态。',
    )
    expect(buildBackupDiscardSummary(1)).toBe('已丢弃 1 份未保存备份。')
  })
})
