import { describe, expect, it } from 'vitest'
import { parseHeadings } from '../components/TOC'

describe('parseHeadings', () => {
  it('parses normal ATX headings with line numbers', () => {
    expect(parseHeadings('# Title\n\n## Summary')).toEqual([
      { level: 1, text: 'Title', line: 1, id: 'h-0-Title' },
      { level: 2, text: 'Summary', line: 3, id: 'h-2-Summary' },
    ])
  })

  it('ignores headings inside fenced code blocks', () => {
    expect(
      parseHeadings([
        '# Title',
        '',
        '```ts',
        '## not a heading',
        '```',
        '',
        '## Real Heading',
      ].join('\n')),
    ).toEqual([
      { level: 1, text: 'Title', line: 1, id: 'h-0-Title' },
      {
        level: 2,
        text: 'Real Heading',
        line: 7,
        id: 'h-6-Real-Heading',
      },
    ])
  })

  it('strips common inline markdown markers from heading text', () => {
    expect(parseHeadings('## **Bold** `code` _tail_')).toEqual([
      {
        level: 2,
        text: 'Bold code tail',
        line: 1,
        id: 'h-0-Bold-code-tail',
      },
    ])
  })
})
