export type TocHeadingLike = {
  id: string
  text: string
}

export const tocHeadingSelector =
  '.ProseMirror h1,.ProseMirror h2,.ProseMirror h3,.ProseMirror h4,.ProseMirror h5,.ProseMirror h6'

export function normalizeHeadingText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function resolveHeadingIndex<T extends TocHeadingLike>(
  headings: T[],
  heading: TocHeadingLike,
  originalIndex: number,
): number {
  const resolvedIndex = headings.findIndex((item) => item.id === heading.id)
  return resolvedIndex >= 0 ? resolvedIndex : originalIndex
}

export function resolveHeadingOccurrence<T extends TocHeadingLike>(
  headings: T[],
  headingIndex: number,
  targetText: string,
): number {
  const target = normalizeHeadingText(targetText)
  return headings
    .slice(0, headingIndex + 1)
    .filter((heading) => normalizeHeadingText(heading.text) === target).length
}

export function pickHeadingElement(
  elements: Element[],
  targetText: string,
  headingIndex: number,
  duplicateIndex: number,
): Element | null {
  const target = normalizeHeadingText(targetText)
  const direct = elements[headingIndex]
  if (direct && normalizeHeadingText(direct.textContent ?? '') === target) {
    return direct
  }

  let seen = 0
  for (const el of elements) {
    if (normalizeHeadingText(el.textContent ?? '') !== target) continue
    seen += 1
    if (seen === duplicateIndex) return el
  }
  return null
}
