import { describe, expect, it } from 'vitest'
import { PdfCleanComposer } from './PdfCleanComposer.js'

/**
 * Margin filtering (isElementInContentArea): text furniture in margin bands is
 * dropped by center test, but IMAGES that overlap the content area must
 * survive regardless of size. Pinned after a real page's QR code (78x79pt,
 * bottom-right) was silently dropped at the consumer's 15% side margin, which
 * pushed the model into substituting the full-page screenshot for it.
 */

// 595x842pt page at 15% side margin / 5% top+bottom (the consumer's settings)
const contentArea = {
  top: 42.1,
  bottom: 799.8,
  left: 89.3,
  right: 505.98,
  width: 416.7,
  height: 757.7
}

type ElementInput = { type: string, boundingBox: { top: number, left: number, width: number, height: number } }

function inContentArea(element: ElementInput): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PdfCleanComposer as any).isElementInContentArea(element, contentArea)
}

describe('PdfCleanComposer.isElementInContentArea', () => {
  it('keeps a small image that overlaps the content area even when its center is in the margin band', () => {
    // The real QR case: left 473..552, center x=512 > right bound 506
    const qr = { type: 'image', boundingBox: { top: 719.8, left: 473.3, width: 78.3, height: 78.7 } }
    expect(inContentArea(qr)).toBe(true)
  })

  it('still drops a small image fully inside the margin band (decoration)', () => {
    const decoration = { type: 'image', boundingBox: { top: 300, left: 540, width: 40, height: 40 } }
    expect(inContentArea(decoration)).toBe(false)
  })

  it('still drops small text whose center is in the margin band (page furniture)', () => {
    const pageNumber = { type: 'text', boundingBox: { top: 720, left: 473.3, width: 78.3, height: 12 } }
    expect(inContentArea(pageNumber)).toBe(false)
  })

  it('keeps small text centered inside the content area', () => {
    const body = { type: 'text', boundingBox: { top: 300, left: 200, width: 160, height: 60 } }
    expect(inContentArea(body)).toBe(true)
  })

  it('keeps a large image touching the content area (full-page cover behavior unchanged)', () => {
    const cover = { type: 'image', boundingBox: { top: 0, left: 0, width: 595, height: 842 } }
    expect(inContentArea(cover)).toBe(true)
  })
})

/**
 * Numeric-label exemption (collectNumericLabelElements + cleanTextElement):
 * a stylized TOC prints entry page numbers as short isolated tokens in a
 * gutter beside each title and tags preview thumbnails with page numbers.
 * The minimum length/width floors (stray-glyph noise filters) silently
 * removed all of them (davisart p7-8). Coordinates below mirror the real
 * davisart elements.
 */
type TestElement = { type: string, data?: string, boundingBox: { top: number, left: number, width: number, height: number } }

const cleaningOptions = {
  removeControlCharacters: true,
  minTextLength: 3,
  removeIsolatedCharacters: true,
  minTextWidth: 10,
  minTextHeight: 8
}

function cleanedTexts(elements: TestElement[]): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const composer = PdfCleanComposer as any
  const labels: Set<TestElement> = composer.collectNumericLabelElements(elements, cleaningOptions)
  return elements
    .filter((element) => element.type === 'text')
    .map((element) => composer.cleanTextElement({ ...element }, cleaningOptions, labels.has(element)))
    .filter((cleaned) => cleaned !== null)
    .map((cleaned) => cleaned.data)
}

describe('PdfCleanComposer numeric-label exemption', () => {
  it('keeps a TOC gutter number beside its entry title (davisart "22 TAB from the Heart")', () => {
    const elements: TestElement[] = [
      { type: 'text', data: '22', boundingBox: { top: 96, left: 110, width: 9, height: 8 } },
      { type: 'text', data: 'TAB from the Heart', boundingBox: { top: 95, left: 139, width: 120, height: 10 } }
    ]
    expect(cleanedTexts(elements)).toContain('22')
  })

  it('keeps a page tag sitting on a preview thumbnail (davisart rail)', () => {
    const elements: TestElement[] = [
      { type: 'text', data: '17', boundingBox: { top: 72, left: 473, width: 8, height: 8 } },
      { type: 'image', data: 'x', boundingBox: { top: -40, left: 466, width: 158, height: 128 } }
    ]
    expect(cleanedTexts(elements)).toContain('17')
  })

  it('still drops a lone stray digit far from any content', () => {
    const elements: TestElement[] = [
      { type: 'text', data: '7', boundingBox: { top: 400, left: 300, width: 5, height: 8 } },
      { type: 'text', data: 'Body text far away', boundingBox: { top: 700, left: 139, width: 150, height: 10 } }
    ]
    expect(cleanedTexts(elements)).not.toContain('7')
  })

  it('still drops short non-numeric junk beside text', () => {
    const elements: TestElement[] = [
      { type: 'text', data: 'ab', boundingBox: { top: 96, left: 110, width: 9, height: 8 } },
      { type: 'text', data: 'TAB from the Heart', boundingBox: { top: 95, left: 139, width: 120, height: 10 } }
    ]
    expect(cleanedTexts(elements)).not.toContain('ab')
  })

  it('does not exempt 4+ digit numbers (years, prices keep the normal floors)', () => {
    const elements: TestElement[] = [
      { type: 'text', data: '2024', boundingBox: { top: 96, left: 110, width: 9, height: 4 } },
      { type: 'text', data: 'TAB from the Heart', boundingBox: { top: 95, left: 139, width: 120, height: 10 } }
    ]
    expect(cleanedTexts(elements)).not.toContain('2024')
  })

  it('does not exempt a superscript citation marker below reading size (mivision "2", 3x5pt)', () => {
    const elements: TestElement[] = [
      { type: 'text', data: '2', boundingBox: { top: 515, left: 243, width: 3, height: 5 } },
      { type: 'text', data: 'Residency-trained optometrists working in this facility', boundingBox: { top: 515, left: 250, width: 160, height: 10 } }
    ]
    expect(cleanedTexts(elements)).not.toContain('2')
  })
})
