import { describe, expect, it } from 'vitest'
import {
  normalizeHeadingText,
  pickHeadingElement,
  resolveHeadingIndex,
  resolveHeadingOccurrence,
} from '../lib/tocNavigation'

describe('tocNavigation', () => {
  it('normalizes heading text like the app does', () => {
    expect(normalizeHeadingText('  Foo   Bar\tBaz  ')).toBe('Foo Bar Baz')
  })

  it('resolves duplicate headings by stable id before falling back to index', () => {
    const headings = [
      { id: 'h-0-Summary', text: 'Summary' },
      { id: 'h-1-Body', text: 'Body' },
      { id: 'h-2-Summary', text: 'Summary' },
    ]

    expect(resolveHeadingIndex(headings, headings[2], 1)).toBe(2)
    expect(resolveHeadingIndex(headings, { id: 'missing', text: 'Summary' }, 1)).toBe(
      1,
    )
  })

  it('counts duplicate occurrences up to the resolved heading index', () => {
    const headings = [
      { id: 'a', text: 'Summary' },
      { id: 'b', text: 'Body' },
      { id: 'c', text: 'Summary' },
      { id: 'd', text: 'Summary' },
    ]

    expect(resolveHeadingOccurrence(headings, 2, 'Summary')).toBe(2)
    expect(resolveHeadingOccurrence(headings, 3, 'Summary')).toBe(3)
  })

  it('picks the direct indexed heading when it matches target text', () => {
    const elements = [
      { textContent: 'Title' },
      { textContent: 'Summary' },
      { textContent: 'Body' },
      { textContent: 'Summary' },
    ] as Element[]

    expect(pickHeadingElement(elements, 'Summary', 3, 2)).toBe(elements[3])
  })

  it('falls back to duplicate occurrence matching when direct index mismatches', () => {
    const elements = [
      { textContent: 'Title' },
      { textContent: 'Summary' },
      { textContent: 'Body' },
      { textContent: 'Other' },
      { textContent: 'Summary' },
    ] as Element[]

    expect(pickHeadingElement(elements, 'Summary', 3, 2)).toBe(elements[4])
  })
})
