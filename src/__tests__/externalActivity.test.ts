import { describe, expect, it } from 'vitest'
import { detectExternalActivityPhase } from '../lib/externalActivity'

describe('detectExternalActivityPhase', () => {
  it('does not mark the first isolated write as active', () => {
    expect(
      detectExternalActivityPhase({
        previousAt: null,
        now: 10_000,
        currentPhase: 'idle',
      }),
    ).toBeNull()
  })

  it('marks rapid consecutive writes as active', () => {
    expect(
      detectExternalActivityPhase({
        previousAt: 10_000,
        now: 11_200,
        currentPhase: 'idle',
      }),
    ).toBe('active')
  })

  it('keeps extending active while a burst is already in progress', () => {
    expect(
      detectExternalActivityPhase({
        previousAt: 10_000,
        now: 13_500,
        currentPhase: 'active',
      }),
    ).toBe('active')
  })

  it('can re-enter active from cooldown when new writes resume quickly', () => {
    expect(
      detectExternalActivityPhase({
        previousAt: 10_000,
        now: 11_000,
        currentPhase: 'cooldown',
      }),
    ).toBe('active')
  })
})
