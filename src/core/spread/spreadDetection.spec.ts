import { describe, expect, it } from 'vitest'
import opusRawPages from '../__fixtures__/opus-spread-raw-pages.json'
import {
  collectPageEvidence,
  crossesMidline,
  detectSpreadDocument,
  hasFolioPair,
  isLandscapePage
} from './spreadDetection.js'
import type { SpreadCandidateElement, SpreadCandidatePage } from './types.js'

const opusPages = opusRawPages as unknown as SpreadCandidatePage[]

function element(left: number, top: number, width: number, height: number, data = 'text', type = 'text'): SpreadCandidateElement {
  return {
    type,
    data,
    boundingBox: { top, left, bottom: top + height, right: left + width, width, height }
  }
}

/** A 16:9 slide-shaped page: landscape, but content crosses the centerline. */
function slidePage(pageNumber: number): SpreadCandidatePage {
  const elements: SpreadCandidateElement[] = []
  // Centered title + full-width bullet rows, the typical deck layout.
  elements.push(element(300, 60, 680, 60, 'A Centered Presentation Title'))
  for (let i = 0; i < 10; i++) {
    elements.push(element(120, 160 + i * 50, 1040, 32, `bullet row ${i} spanning most of the slide width`))
  }
  return { pageIndex: pageNumber - 1, pageNumber, width: 1280, height: 720, elements }
}

describe('isLandscapePage', () => {
  it('accepts the opus spread shape (2:1) and rejects portrait', () => {
    expect(isLandscapePage({ width: 2551, height: 1276 })).toBe(true)
    expect(isLandscapePage({ width: 612, height: 792 })).toBe(false)
  })

  it('accepts an A4 spread (1.41) — the lowest real spread aspect', () => {
    expect(isLandscapePage({ width: 420, height: 297 })).toBe(true)
  })
})

describe('crossesMidline', () => {
  const pageWidth = 2000

  it('does not count an element that merely touches the centerline', () => {
    // Ends 10pt past the midline: within the slack band.
    expect(crossesMidline(element(800, 100, 210, 20), pageWidth)).toBe(false)
  })

  it('counts an element extending well past the midline on both sides', () => {
    expect(crossesMidline(element(500, 100, 1000, 200), pageWidth)).toBe(true)
  })
})

describe('hasFolioPair', () => {
  it('finds the adjacent folio pair on a real opus spread (736|737)', () => {
    // Fixture page 2 carries folios 736 (left) and 737 (right) in the top band.
    expect(hasFolioPair(opusPages[1])).toBe(true)
  })

  it('does not fabricate a pair from non-adjacent or non-numeric text', () => {
    const page: SpreadCandidatePage = {
      pageIndex: 0,
      pageNumber: 1,
      width: 2000,
      height: 1000,
      elements: [
        element(100, 10, 30, 15, '12'),
        element(1800, 10, 30, 15, '99'),
        element(1500, 10, 60, 15, 'HEADER')
      ]
    }
    expect(hasFolioPair(page)).toBe(false)
  })
})

describe('collectPageEvidence', () => {
  it('lets the full-bleed opus cover abstain (too few elements)', () => {
    const evidence = collectPageEvidence(opusPages[0])
    expect(evidence.isLandscape).toBe(true)
    expect(evidence.eligible).toBe(false)
    expect(evidence.votesSpread).toBe(false)
  })

  it('has every content-bearing opus spread vote spread', () => {
    for (const page of opusPages.slice(1)) {
      const evidence = collectPageEvidence(page)
      expect(evidence.eligible).toBe(true)
      expect(evidence.votesSpread).toBe(true)
    }
  })
})

describe('detectSpreadDocument', () => {
  it('confirms the real opus document as a spread', () => {
    const result = detectSpreadDocument(opusPages)
    expect(result.isSpreadDocument).toBe(true)
  })

  it('rejects a portrait document outright', () => {
    const portrait = opusPages.map(p => ({ ...p, width: 612, height: 792 }))
    expect(detectSpreadDocument(portrait).isSpreadDocument).toBe(false)
  })

  it('rejects a 16:9 slide deck despite the landscape aspect', () => {
    const deck = [1, 2, 3, 4].map(slidePage)
    const result = detectSpreadDocument(deck)
    expect(result.isSpreadDocument).toBe(false)
  })

  it('needs at least two votes: one odd page cannot flip a document', () => {
    const result = detectSpreadDocument([opusPages[1]])
    expect(result.isSpreadDocument).toBe(false)
  })

  it('abstaining pages alone never make a spread (evidence-free document)', () => {
    const coverOnly = [opusPages[0], { ...opusPages[0], pageIndex: 1, pageNumber: 2 }]
    const result = detectSpreadDocument(coverOnly)
    expect(result.isSpreadDocument).toBe(false)
  })

  it('rejects a portrait document containing a few rotated landscape pages', () => {
    // 6 portrait pages + 2 clean-guttered landscape pages (rotated tables):
    // the landscape minority must not flip the document to spread.
    const portrait = Array.from({ length: 6 }, (_, i) => ({
      ...opusPages[1],
      pageIndex: i,
      pageNumber: i + 1,
      width: 612,
      height: 792
    }))
    const rotated = [opusPages[1], opusPages[2]].map((p, i) => ({
      ...p,
      pageIndex: 6 + i,
      pageNumber: 7 + i
    }))
    const result = detectSpreadDocument([...portrait, ...rotated])
    expect(result.isSpreadDocument).toBe(false)
    expect(result.reason).toContain('portrait document')
  })
})
