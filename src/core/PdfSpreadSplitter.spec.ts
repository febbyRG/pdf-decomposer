import { describe, expect, it } from 'vitest'
import opusRawPages from './__fixtures__/opus-spread-raw-pages.json'
import { PdfSpreadSplitter } from './PdfSpreadSplitter.js'
import type { PdfDecomposerDecomposedPage } from '../types/decomposer.types.js'

const opusPages = opusRawPages as unknown as PdfDecomposerDecomposedPage[]

function textChars(pages: PdfDecomposerDecomposedPage[]): number {
  return pages
    .flatMap(p => p.elements)
    .filter(e => e.type === 'text')
    .reduce((n, e) => n + String(e.data ?? '').length, 0)
}

describe('PdfSpreadSplitter.splitPages', () => {
  it('mode \'off\' returns the input untouched', () => {
    const result = PdfSpreadSplitter.splitPages(opusPages, 'off')
    expect(result).toBe(opusPages)
  })

  it('mode \'auto\' splits the real opus document into logical half pages', () => {
    const result = PdfSpreadSplitter.splitPages(opusPages, 'auto')
    expect(result).toHaveLength(opusPages.length * 2)
  })

  it('mode \'auto\' leaves a portrait document unchanged', () => {
    const portrait = opusPages.map(p => ({ ...p, width: 612, height: 792 }))
    const result = PdfSpreadSplitter.splitPages(portrait, 'auto')
    expect(result).toBe(portrait)
  })

  it('treats an unrecognized mode (e.g. an env typo) as off, never as forced split', () => {
    const result = PdfSpreadSplitter.splitPages(opusPages, 'Auto' as never)
    expect(result).toBe(opusPages)
  })

  it('mode \'split\' forces splitting without detection evidence', () => {
    // Cover-only document: auto would find no evidence, split still cuts it.
    const coverOnly = [opusPages[0]]
    expect(PdfSpreadSplitter.splitPages(coverOnly, 'auto')).toBe(coverOnly)
    expect(PdfSpreadSplitter.splitPages(coverOnly, 'split')).toHaveLength(2)
  })

  describe('split output contract', () => {
    const result = PdfSpreadSplitter.splitPages(opusPages, 'auto')

    it('renumbers pages into a continuous logical sequence', () => {
      result.forEach((page, index) => {
        expect(page.pageIndex).toBe(index)
        expect(page.pageNumber).toBe(index + 1)
        expect(page.title).toBe(`Page ${index + 1}`)
      })
    })

    it('carries the physical source identity on every logical page', () => {
      const expected = opusPages.flatMap(source => ([
        { sourcePageIndex: source.pageIndex, sourcePageNumber: source.pageNumber, half: 'left' },
        { sourcePageIndex: source.pageIndex, sourcePageNumber: source.pageNumber, half: 'right' }
      ]))
      expect(result.map(p => p.metadata?.spread)).toEqual(expected)
    })

    it('halves the page width and keeps the height', () => {
      for (const page of result) {
        expect(page.width).toBe(opusPages[0].width / 2)
        expect(page.height).toBe(opusPages[0].height)
      }
    })

    it('loses zero text — the preservation invariant', () => {
      expect(textChars(result)).toBe(textChars(opusPages))
    })

    it('keeps every element box inside its logical page bounds', () => {
      for (const page of result) {
        for (const el of page.elements) {
          expect(el.boundingBox.left).toBeGreaterThanOrEqual(0)
          expect(el.boundingBox.right).toBeLessThanOrEqual(page.width + 0.001)
        }
      }
    })

    it('rewrites element pageIndex to the logical page', () => {
      for (const page of result) {
        for (const el of page.elements) {
          expect(el.pageIndex).toBe(page.pageIndex)
        }
      }
    })
  })

  it('keeps a portrait page whole inside a spread document, tagged as full', () => {
    const portraitInsert: PdfDecomposerDecomposedPage = {
      ...opusPages[1],
      pageIndex: 4,
      pageNumber: 5,
      width: 612,
      height: 792
    }
    const result = PdfSpreadSplitter.splitPages([...opusPages, portraitInsert], 'auto')
    expect(result).toHaveLength(opusPages.length * 2 + 1)

    const fullPage = result[result.length - 1]
    expect(fullPage.metadata?.spread).toEqual({
      sourcePageIndex: 4,
      sourcePageNumber: 5,
      half: 'full'
    })
    expect(fullPage.width).toBe(612)
  })
})
