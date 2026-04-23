import { describe, expect, it } from 'vitest'
import { mergeTexts } from '../lib/diff3'

describe('mergeTexts', () => {
  it('accepts theirs when ours still equals base', () => {
    const base = 'alpha\nbeta'
    const ours = 'alpha\nbeta'
    const theirs = 'alpha\ngamma'

    expect(mergeTexts(base, ours, theirs)).toEqual({
      conflict: false,
      merged: 'alpha\ngamma',
    })
  })

  it('keeps ours when theirs still equals base', () => {
    const base = 'alpha\nbeta'
    const ours = 'alpha\ngamma'
    const theirs = 'alpha\nbeta'

    expect(mergeTexts(base, ours, theirs)).toEqual({
      conflict: false,
      merged: 'alpha\ngamma',
    })
  })

  it('cleanly merges independent edits', () => {
    const base = ['# Title', '', 'alpha', 'beta', 'gamma'].join('\n')
    const ours = ['# Title', '', 'alpha ours', 'beta', 'gamma'].join('\n')
    const theirs = ['# Title', '', 'alpha', 'beta', 'gamma theirs'].join('\n')

    expect(mergeTexts(base, ours, theirs)).toEqual({
      conflict: false,
      merged: ['# Title', '', 'alpha ours', 'beta', 'gamma theirs'].join('\n'),
    })
  })

  it('reports conflicts when both sides edit the same line differently', () => {
    const result = mergeTexts('alpha\nbeta', 'alpha\nours', 'alpha\ntheirs')

    expect(result.conflict).toBe(true)
    expect(result.merged).toContain('<<<<<<<')
    expect(result.merged).toContain('ours')
    expect(result.merged).toContain('theirs')
  })
})
