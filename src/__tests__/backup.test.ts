import { describe, expect, it } from 'vitest'
import { backupKey } from '../hooks/useBackup'

describe('backupKey', () => {
  it('uses the file path for saved tabs', () => {
    expect(backupKey({ id: 'tab-1', path: '/tmp/ink.md' })).toBe('/tmp/ink.md')
  })

  it('uses an untitled prefix for unsaved tabs', () => {
    expect(backupKey({ id: 'tab-2', path: null })).toBe('untitled:tab-2')
  })
})
