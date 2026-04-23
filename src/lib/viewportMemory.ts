const scrollTopByTabId = new Map<string, number>()

export function readScrollTop(tabId: string): number {
  return scrollTopByTabId.get(tabId) ?? 0
}

export function rememberScrollTop(tabId: string, scrollTop: number): void {
  scrollTopByTabId.set(tabId, scrollTop)
}

export function copyScrollTop(fromTabId: string, toTabId: string): void {
  scrollTopByTabId.set(toTabId, readScrollTop(fromTabId))
}

export function forgetScrollTop(tabId: string): void {
  scrollTopByTabId.delete(tabId)
}
