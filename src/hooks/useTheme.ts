import { useEffect } from 'react'
import { useSettings, resolveTheme } from '../store/settings'

/**
 * 根据 settings.theme 设置 documentElement 的 data-theme。
 * "system" 模式下还监听系统 color scheme 变化实时跟。
 */
export function useTheme() {
  const theme = useSettings((s) => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolveTheme(theme))
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () =>
      document.documentElement.setAttribute('data-theme', resolveTheme(theme))
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [theme])
}
