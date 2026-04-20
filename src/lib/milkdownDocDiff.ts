/**
 * 精细 doc diff —— 只 replace 变化区域，不整篇替换。
 *
 * 源自 Milkdown 官方 @milkdown/plugin-diff@7.20.0 的 computeDocDiff
 * (src/diff-compute.ts)。MIT, © Saul-Mirone / Milkdown contributors。
 *
 * 为什么 vendor 而不是 npm 安装：
 *   @milkdown/plugin-diff@7.20.0 发布时 dependencies 里保留了 "workspace:*"
 *   表达式，pnpm install 会报 ERR_PNPM_WORKSPACE_PKG_NOT_FOUND。这份 53 行
 *   源码只依赖 @milkdown/prose 的 changeset/model/transform 子包，本地 vendor
 *   干净。升级时对照上游 git 就行。
 */

import type { Change } from '@milkdown/prose/changeset'
import type { Node } from '@milkdown/prose/model'

import { ChangeSet } from '@milkdown/prose/changeset'
import { Slice } from '@milkdown/prose/model'
import { ReplaceStep } from '@milkdown/prose/transform'

/**
 * Custom token encoder that distinguishes leaf/atom nodes by their
 * attributes, not just their type name. This ensures that changes to
 * image-block src, math_inline value, etc. are detected by the diff.
 */
const diffEncoder = {
  encodeCharacter: (char: number) => char,
  encodeNodeStart: (node: Node) => {
    if (node.isLeaf && node.type.spec.atom) {
      // Encode atom nodes with their attributes so that attribute
      // changes are detected as differences
      return `${node.type.name}:${JSON.stringify(node.attrs, Object.keys(node.attrs).sort())}`
    }
    return node.type.name
  },
  encodeNodeEnd: (node: Node) => {
    const schema = node.type.schema
    const cache: Record<string, number> =
      (schema.cached as { changeSetIDs?: Record<string, number> })
        .changeSetIDs ??
      ((schema.cached as { changeSetIDs?: Record<string, number> }).changeSetIDs =
        Object.create(null))
    let id = cache[node.type.name]
    if (id == null)
      cache[node.type.name] = id =
        Object.keys(schema.nodes).indexOf(node.type.name) + 1
    return -id
  },
  compareTokens: (a: unknown, b: unknown) => a === b,
}

/** 计算两个 ProseMirror doc 的精细变化区。返回的 Change 列表里每一项
 *  给出 oldDoc 的 [fromA, toA] 和 newDoc 的 [fromB, toB]。未变化区域不
 *  出现在返回里——遍历 apply 时 `tr.mapping.map(oldPos)` 在 identity 区
 *  就是恒等，光标位置天然保留。*/
export function computeDocDiff(
  oldDoc: Node,
  newDoc: Node,
): readonly Change[] {
  const step = new ReplaceStep(
    0,
    oldDoc.content.size,
    new Slice(newDoc.content, 0, 0),
  )
  const changeSet = ChangeSet.create(oldDoc, undefined, diffEncoder).addSteps(
    newDoc,
    [step.getMap()],
    null,
  )
  return changeSet.changes
}
