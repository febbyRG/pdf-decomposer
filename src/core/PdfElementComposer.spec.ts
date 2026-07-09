import { describe, expect, it } from 'vitest'
import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'
import { PdfElementComposer } from './PdfElementComposer.js'
import rawP28Elements from './__fixtures__/mivision-p28-raw-text-elements.json'

/**
 * The composer merges, orders, and classifies text. It must never DROP it:
 * reading order is a permutation, not a filter. These tests pin that invariant
 * after the stage-2 beam-scanning bug silently discarded whole columns
 * (mivision p28 lost its entire middle body column, corpus pages lost up to
 * 98% of their text).
 */

let elementId = 0

function textElement(data: string, left: number, top: number, width: number, height: number, fontSize: number): PdfElement {
  elementId += 1
  return {
    id: `test_${elementId}`,
    pageIndex: 0,
    type: 'text',
    data,
    boundingBox: { top, left, width, height },
    attributes: { fontSize, fontFamily: 'TestFont' }
  }
}

function page(elements: PdfElement[], width = 595, height = 842): PdfPageContent {
  return { pageIndex: 0, pageNumber: 1, width, height, title: 'test', image: '', elements }
}

function nonWhitespaceChars(elements: PdfElement[]): number {
  return elements
    .filter((el) => el.type !== 'image')
    .map((el) => String(el.data ?? ''))
    .join('')
    .replace(/\s+/g, '')
    .length
}

function joinedText(elements: PdfElement[]): string {
  return elements.map((el) => String(el.data ?? '')).join(' ')
}

describe('PdfElementComposer text preservation', () => {
  it('keeps every meaningful text run on a rail + two-body-column page (the mivision p28 class)', () => {
    // Narrow sidebar rail with many small fragments drags the average element
    // width down; before the fix, body paragraphs were then classified as
    // "spanning", the density histogram read the middle column as a gap, and
    // the whole column was dropped.
    const elements: PdfElement[] = []
    for (let i = 0; i < 6; i++) {
      elements.push(textElement(`Sidebar rail fragment number ${i} with enough characters`, 40, 100 + i * 100, 120, 60, 8))
    }
    for (let i = 0; i < 6; i++) {
      elements.push(textElement(`MIDDLE column body paragraph ${i} carrying real article text`, 197, 110 + i * 100, 165, 70, 9))
    }
    for (let i = 0; i < 6; i++) {
      elements.push(textElement(`RIGHT column body paragraph ${i} carrying real article text`, 382, 110 + i * 100, 165, 70, 9))
    }
    elements.push(textElement('AU$2 Million Campaign Headline Spanning Two Columns', 195, 60, 273, 24, 20))

    const [composed] = PdfElementComposer.composeElements([page(elements)])
    const output = joinedText(composed.elements)

    for (const input of elements) {
      expect(output).toContain(input.data)
    }
    expect(nonWhitespaceChars(composed.elements)).toBe(nonWhitespaceChars(elements))
  })

  it('keeps text whose column region is narrower than the 40pt boundary minimum', () => {
    // A sliver region between two detected gaps gets no boundary of its own;
    // its content must attach to the nearest column instead of vanishing.
    const elements: PdfElement[] = []
    for (let i = 0; i < 5; i++) {
      elements.push(textElement(`Left column paragraph ${i} with plenty of characters here`, 40, 100 + i * 90, 200, 60, 10))
      elements.push(textElement(`Right column paragraph ${i} with plenty of characters too`, 360, 100 + i * 90, 200, 60, 10))
    }
    // Narrow orphan sitting in the inter-column gap
    elements.push(textElement('gap orphan text fragment kept', 285, 300, 30, 40, 9))

    const [composed] = PdfElementComposer.composeElements([page(elements)])
    expect(joinedText(composed.elements)).toContain('gap orphan text fragment kept')
    expect(nonWhitespaceChars(composed.elements)).toBe(nonWhitespaceChars(elements))
  })

  it('keeps genuinely spanning headers and both columns beneath them', () => {
    const elements: PdfElement[] = [
      textElement('A Full Width Feature Headline Spanning The Whole Page', 60, 50, 480, 30, 24)
    ]
    for (let i = 0; i < 4; i++) {
      elements.push(textElement(`First column body text block ${i} with enough length`, 60, 120 + i * 90, 220, 60, 10))
      elements.push(textElement(`Second column body text block ${i} with enough length`, 320, 120 + i * 90, 220, 60, 10))
    }

    const [composed] = PdfElementComposer.composeElements([page(elements)])
    const output = joinedText(composed.elements)
    for (const input of elements) {
      expect(output).toContain(input.data)
    }
  })

  it('orders a clean two-column layout left column first', () => {
    const elements: PdfElement[] = []
    for (let i = 0; i < 4; i++) {
      elements.push(textElement(`LEFTCOL paragraph ${i} some sufficiently long content`, 40, 100 + i * 120, 220, 80, 10))
      elements.push(textElement(`RIGHTCOL paragraph ${i} some sufficiently long content`, 320, 100 + i * 120, 220, 80, 10))
    }

    const [composed] = PdfElementComposer.composeElements([page(elements)])
    const output = joinedText(composed.elements)
    expect(output.lastIndexOf('LEFTCOL')).toBeLessThan(output.indexOf('RIGHTCOL'))
  })

  it('leaves a single-column page complete and top-to-bottom', () => {
    const elements: PdfElement[] = []
    for (let i = 0; i < 5; i++) {
      elements.push(textElement(`Single column paragraph number ${i} with plenty of text`, 60, 100 + i * 120, 460, 80, 10))
    }
    const [composed] = PdfElementComposer.composeElements([page(elements)])
    const output = joinedText(composed.elements)
    for (let i = 0; i < 4; i++) {
      expect(output.indexOf(`number ${i} `)).toBeLessThan(output.indexOf(`number ${i + 1} `))
    }
    expect(nonWhitespaceChars(composed.elements)).toBe(nonWhitespaceChars(elements))
  })

  it('preserves the real mivision p28 page (rail + spanning headline + two body columns)', () => {
    // Raw text elements extracted from the real page that exposed the bug.
    // Before the fix the composed output lost the entire middle column
    // (5,743 -> 3,625 non-whitespace chars).
    const elements = (rawP28Elements as Array<Record<string, unknown>>).map((el, index) => ({
      id: `fixture_${index}`,
      pageIndex: 0,
      ...el
    })) as PdfElement[]

    const [composed] = PdfElementComposer.composeElements([page(elements, 595.276, 841.89)])
    const output = joinedText(composed.elements)

    // Middle column content that used to vanish
    expect(output).toContain('AU$2 Million Campaign to Train')
    expect(output).toContain('The UNSW School')
    expect(output).toContain('ALIGNING WITH HEALTH')
    expect(output).toContain('Randwick')
    expect(output).toContain('Under Prof Keay')
    // Sidebar and right column still present
    expect(output).toContain('Feedback Confirms SeeWay Approach')
    expect(output).toContain('To donate or learn more')

    // The meaningful-text filter legitimately drops empty/isolated fragments,
    // so allow a small delta versus raw, but nothing column-sized.
    const rawChars = nonWhitespaceChars(elements)
    expect(nonWhitespaceChars(composed.elements)).toBeGreaterThanOrEqual(rawChars * 0.97)
  })
})
