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
