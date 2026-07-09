import { describe, expect, it } from 'vitest'
import { classifyTextTypes } from './textTypes.js'
import type { Composite } from './types.js'

let id = 0

function composite(data: string, fontSize: number): Composite {
  id += 1
  return {
    id: `t${id}`,
    data,
    boundingBox: { top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 },
    attributes: { fontSize },
    originalElements: []
  }
}

describe('classifyTextTypes', () => {
  it('classifies short large text as headings by font ratio and long text as paragraphs', () => {
    // The average font size is character-weighted: the two long fs10 bodies
    // dominate, landing the weighted average near 10.7.
    const body = 'word '.repeat(40).trim()
    const composites = [
      composite(body, 10),
      composite(body, 10),
      composite('Chapter Title', 23),  // >= 2.1x avg -> h1
      composite('Section Title', 17),  // >= 1.5x avg -> h3
      composite('Slightly Bigger', 12) // >= 1.1x avg -> h5
    ]
    classifyTextTypes(composites)

    expect(composites[0].attributes.type).toBe('paragraph')
    expect(composites[2].attributes.type).toBe('h1')
    expect(composites[3].attributes.type).toBe('h3')
    expect(composites[4].attributes.type).toBe('h5')
  })

  it('keeps long text as paragraph even at heading font size', () => {
    const longLoud = ('LOUD '.repeat(20) + 'text').trim()
    const composites = [
      composite('normal body text '.repeat(10), 10),
      composite(longLoud, 22)
    ]
    classifyTextTypes(composites)
    expect(composites[1].attributes.type).toBe('paragraph')
  })

  it('handles the empty input', () => {
    expect(classifyTextTypes([])).toEqual([])
  })
})
