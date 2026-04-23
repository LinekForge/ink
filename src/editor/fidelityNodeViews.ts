import katex from 'katex'
import { codeBlockSchema } from '@milkdown/preset-commonmark'
import { mathBlockSchema, mathInlineSchema } from '@milkdown/plugin-math'
import { $view } from '@milkdown/utils'
import type { Node as PMNode } from '@milkdown/prose/model'
import { TextSelection } from '@milkdown/prose/state'
import type {
  EditorView,
  NodeView,
} from '@milkdown/prose/view'
import {
  buildMermaidConfig,
  getResolvedInkTheme,
  normalizeRenderError,
  readInkPalette,
} from '../lib/fidelity'

type MermaidApi = (typeof import('mermaid'))['default']

let mermaidQueue: Promise<void> = Promise.resolve()
let mermaidModule: MermaidApi | null = null
let mermaidModulePromise: Promise<MermaidApi> | null = null

function queueMermaidRender<T>(task: () => Promise<T>): Promise<T> {
  const run = mermaidQueue.then(task, task)
  mermaidQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function hasLoadedMermaid(): boolean {
  return mermaidModule !== null
}

async function loadMermaid(): Promise<MermaidApi> {
  if (mermaidModule) return mermaidModule
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid')
      .then((mod) => {
        mermaidModule = mod.default
        return mermaidModule
      })
      .catch((error) => {
        mermaidModulePromise = null
        throw error
      })
  }
  return mermaidModulePromise
}

function renderMathPreview(
  target: HTMLElement,
  source: string,
  displayMode: boolean,
): void {
  target.innerHTML = ''
  target.classList.remove('ink-fidelity-fallback')
  try {
    target.innerHTML = katex.renderToString(source, {
      displayMode,
      throwOnError: true,
      strict: 'warn',
    })
  } catch (error) {
    target.replaceChildren(
      createFallbackDom(
        displayMode ? 'LaTeX 渲染失败' : '行内公式渲染失败',
        source,
        normalizeRenderError(error),
      ),
    )
    target.classList.add('ink-fidelity-fallback')
  }
}

async function renderMermaidPreview(
  target: HTMLElement,
  source: string,
  identity: string,
  renderToken: number,
  getToken: () => number,
): Promise<void> {
  target.classList.remove('ink-fidelity-fallback')
  if (!hasLoadedMermaid()) {
    target.replaceChildren(
      createLoadingDom('正在加载 Mermaid…', '首次遇到图表时按需载入'),
    )
  }
  try {
    const theme = getResolvedInkTheme()
    const palette = readInkPalette()
    const fontFamily =
      getComputedStyle(document.body).fontFamily || 'ui-serif, serif'
    const mermaid = await loadMermaid()

    const result = await Promise.race([
      queueMermaidRender(async () => {
        mermaid.initialize(buildMermaidConfig(theme, palette, fontFamily))
        return mermaid.render(`${identity}-${renderToken}`, source)
      }),
      new Promise<never>((_, reject) => {
        window.setTimeout(() => {
          reject(new Error('Mermaid render timeout'))
        }, 5000)
      }),
    ])
    if (renderToken !== getToken()) return
    const { svg, bindFunctions } = result
    target.innerHTML = svg
    bindFunctions?.(target)
  } catch (error) {
    if (renderToken !== getToken()) return
    target.replaceChildren(
      createFallbackDom(
        'Mermaid 渲染失败',
        source,
        normalizeRenderError(error),
      ),
    )
    target.classList.add('ink-fidelity-fallback')
  }
}

function createFallbackDom(
  title: string,
  source: string,
  message: string,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ink-fidelity-error'

  const heading = document.createElement('div')
  heading.className = 'ink-fidelity-error-title'
  heading.textContent = title

  const detail = document.createElement('div')
  detail.className = 'ink-fidelity-error-detail'
  detail.textContent = message

  const pre = document.createElement('pre')
  pre.className = 'ink-fidelity-error-source'
  pre.textContent = source

  wrap.append(heading, detail, pre)
  return wrap
}

function createLoadingDom(title: string, detailText: string): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ink-fidelity-loading'

  const heading = document.createElement('div')
  heading.className = 'ink-fidelity-loading-title'
  heading.textContent = title

  const detail = document.createElement('div')
  detail.className = 'ink-fidelity-loading-detail'
  detail.textContent = detailText

  const bar = document.createElement('div')
  bar.className = 'ink-fidelity-loading-bar'

  wrap.append(heading, detail, bar)
  return wrap
}

function setBlockNodeValue(
  view: EditorView,
  getPos: () => number | undefined,
  node: PMNode,
  value: string,
): void {
  const pos = getPos()
  if (typeof pos !== 'number') return
  if (value === String(node.attrs.value ?? '')) return
  view.dispatch(
    view.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      value,
    }),
  )
}

