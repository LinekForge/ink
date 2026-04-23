const basename = (p: string) => p.split('/').pop() || p

export function buildExternalSyncMessage(
  title: string,
  kind: 'synced' | 'merged',
): string {
  return kind === 'synced'
    ? `${title} 外部改动已同步`
    : `${title} 外部改动已合并`
}

export function buildConflictMessage(args: {
  title: string
  sidecarPath?: string | null
  sidecarError?: string | null
}): { message: string; path?: string } {
  const { title, sidecarPath, sidecarError } = args

  if (sidecarPath) {
    return {
      message: `${title} 有冲突；当前内容已保留，外部版本已另存为 ${basename(sidecarPath)}`,
      path: sidecarPath,
    }
  }

  if (sidecarError) {
    return {
      message: `${title} 有冲突；当前内容已保留，但外部版本另存失败：${sidecarError}`,
    }
  }

  return {
    message: `${title} 有冲突；当前内容已保留。这个页签还没保存，没法另存外部版本。`,
  }
}

export function buildMissingFileMessage(args: {
  title: string
  previousPath?: string | null
  newPath?: string | null
}): { message: string; path?: string } {
  const { title, previousPath, newPath } = args

  if (newPath) {
    return {
      message: `${title} 已从原位置移走；当前页签内容还在，按 ⌘S 可存到新位置。`,
      path: newPath,
    }
  }

  return {
    message: `${title} 在原位置找不到了；当前页签内容还在，按 ⌘S 可存到新位置。`,
    path: previousPath ?? undefined,
  }
}

export function buildBackupRestoreSummary(count: number): string {
  return `已恢复 ${count} 份未保存改动；它们现在仍是未保存状态。`
}

export function buildBackupDiscardSummary(count: number): string {
  return `已丢弃 ${count} 份未保存备份。`
}
