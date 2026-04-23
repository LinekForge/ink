import { describe, expect, it } from 'vitest'
import { buildMermaidConfig, normalizeRenderError } from '../lib/fidelity'

describe('buildMermaidConfig', () => {
  it('uses base theme variables and respects dark mode', () => {
    const config = buildMermaidConfig(
      'dark',
      {
        bg: '#111111',
        fg: '#eeeeee',
        muted: '#777777',
        border: '#333333',
        accent: '#4f9cff',
        codeBg: '#222222',
      },
      'Iowan Old Style',
    )

    expect(config.theme).toBe('base')
    expect(config.themeVariables?.darkMode).toBe(true)
    expect(config.themeVariables?.primaryTextColor).toBe('#eeeeee')
    expect(config.themeVariables?.fontFamily).toBe('Iowan Old Style')
  })
})

describe('normalizeRenderError', () => {
  it('prefers error messages when possible', () => {
    expect(normalizeRenderError(new Error('boom'))).toBe('boom')
    expect(normalizeRenderError('oops')).toBe('oops')
  })
})