function replaceInlineMathValue(
  view: EditorView,
  getPos: () => number | undefined,
  node: PMNode,
  value: string,
): void {
  const pos = getPos()
  if (typeof pos !== 'number') return
  if (value === node.textContent) return
  const content = value ? view.state.schema.text(value) : undefined
  const next = node.type.create(node.attrs, content)
  view.dispatch(view.state.tr.replaceWith(pos, pos + node.nodeSize, next))
}

function focusSoon(el: HTMLElement): void {
  window.setTimeout(() => {
    el.focus()
    if ('select' in el && typeof el.select === 'function') el.select()
  }, 0)
}

function exitOnBlur(dom: HTMLElement, onExit: () => void): void {
  window.setTimeout(() => {
    if (!dom.contains(document.activeElement)) onExit()
  }, 0)
}

function createMathInlineNodeView(
  node: PMNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  let currentNode = node

  const dom = document.createElement('span')
  dom.className = 'ink-fidelity-inline'

  const preview = document.createElement('span')
  preview.className = 'ink-fidelity-inline-preview'
  preview.tabIndex = 0

  const editor = document.createElement('span')
  editor.className = 'ink-fidelity-inline-editor'
  editor.hidden = true

  const prefix = document.createElement('span')
  prefix.className = 'ink-fidelity-inline-mark'
  prefix.textContent = '$'

  const input = document.createElement('input')
  input.className = 'ink-fidelity-inline-input'
  input.type = 'text'
  input.spellcheck = false

  const suffix = document.createElement('span')
  suffix.className = 'ink-fidelity-inline-mark'
  suffix.textContent = '$'

  editor.append(prefix, input, suffix)
  dom.append(preview, editor)

  const valueOf = (n: PMNode) => n.textContent

  const sync = () => {
    const value = valueOf(currentNode)
    if (document.activeElement !== input) input.value = value
    renderMathPreview(preview, value || '\\;', false)
  }

  const setEditing = (next: boolean) => {
    dom.classList.toggle('is-editing', next)
    preview.hidden = next
    editor.hidden = !next
    if (next) focusSoon(input)
  }

  preview.addEventListener('mousedown', (event) => {
    event.preventDefault()
    setEditing(true)
  })
  preview.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setEditing(true)
  })
  input.addEventListener('input', () => {
    replaceInlineMathValue(view, getPos, currentNode, input.value)
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(false)
      preview.focus()
    }
  })
  input.addEventListener('blur', () => {
    exitOnBlur(dom, () => setEditing(false))
  })

  sync()

  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      sync()
      return true
    },
    selectNode() {
      dom.classList.add('ProseMirror-selectednode')
    },
    deselectNode() {
      dom.classList.remove('ProseMirror-selectednode')
    },
    stopEvent(event) {
      const target = event.target
      return target instanceof Node && dom.contains(target)
    },
    ignoreMutation() {
      return true
    },
  }
}

function createMathBlockNodeView(
  node: PMNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  let currentNode = node

  const dom = document.createElement('div')
  dom.className = 'ink-fidelity-block ink-fidelity-math-block'

  const preview = document.createElement('div')
  preview.className = 'ink-fidelity-preview ink-fidelity-math-preview'
  preview.tabIndex = 0

  const editor = document.createElement('div')
  editor.className = 'ink-fidelity-editor'
  editor.hidden = true

  const label = document.createElement('div')
  label.className = 'ink-fidelity-label'
  label.textContent = 'LaTeX'

  const textarea = document.createElement('textarea')
  textarea.className = 'ink-fidelity-textarea'
  textarea.rows = 4
  textarea.spellcheck = false

  const live = document.createElement('div')
  live.className = 'ink-fidelity-live ink-fidelity-math-preview'

  editor.append(label, textarea, live)
  dom.append(preview, editor)

  const valueOf = (n: PMNode) => String(n.attrs.value ?? '')

  const sync = () => {
    const value = valueOf(currentNode)
    if (document.activeElement !== textarea) textarea.value = value
    renderMathPreview(preview, value || '\\;', true)
    renderMathPreview(live, textarea.value || value || '\\;', true)
  }

  const setEditing = (next: boolean) => {
    dom.classList.toggle('is-editing', next)
    preview.hidden = next
    editor.hidden = !next
    if (next) focusSoon(textarea)
  }

  preview.addEventListener('mousedown', (event) => {
    event.preventDefault()
    setEditing(true)
  })
  preview.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setEditing(true)
  })
  textarea.addEventListener('input', () => {
    renderMathPreview(live, textarea.value || '\\;', true)
    setBlockNodeValue(view, getPos, currentNode, textarea.value)
  })
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(false)
      preview.focus()
    }
  })
  textarea.addEventListener('blur', () => {
    exitOnBlur(dom, () => setEditing(false))
  })

  sync()

  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      currentNode = nextNode
      sync()
      return true
    },
    selectNode() {
      dom.classList.add('ProseMirror-selectednode')
    },
    deselectNode() {
      dom.classList.remove('ProseMirror-selectednode')
    },
    stopEvent(event) {
      const target = event.target
      return target instanceof Node && dom.contains(target)
    },
    ignoreMutation() {
      return true
    },
  }
}

