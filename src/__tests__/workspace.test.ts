import { describe, expect, it } from 'vitest'
import { joinFrontmatter, splitFrontmatter } from '../store/workspace'

describe('splitFrontmatter', () => {
  it('returns the whole markdown as body when no frontmatter exists', () => {
    expect(splitFrontmatter('# Hello\n\nWorld')).toEqual({
      frontmatter: null,
      body: '# Hello\n\nWorld',
    })
  })

  it('splits yaml frontmatter from body', () => {
    expect(splitFrontmatter('---\ntitle: Ink\n---\n\n# Hello')).toEqual({
      frontmatter: 'title: Ink',
      body: '# Hello',
    })
  })

  it('supports empty body after frontmatter', () => {
    expect(splitFrontmatter('---\ntitle: Ink\n---\n')).toEqual({
      frontmatter: 'title: Ink',
      body: '',
    })
  })

  it('does not greedily consume body separators', () => {
    expect(
      splitFrontmatter('---\ntitle: Ink\n---\n\n# Hello\n\n---\n\n# World'),
    ).toEqual({
      frontmatter: 'title: Ink',
      body: '# Hello\n\n---\n\n# World',
    })
  })
})

describe('joinFrontmatter', () => {
  it('returns body unchanged when frontmatter is null', () => {
    expect(joinFrontmatter(null, '# Hello')).toBe('# Hello')
  })

  it('reassembles frontmatter and body with the expected separator', () => {
    expect(joinFrontmatter('title: Ink', '# Hello')).toBe(
      '---\ntitle: Ink\n---\n\n# Hello',
    )
  })
})
