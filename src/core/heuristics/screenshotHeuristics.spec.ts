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

  it('converts a text-heavy ad whose single promo block exceeds the block threshold (regression: mivision Rohto)', () => {
    // Real signals measured on the Rohto Dry Eye ad: hero 66.7%, one 333-char
    // marketing paragraph, 518 chars total. The editorial guard must not keep
    // it decomposed: a page whose entire text fits in adMaxTextChars has no
    // article substance to protect.
    const elements = [
      makeImageElement({ width: PAGE_W, height: Math.round(PAGE_H * 0.67) }),
      makeTextElement({ data: 'x'.repeat(333), fontSize: 10 }),
      makeTextElement({ data: 'x'.repeat(47), fontSize: 14 }),
      makeTextElement({ data: 'x'.repeat(40), fontSize: 12 }),
      makeTextElement({ data: 'x'.repeat(55), fontSize: 8 }),
      makeTextElement({ data: 'x'.repeat(43), fontSize: 8 })
    ]
    const result = decideScreenshot(input(elements))
    expect(result.convert).toBe(true)
    expect(result.reason).toMatch(/^hero-image-ad/)
  })

  it('keeps a photo-editorial page decomposed (full-bleed photo + one long caption + credit)', () => {
    // Corpus pattern (heather hotel roundups, kandy profiles): a dominant photo
    // with a single 300-500 char descriptive caption and a credit line. Total
    // text fits the ad budget, but the text is NOT scattered across ad-style
    // boxes, so the guard exemption must not fire: the caption is the content.
    const elements = [
      makeImageElement({ width: PAGE_W, height: PAGE_H }),
      makeTextElement({ data: 'x'.repeat(470), fontSize: 10 }),
      makeTextElement({ data: 'x'.repeat(37), fontSize: 8 })
    ]
    const result = decideScreenshot(input(elements))
    expect(result.convert).toBe(false)
    expect(result.reason).toMatch(/^significant-text-content/)
  })

  it('the guard exemption does not fire when total text exceeds adMaxTextChars (hero page with real body text)', () => {
    // Same dominant hero, but the page carries article-scale text: one long
    // block plus enough total to pass adMaxTextChars. Stays decomposed.
    const elements = [
      makeImageElement({ width: PAGE_W, height: Math.round(PAGE_H * 0.67) }),
      makeTextElement({ data: 'x'.repeat(400), fontSize: 10 }),
      makeTextElement({ data: 'x'.repeat(350), fontSize: 10 })
    ]
    const result = decideScreenshot(input(elements))
    expect(result.convert).toBe(false)
    expect(result.reason).toMatch(/^significant-text-content/)
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

describe('legal fine print exclusion (mivision-feb p103 Alcon ad)', () => {
  const finePrint = '* Trademarks are the property of their respective owners. ' + 'Based on in-vitro studies wherein wettability was measured in seconds using a system. '.repeat(12)
  const adBase = () => [
    makeImageElement({ top: -15, left: -10, width: PAGE_W + 30, height: PAGE_H + 30 }),
    makeTextElement({ data: 'REIMAGINING THE LENS DESIGN WHERE IT MATTERS MOST.', fontSize: 18, top: 250 }),
    makeTextElement({ data: 'AT THE SURFACE.', type: 'header', fontSize: 28, top: 290 }),
    makeTextElement({ data: 'WITH UP TO 2X LONGER LENS SURFACE MOISTURE THAN OTHER LEADING BRANDS.', fontSize: 18, top: 520 })
  ]

  it('a full-page ad with a 1,000+ char tiny-font legal disclaimer still converts', () => {
    const elements = [...adBase(), makeTextElement({ data: finePrint, fontSize: 8, top: 600 })]
    const decision = decideScreenshot({ pageWidth: PAGE_W, pageHeight: PAGE_H, elements })
    expect(decision.convert).toBe(true)
    expect(decision.reason).toContain('single-large-image')
  })

  it('the same long block at body font size keeps the page as content', () => {
    const elements = [...adBase(), makeTextElement({ data: finePrint, fontSize: 10, top: 600 })]
    const decision = decideScreenshot({ pageWidth: PAGE_W, pageHeight: PAGE_H, elements })
    expect(decision.convert).toBe(false)
    expect(decision.reason).toContain('significant-text-content')
  })

  it('a tiny-font long block WITHOUT legal markers keeps the page as content', () => {
    const editorialSmall = 'The community garden project has been growing steadily for a decade now. '.repeat(8)
    const elements = [...adBase(), makeTextElement({ data: editorialSmall, fontSize: 8, top: 600 })]
    const decision = decideScreenshot({ pageWidth: PAGE_W, pageHeight: PAGE_H, elements })
    expect(decision.convert).toBe(false)
    expect(decision.reason).toContain('significant-text-content')
  })
})
