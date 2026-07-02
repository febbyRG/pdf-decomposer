import { describe, expect, it } from 'vitest'
import { adElements, editorialElements, makeImageElement, makeTextElement, tiledElements, PAGE_H, PAGE_W } from './__fixtures__/pages.js'
import { decideScreenshot } from './screenshotHeuristics.js'

const input = (elements: any[]) => ({ pageWidth: PAGE_W, pageHeight: PAGE_H, elements })

describe('decideScreenshot', () => {
  it('converts a hero-image ad with scattered promo text', () => {
    const result = decideScreenshot(input(adElements()))
    expect(result.convert).toBe(true)
    expect(result.reason).toMatch(/^hero-image-ad/)
  })

  it('regression: a hero image with ~250 chars of SHORT fragments still converts (old total-text guard wrongly kept it)', () => {
    // hero image ~60% coverage + 5 short fragments (250 total, longest 50).
    const elements = [
      makeImageElement({ width: PAGE_W, height: Math.round(PAGE_H * 0.6) }),
      ...Array.from({ length: 5 }, () => makeTextElement({ data: 'x'.repeat(50), fontSize: 12 }))
    ]
    const result = decideScreenshot(input(elements))
    expect(result.convert).toBe(true)
    expect(result.reason).toMatch(/^hero-image-ad/)
  })

  it('keeps an editorial page (one long paragraph) decomposed', () => {
    const result = decideScreenshot(input(editorialElements()))
    expect(result.convert).toBe(false)
    expect(result.reason).toMatch(/^significant-text-content/)
  })

  it('keeps an article laid over a full-bleed background image decomposed (regression: mivision p3)', () => {
    // Full-page background image (coverage ~1.0) with a real article on top.
    // The editorial guard must win over the single-large-image check.
    const elements = [
      makeImageElement({ width: PAGE_W, height: PAGE_H }),
      makeTextElement({ data: 'x'.repeat(697), fontSize: 10 })
    ]
    const result = decideScreenshot(input(elements))
    expect(result.convert).toBe(false)
    expect(result.reason).toMatch(/^significant-text-content/)
  })

  it('converts a single near-full-page image', () => {
    const elements = [makeImageElement({ width: PAGE_W, height: Math.round(PAGE_H * 0.85) })]
    const result = decideScreenshot(input(elements))
    expect(result.convert).toBe(true)
    expect(result.reason).toMatch(/^single-large-image/)
  })

  it('converts a tiled cover (several distributed images, high aggregate coverage)', () => {
    const result = decideScreenshot(input(tiledElements()))
    expect(result.convert).toBe(true)
    expect(result.reason).toMatch(/^tiled-images/)
  })

  it('does not convert a text page with no images', () => {
    const elements = [makeTextElement({ data: 'x'.repeat(50) })]
    const result = decideScreenshot(input(elements))
    expect(result).toEqual({ convert: false, reason: 'no-images' })
  })

  it('does not convert an empty page', () => {
    const result = decideScreenshot(input([]))
    expect(result).toEqual({ convert: false, reason: 'no-elements' })
  })
})
