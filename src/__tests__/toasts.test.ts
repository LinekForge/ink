import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStatusInfo } from '../store/statusInfo'
import { toast, useToasts } from '../store/toasts'

describe('toast status bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useStatusInfo.getState().clear()
    useToasts.setState({ toasts: [] })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    useStatusInfo.getState().clear()
    useToasts.setState({ toasts: [] })
  })

  it('keeps warn toasts clickable from the status bar history', () => {
    toast.warn('文件已移走', { path: '/tmp/ink.md' })

    const current = useStatusInfo.getState().current
    expect(current?.kind).toBe('warn')
    expect(current?.message).toBe('文件已移走')
    expect(current?.path).toBe('/tmp/ink.md')
  })

  it('passes tabDir metadata through error toasts as well', () => {
    toast.error('图片保存失败', { path: './assets/a.png', tabDir: '/tmp' })

    const current = useStatusInfo.getState().current
    expect(current?.kind).toBe('error')
    expect(current?.path).toBe('./assets/a.png')
    expect(current?.tabDir).toBe('/tmp')
  })

  it('still auto-dismisses toast entries after the timeout', () => {
    toast.warn('稍后消失')
    expect(useToasts.getState().toasts).toHaveLength(1)

    vi.runAllTimers()

    expect(useToasts.getState().toasts).toHaveLength(0)
    expect(useStatusInfo.getState().history).toHaveLength(1)
  })
})
