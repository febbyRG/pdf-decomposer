import { describe, expect, it } from 'vitest'
import { makeImageElement, makePage, makeTextElement, PAGE_H, PAGE_W } from './heuristics/__fixtures__/pages.js'
import { PdfPageComposer } from './PdfPageComposer.js'

const body = 'This is a sufficiently long paragraph of body copy that comfortably exceeds the article length threshold used by the classifier. '.repeat(4)

function spreadHalves(sourcePageNumber: number) {
  const left = makePage({
    pageIndex: (sourcePageNumber - 1) * 2,
    pageNumber: (sourcePageNumber - 1) * 2 + 1,
    elements: [makeTextElement({ data: body + 'The story ends cleanly here.', type: 'paragraph', fontSize: 12 })],
    metadata: { spread: { sourcePageIndex: sourcePageNumber - 1, sourcePageNumber, half: 'left' } }
  })
  const right = makePage({
    pageIndex: (sourcePageNumber - 1) * 2 + 1,
    pageNumber: (sourcePageNumber - 1) * 2 + 2,
    elements: [makeImageElement({ width: PAGE_W, height: PAGE_H })],
    metadata: { spread: { sourcePageIndex: sourcePageNumber - 1, sourcePageNumber, half: 'right' } }
  })
  return { left, right }
}

describe('PdfPageComposer spread groups', () => {
  it('merges an article half with its artwork mate into one composed page', () => {
    const { left, right } = spreadHalves(2)
    const composed = PdfPageComposer.composePages([left, right])
    expect(composed).toHaveLength(1)
    expect(composed[0].metadata?.composedFromPages).toEqual([left.pageIndex, right.pageIndex])
  })

  it('preserves every member\'s physical spread identity in composedFromSpreads', () => {
    const { left, right } = spreadHalves(2)
    const composed = PdfPageComposer.composePages([left, right])
    expect((composed[0].metadata as Record<string, unknown>).composedFromSpreads).toEqual([
      { sourcePageIndex: 1, sourcePageNumber: 2, half: 'left' },
      { sourcePageIndex: 1, sourcePageNumber: 2, half: 'right' }
    ])
  })

  it('keeps consecutive spreads as separate articles (no cross-spread glue)', () => {
    const spread2 = spreadHalves(2)
    const spread3 = spreadHalves(3)
    const composed = PdfPageComposer.composePages([spread2.left, spread2.right, spread3.left, spread3.right])
    expect(composed).toHaveLength(2)
    expect(composed[0].metadata?.composedFromPages).toEqual([2, 3])
    expect(composed[1].metadata?.composedFromPages).toEqual([4, 5])
  })

  it('does not emit composedFromSpreads for portrait (non-spread) groups', () => {
    const a = makePage({
      pageIndex: 0,
      pageNumber: 1,
      elements: [makeTextElement({ data: body + 'and the story continues', type: 'paragraph', fontSize: 12 })]
    })
    const b = makePage({
      pageIndex: 1,
      pageNumber: 2,
      elements: [makeTextElement({ data: body + 'into the following page.', type: 'paragraph', fontSize: 12 })]
    })
    const composed = PdfPageComposer.composePages([a, b])
    expect(composed).toHaveLength(1)
    expect((composed[0].metadata as Record<string, unknown>).composedFromSpreads).toBeUndefined()
  })
})

describe('PdfPageComposer headless continuation', () => {
  // Long enough that the titled page is an article page and not a cover
  // (a page of display type and little text never continues forward).
  const copy = (lead: string) => lead + ' ' + 'The question is how the situation develops and what can be learned from it for the coming years. '.repeat(14)
  const bodyParagraph = (data: string, pageIndex: number, top = 99) =>
    makeTextElement({ data, type: 'paragraph', fontSize: 10.4, fontFamily: 'Crimson Text', top, pageIndex })
  const titled = (pageIndex: number) => makePage({
    pageIndex,
    elements: [
      makeTextElement({ data: 'CAN THE DEVELOPMENT BE PREDICTED?', type: 'header', fontSize: 31.4, top: 183, pageIndex }),
      bodyParagraph(copy('The editorial opens under its title.') + 'It ends on a full stop.', pageIndex, 392)
    ]
  })
  const headless = (pageIndex: number) => makePage({
    pageIndex,
    elements: [bodyParagraph(copy('The general perception is that little has changed.') + 'It ends on a full stop too.', pageIndex)]
  })

  it('composes a titled article with the headless page that follows it', () => {
    const composed = PdfPageComposer.composePages([titled(0), headless(1)])
    expect(composed).toHaveLength(1)
    expect(composed[0].metadata?.composedFromPages).toEqual([0, 1])
  })

  it('carries the title of the group, so a third headless page follows the second', () => {
    const composed = PdfPageComposer.composePages([titled(0), headless(1), headless(2)])
    expect(composed).toHaveLength(1)
    expect(composed[0].metadata?.composedFromPages).toEqual([0, 1, 2])
  })

  it('leaves headless pages alone when no titled article stands before them', () => {
    const composed = PdfPageComposer.composePages([headless(0), headless(1)])
    expect(composed).toHaveLength(2)
  })
})

