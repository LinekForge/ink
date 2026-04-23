import { create } from 'zustand'
import type { ExternalActivityPhase } from '../lib/externalActivity'

export type ExternalActivityEntry = {
  phase: ExternalActivityPhase
  updatedAt: number
}

type ExternalActivityState = {
  byTabId: Record<string, ExternalActivityEntry | undefined>
  setPhase: (tabId: string, phase: ExternalActivityPhase) => void
  clear: (tabId: string) => void
}

export const useExternalActivity = create<ExternalActivityState>((set) => ({
  byTabId: {},
  setPhase: (tabId, phase) =>
    set((state) => ({
      byTabId: {
        ...state.byTabId,
        [tabId]: { phase, updatedAt: Date.now() },
      },
    })),
  clear: (tabId) =>
    set((state) => {
      if (!(tabId in state.byTabId)) return state
      const next = { ...state.byTabId }
      delete next[tabId]
      return { byTabId: next }
    }),
}))

export const externalActivity = {
  setPhase: (tabId: string, phase: ExternalActivityPhase) =>
    useExternalActivity.getState().setPhase(tabId, phase),
  clear: (tabId: string) => useExternalActivity.getState().clear(tabId),
}
