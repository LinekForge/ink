import { create } from 'zustand'
import type { SearchState } from '../editor/searchPlugin'

/**
 * 搜索 plugin state 的镜像——给 React（SearchBar）订阅用。
 *
 * ProseMirror plugin 的 state 不直接暴露给 React；在 searchPlugin 的 view
 * spec 里 update 时同步到这个 zustand store，SearchBar 订阅后
 * 实时拿到 total / current / error，不用轮询。
 */

type Store = {
  state: SearchState | null
  set: (s: SearchState | null) => void
}

export const useSearchStore = create<Store>((set) => ({
  state: null,
  set: (s) => set({ state: s }),
}))