describe('PdfPageComposer article interrupted by standalone pages', () => {
  const ad = (pageIndex: number) => makePage({
    pageIndex,
    elements: [makeImageElement({ width: PAGE_W, height: PAGE_H, pageIndex })],
    metadata: { convertedToScreenshot: true, conversionReason: 'hero-image-ad (85.0% hero, 420 text chars)' }
  })
  const hanging = (pageIndex: number) => makePage({
    pageIndex,
    elements: [makeTextElement({ data: body + 'and the story continues', type: 'paragraph', fontSize: 12, pageIndex })]
  })
  const resuming = (pageIndex: number) => makePage({
    pageIndex,
    elements: [makeTextElement({ data: 'after the advertisement, ' + body + 'It ends cleanly here.', type: 'paragraph', fontSize: 12, pageIndex })]
  })
  const newArticle = (pageIndex: number) => makePage({
    pageIndex,
    elements: [
      makeTextElement({ data: 'THE FUTURE, NOW', type: 'header', fontSize: 28, pageIndex }),
      makeTextElement({ data: body + 'It ends cleanly here.', type: 'paragraph', fontSize: 12, pageIndex })
    ]
  })

  it('composes an article across one ad page and lets the ad follow it', () => {
    const pages = [hanging(0), ad(1), resuming(2)]
    const composed = PdfPageComposer.composePages(pages)
    expect(composed).toHaveLength(2)
    expect(composed[0].metadata?.composedFromPages).toEqual([0, 2])
    // The ad is the page it was, after the article it interrupted.
    expect(composed[1]).toBe(pages[1])
    // The article's elements are in page order, each still knowing its page.
    expect(composed[0].elements.map(element => element.pageIndex)).toEqual([0, 2])
  })

  it('looks past a double-page ad, and no further', () => {
    const acrossTwo = PdfPageComposer.composePages([hanging(0), ad(1), ad(2), resuming(3)])
    expect(acrossTwo.map(page => page.metadata?.composedFromPages ?? [page.pageIndex])).toEqual([[0, 3], [1], [2]])

    const acrossThree = PdfPageComposer.composePages([hanging(0), ad(1), ad(2), ad(3), resuming(4)])
    expect(acrossThree.map(page => page.pageIndex)).toEqual([0, 1, 2, 3, 4])
    expect(acrossThree.every(page => !page.metadata?.isComposed)).toBe(true)
  })

  it('goes on after the ad, the article may continue further', () => {
    const middle = makePage({
      pageIndex: 2,
      elements: [makeTextElement({ data: 'after the advertisement, ' + body + 'and it still goes', type: 'paragraph', fontSize: 12, pageIndex: 2 })]
    })
    const composed = PdfPageComposer.composePages([hanging(0), ad(1), middle, resuming(3), newArticle(4)])
    expect(composed.map(page => page.metadata?.composedFromPages ?? [page.pageIndex])).toEqual([[0, 2, 3], [1], [4]])
  })

  it('does not reach over an ad to a page that starts a new article', () => {
    const pages = [hanging(0), ad(1), newArticle(2)]
    const composed = PdfPageComposer.composePages(pages)
    expect(composed).toEqual(pages)
  })

  it('does not reach over an ad without evidence that the article continues', () => {
    const complete = makePage({
      pageIndex: 0,
      elements: [makeTextElement({ data: body + 'The first article ends here.', type: 'paragraph', fontSize: 12 })]
    })
    const unrelated = makePage({
      pageIndex: 2,
      elements: [makeTextElement({ data: 'The council announced a new program. ' + body, type: 'paragraph', fontSize: 12, pageIndex: 2 })]
    })
    const pages = [complete, ad(1), unrelated]
    expect(PdfPageComposer.composePages(pages)).toEqual(pages)
  })

  it('leaves an ad at the end of the document, and ads between complete articles, where they are', () => {
    const pages = [newArticle(0), ad(1), newArticle(2), ad(3)]
    expect(PdfPageComposer.composePages(pages)).toEqual(pages)
  })

  it('never starts a group from an ad', () => {
    const pages = [ad(0), resuming(1)]
    expect(PdfPageComposer.composePages(pages)).toEqual(pages)
  })
})
