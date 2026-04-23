import type { MermaidConfig } from 'mermaid'

export type InkResolvedTheme = 'light' | 'dark' | 'sepia'

export type InkPalette = {
  bg: string
  fg: string
  muted: string
  border: string
  accent: string
  codeBg: string
}

export function normalizeRenderError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function getResolvedInkTheme(): InkResolvedTheme {
  if (typeof document === 'undefined') return 'light'
  const theme = document.documentElement.getAttribute('data-theme')
  if (theme === 'dark' || theme === 'sepia') return theme
  return 'light'
}

export function readInkPalette(): InkPalette {
  if (typeof document === 'undefined') {
    return {
      bg: '#fafafa',
      fg: '#1a1a1a',
      muted: '#8a8a8a',
      border: '#e5e5e5',
      accent: '#2563eb',
      codeBg: '#f4f4f5',
    }
  }

  const style = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback

  return {
    bg: get('--ink-bg', '#fafafa'),
    fg: get('--ink-fg', '#1a1a1a'),
    muted: get('--ink-muted', '#8a8a8a'),
    border: get('--ink-border', '#e5e5e5'),
    accent: get('--ink-accent', '#2563eb'),
    codeBg: get('--ink-code-bg', '#f4f4f5'),
  }
}

export function buildMermaidConfig(
  theme: InkResolvedTheme,
  palette: InkPalette,
  fontFamily: string,
): MermaidConfig {
  return {
    startOnLoad: false,
    theme: 'base',
    fontFamily,
    themeVariables: {
      darkMode: theme === 'dark',
      background: palette.bg,
      fontFamily,
      fontSize: '16px',
      primaryColor: palette.codeBg,
      primaryTextColor: palette.fg,
      primaryBorderColor: palette.border,
      secondaryColor: palette.codeBg,
      secondaryTextColor: palette.fg,
      secondaryBorderColor: palette.border,
      tertiaryColor: theme === 'sepia' ? palette.bg : palette.codeBg,
      tertiaryTextColor: palette.fg,
      tertiaryBorderColor: palette.border,
      lineColor: palette.muted,
      textColor: palette.fg,
      mainBkg: palette.bg,
      clusterBkg: palette.bg,
      clusterBorder: palette.border,
      nodeBkg: palette.codeBg,
      nodeBorder: palette.border,
      titleColor: palette.fg,
      edgeLabelBackground: palette.bg,
      actorBkg: palette.codeBg,
      actorBorder: palette.border,
      actorTextColor: palette.fg,
      activationBkgColor: palette.codeBg,
      activationBorderColor: palette.border,
      sequenceNumberColor: palette.fg,
      noteBkgColor: palette.codeBg,
      noteTextColor: palette.fg,
      labelBoxBkgColor: palette.bg,
      labelBoxBorderColor: palette.border,
      signalColor: palette.accent,
      signalTextColor: palette.fg,
      cScale0: palette.accent,
      cScale1: palette.codeBg,
      cScale2: palette.border,
      cScale3: palette.muted,
    },
  }
}
