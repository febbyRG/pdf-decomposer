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