function createMermaidNodeView(
  node: PMNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  let currentNode = node
  let renderVersion = 0
  let editing = false
  const nextRenderToken = () => {
    renderVersion += 1
    return renderVersion
  }

  const dom = document.createElement('div')
  dom.className = 'ink-fidelity-block ink-fidelity-mermaid-block'

  const preview = document.createElement('div')
  preview.className = 'ink-fidelity-preview ink-fidelity-mermaid-preview'
  preview.tabIndex = 0
  preview.contentEditable = 'false'

  const editor = document.createElement('div')
  editor.className = 'ink-fidelity-editor'
  editor.hidden = true

  const label = document.createElement('div')
  label.className = 'ink-fidelity-label'
  label.textContent = 'Mermaid'
  label.contentEditable = 'false'

  const source = document.createElement('pre')
  source.className = 'ink-fidelity-source-shell'

  const contentDOM = document.createElement('code')
  contentDOM.className = 'ink-fidelity-source-code'
  source.append(contentDOM)

  const live = document.createElement('div')
  live.className = 'ink-fidelity-live ink-fidelity-mermaid-preview'
  live.contentEditable = 'false'

  editor.append(label, source, live)
  dom.append(preview, editor)

  const themeObserver = new MutationObserver(() => {
    void sync()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })

  const valueOf = (n: PMNode) => n.textContent

  const sync = async () => {
    const value = valueOf(currentNode)
    const pos = getPos()
    const identity =
      typeof pos === 'number' ? `ink-mermaid-${pos}` : 'ink-mermaid'
    const previewToken = nextRenderToken()
    await renderMermaidPreview(
      preview,
      value,
      identity,
      previewToken,
      () => renderVersion,
    )
    if (!editing) return
    const liveToken = nextRenderToken()
    await renderMermaidPreview(
      live,
      value,
      `${identity}-live`,
      liveToken,
      () => renderVersion,
    )
  }

  const setEditing = (next: boolean) => {
    editing = next
    dom.classList.toggle('is-editing', next)
    preview.hidden = next
    editor.hidden = !next
    if (next) {
      void sync()
      window.setTimeout(() => {
        const pos = getPos()
        if (typeof pos !== 'number') return
        const anchor = Math.max(pos + 1, pos + currentNode.nodeSize - 1)
        view.dispatch(
          view.state.tr.setSelection(
            TextSelection.create(view.state.doc, anchor),
          ),
        )
        view.focus()
      }, 0)
      return
    }
    void sync()
  }

  preview.addEventListener('mousedown', (event) => {
    event.preventDefault()
    setEditing(true)
  })
  preview.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setEditing(true)
  })
  source.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setEditing(false)
      preview.focus()
    }
  })
  source.addEventListener('blur', () => {
    exitOnBlur(dom, () => setEditing(false))
  }, true)

  void sync()

  return {
    dom,
    contentDOM,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      if (String(nextNode.attrs.language ?? '') !== 'mermaid') return false
      currentNode = nextNode
      void sync()
      return true
    },
    destroy() {
      themeObserver.disconnect()
    },
    selectNode() {
      dom.classList.add('ProseMirror-selectednode')
    },
    deselectNode() {
      dom.classList.remove('ProseMirror-selectednode')
    },
    stopEvent(event) {
      const target = event.target
      if (!(target instanceof Node)) return false
      if (preview.contains(target)) return true
      if (editor.contains(target) && !source.contains(target)) return true
      return false
    },
    ignoreMutation(mutation) {
      if (mutation.type === 'selection') return false
      const target = mutation.target
      if (!(target instanceof Node)) return false
      return !source.contains(target)
    },
  }
}

function createCodeBlockNodeView(
  node: PMNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  if (String(node.attrs.language ?? '') === 'mermaid') {
    return createMermaidNodeView(node, view, getPos)
  }

  let currentNode = node
  const dom = document.createElement('pre')
  const code = document.createElement('code')
  dom.append(code)

  const syncAttrs = () => {
    const language = String(currentNode.attrs.language ?? '')
    if (language) dom.dataset.language = language
    else delete dom.dataset.language
  }

  syncAttrs()

  return {
    dom,
    contentDOM: code,
    update(nextNode) {
      if (nextNode.type !== currentNode.type) return false
      if (String(nextNode.attrs.language ?? '') === 'mermaid') return false
      currentNode = nextNode
      syncAttrs()
      return true
    },
  }
}

export const inkMathInlineView = $view(
  mathInlineSchema.node,
  () => (node, view, getPos) => createMathInlineNodeView(node, view, getPos),
)

export const inkMathBlockView = $view(
  mathBlockSchema.node,
  () => (node, view, getPos) => createMathBlockNodeView(node, view, getPos),
)

export const inkCodeBlockView = $view(
  codeBlockSchema.node,
  () => (node, view, getPos) => createCodeBlockNodeView(node, view, getPos),
)

export const inkFidelityNodeViews = [
  inkMathInlineView,
  inkMathBlockView,
  inkCodeBlockView,
].flat()
