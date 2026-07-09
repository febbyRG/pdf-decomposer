import { describe, expect, it } from 'vitest'
import type { PdfElement } from '../../models/PdfElement.js'
import { mergeDropCaps } from './dropCaps.js'

function element(type: string, data: string, fontSize: number, top: number, left = 40, width = 200, height = 20): PdfElement {
  return {
    id: `${type}-${data.slice(0, 4)}-${top}`,
    pageIndex: 0,
    type,
    data,
    boundingBox: { top, left, width, height },
    attributes: { fontSize }
  }
}

describe('mergeDropCaps', () => {
  it('merges an oversized single letter into the following paragraph', () => {
    const dropCap = element('header', 'O', 48, 100, 40, 40, 48)
    const paragraph = element('paragraph', 'nce upon a time the story began.', 10, 105, 85)

    const merged = mergeDropCaps([dropCap, paragraph])
    expect(merged).toHaveLength(1)
    expect(merged[0].data).toBe('Once upon a time the story began.')
    expect(merged[0].type).toBe('paragraph')
    expect(merged[0].formattedData).toContain('<strong>O</strong>')
  })

  it('does not merge a real heading (too long / not 2x font)', () => {
    const heading = element('header', 'REAL SECTION HEADING', 18, 100)
    const paragraph = element('paragraph', 'body text follows here.', 10, 130)

    const merged = mergeDropCaps([heading, paragraph])
    expect(merged).toHaveLength(2)
  })

  it('does not merge across a large vertical distance', () => {
    const bigLetter = element('header', 'X', 48, 100, 40, 40, 48)
    const farParagraph = element('paragraph', 'unrelated text far below.', 10, 400)

    const merged = mergeDropCaps([bigLetter, farParagraph])
    expect(merged).toHaveLength(2)
  })
})
