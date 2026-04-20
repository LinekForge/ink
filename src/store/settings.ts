import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Settings — 字体 / 主题 / 排版。localStorage 持久化（zustand/persist）。
 */

export type Theme = 'light' | 'dark' | 'sepia' | 'system'
export type FontFamily = 'sans' | 'serif' | 'mono'

type SettingsState = {
  theme: Theme
  fontFamily: FontFamily
  fontSize: number // px
  lineHeight: number
  maxWidth: number // px——正文最大宽度
  tocVisible: boolean // TOC 侧栏开关

  setTheme: (t: Theme) => void
  setFontFamily: (f: FontFamily) => void
  setFontSize: (n: number) => void
  setLineHeight: (n: number) => void
  setMaxWidth: (n: number) => void
  toggleToc: () => void
  reset: () => void
}

const defaults = {
  theme: 'system' as Theme,
  fontFamily: 'serif' as FontFamily,
  fontSize: 17,
  lineHeight: 1.75,
  maxWidth: 780,
  tocVisible: false,
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      setTheme: (theme) => set({ theme }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setFontSize: (fontSize) => set({ fontSize }),
      setLineHeight: (lineHeight) => set({ lineHeight }),
      setMaxWidth: (maxWidth) => set({ maxWidth }),
      toggleToc: () => set((s) => ({ tocVisible: !s.tocVisible })),
      reset: () => set(defaults),
    }),
    {
      name: 'ink-settings',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)

/** resolveTheme —— system 模式下返回实际要应用的 light/dark/sepia */
export function resolveTheme(theme: Theme): Exclude<Theme, 'system'> {
  if (theme !== 'system') return theme
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}
