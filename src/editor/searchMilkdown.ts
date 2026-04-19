import { $prose } from '@milkdown/utils'
import { searchPlugin } from './searchPlugin'

/** Milkdown 插件包装——`.use(inkSearchPlugin)` 挂到 Editor 里。*/
export const inkSearchPlugin = $prose(() => searchPlugin())
