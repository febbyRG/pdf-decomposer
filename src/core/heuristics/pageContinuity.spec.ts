import { describe, expect, it } from 'vitest'
import { makeImageElement, makePage, makeTextElement, PAGE_H, PAGE_W } from './__fixtures__/pages.js'
import {
  analyzeContentType,
  hasContentContinuity,
  isScreenshotPage,
  mainBodyEndsHanging,
  nextStartsMidSentence,
  parseContinuationMarkers,
  startsNewSection
} from './pageContinuity.js'

const para = (data: string) => makeTextElement({ data, type: 'paragraph', fontSize: 12, fontFamily: 'Body' })
const long = (tail: string) => 'This is a sufficiently long paragraph of body copy that comfortably exceeds the article length threshold used by the classifier. '.repeat(4) + tail

const articlePage = (pageNumber: number, ...paragraphs: string[]) =>
  makePage({ pageIndex: pageNumber - 1, pageNumber, elements: paragraphs.map(para) })

describe('isScreenshotPage', () => {
  it('flags a page carrying screenshot metadata', () => {
    const page = makePage({ elements: [makeImageElement({ width: PAGE_W, height: PAGE_H })], metadata: { convertedToScreenshot: true } })
    expect(isScreenshotPage(page)).toBe(true)
  })

  it('flags an image-only page with no metadata (structural fallback)', () => {
    const page = makePage({ elements: [makeImageElement({ width: PAGE_W, height: PAGE_H })] })
    expect(isScreenshotPage(page)).toBe(true)
  })

  it('does not flag a normal text page', () => {
    expect(isScreenshotPage(articlePage(1, long('.')))).toBe(false)
  })
})

describe('mainBodyEndsHanging', () => {
  it('is true when the last body paragraph ends without terminal punctuation', () => {
    expect(mainBodyEndsHanging(articlePage(1, long('the sentence runs on'))).valueOf()).toBe(true)
  })

  it('is false when the last body paragraph ends with a full stop', () => {
    expect(mainBodyEndsHanging(articlePage(1, long('the article ends here.'))).valueOf()).toBe(false)
  })

  it('is false when the tail is boilerplate ending on a separator/symbol (ad legal fine print)', () => {
    // mivision Hoya IOL ad: the longest "paragraph" is a regulatory disclaimer whose
    // tail is "...Chromos | -". No terminal punctuation, but it is not a hanging
    // sentence, so it must not glue the ad onto the next page.
    expect(mainBodyEndsHanging(articlePage(1, long('registration #04-01/06 | Chromos | -'))).valueOf()).toBe(false)
  })

  it('ignores a trailing bio/attribution block introduced by an interior heading', () => {
    // Reproduces demo.pdf page 2: the main column ends mid-sentence ("...ICSC and"),
    // then an interior heading + a bio blurb (ending with a full stop) is ordered
    // last. The hanging MAIN paragraph must still be detected.
    const page = makePage({
      pageNumber: 2,
      elements: [
        makeTextElement({ data: 'SHAPING DREAMS', type: 'h1', fontSize: 47 }),
        para(long('my engagement with industry organizations such as ICSC and')),
        makeImageElement({ width: 200, height: 200 }),
        makeTextElement({ data: 'MR. MOHAMMAD ALAWI', type: 'h2', fontSize: 14 }),
        para('MOHAMMAD ALAWI'),
        para('CHAIRMAN OF THE EXECUTIVE COMMITTEE'),
        para(long('a frequent speaker at economic forums, conferences, and seminars.'))
      ]
    })
    expect(mainBodyEndsHanging(page)).toBe(true)
  })
})

describe('nextStartsMidSentence', () => {
  it('is true when the first body paragraph starts lowercase', () => {
    expect(nextStartsMidSentence(articlePage(1, 'of addressing the shortfall the team pressed on.'))).toBe(true)
  })

  it('is false when the page starts with a heading', () => {
    const page = makePage({ elements: [makeTextElement({ data: 'A New Heading', type: 'header', fontSize: 18 }), para(long('.'))] })
    expect(nextStartsMidSentence(page)).toBe(false)
  })

  it('is false when the first paragraph starts with a capital letter', () => {
    expect(nextStartsMidSentence(articlePage(1, 'The next article opens here.'))).toBe(false)
  })
})

describe('startsNewSection', () => {
  it('flags a section-marker word', () => {
    expect(startsNewSection(makePage({ elements: [makeTextElement({ data: 'FEATURE', type: 'header', fontSize: 12 })] }))).toBe(true)
  })

  it('flags a large display title', () => {
    expect(startsNewSection(makePage({ elements: [makeTextElement({ data: 'ISLAND', type: 'header', fontSize: 120 })] }))).toBe(true)
  })

  it('flags a mid-size heading title that opens the page (e.g. "THE FUTURE, NOW")', () => {
    // demo.pdf page 5 opens with an fs26 heading whose comma defeats the plain
    // all-caps banner regex; a heading sized clearly above body still marks a new section.
    expect(startsNewSection(makePage({ elements: [makeTextElement({ data: 'THE FUTURE, NOW', type: 'header', fontSize: 26 })] }))).toBe(true)
  })

  it('does NOT flag a page that opens with running body text sized above 18', () => {
    // A continuation opens with a paragraph, not a heading element, so a large-ish
    // body font must not be mistaken for a section title.
    expect(startsNewSection(makePage({ elements: [makeTextElement({ data: 'of the same continuing thought carried forward here', type: 'paragraph', fontSize: 20 })] }))).toBe(false)
  })

  it('does NOT flag a small-font subheading within a continuing article', () => {
    // demo.pdf page 4 opens with the subheading "SHOPPING CENTRE UPDATE" (fs 12)
    // but is a continuation, not a new section.
    expect(startsNewSection(makePage({ elements: [makeTextElement({ data: 'SHOPPING CENTRE UPDATE', type: 'header', fontSize: 12 })] }))).toBe(false)
  })

  it('does not flag ordinary body text', () => {
    expect(startsNewSection(articlePage(1, long('.')))).toBe(false)
  })
})

describe('hasContentContinuity', () => {
  it('never merges a screenshot/ad page with a neighbour (metadata)', () => {
    const shot = makePage({ pageNumber: 1, elements: [makeImageElement({ width: PAGE_W, height: PAGE_H })], metadata: { convertedToScreenshot: true } })
    const article = articlePage(2, long('the story continues'))
    expect(hasContentContinuity(shot, article)).toBe(false)
    expect(hasContentContinuity(article, shot)).toBe(false)
  })

  it('never merges an image-only page (structural fallback)', () => {
    const shot = makePage({ pageNumber: 1, elements: [makeImageElement({ width: PAGE_W, height: PAGE_H })] })
    const article = articlePage(2, long('the story continues'))
    expect(hasContentContinuity(shot, article)).toBe(false)
  })

  it('merges when a "continued on page N" marker points at the next page number', () => {
    const a = articlePage(4, long('The feature begins here.') + ' (continued on page 5)')
    const b = articlePage(5, long('The feature concludes here.'))
    expect(hasContentContinuity(a, b)).toBe(true)
  })

  it('merges when the current page main body ends mid-sentence', () => {
    const a = articlePage(1, long('and the story continues'))
    const b = articlePage(2, long('into the following page.'))
    expect(hasContentContinuity(a, b)).toBe(true)
  })

  it('merges when the next page begins mid-sentence (lowercase) even if the current end is obscured', () => {
    const a = articlePage(1, long('the article ends here.'))
    const b = articlePage(2, 'of the same continuing thought carried across the break.')
    expect(hasContentContinuity(a, b)).toBe(true)
  })

  it('does NOT merge when the next page starts a new section (FEATURE)', () => {
    const a = articlePage(1, long('and the story continues'))
    const b = makePage({ pageNumber: 2, elements: [makeTextElement({ data: 'FEATURE', type: 'header', fontSize: 12 }), para(long('.'))] })
    expect(hasContentContinuity(a, b)).toBe(false)
  })

  it('does NOT merge two unrelated complete articles that merely share the body font', () => {
    const a = articlePage(1, long('First article ends here.'))
    const b = articlePage(2, 'Second article begins here. ' + long('.'))
    expect(hasContentContinuity(a, b)).toBe(false)
  })

  it('does not merge from a cover page', () => {
    const cover = makePage({ pageNumber: 1, elements: [makeTextElement({ data: 'MAGAZINE TITLE', type: 'header', fontSize: 40 })] })
    const article = articlePage(2, long('and the story continues'))
    expect(hasContentContinuity(cover, article)).toBe(false)
  })
})

describe('parseContinuationMarkers', () => {
  it('parses "continued on page N"', () => {
    const page = makePage({ elements: [para('Body text. (Continued on page 24)')] })
    expect(parseContinuationMarkers(page).toPage).toBe(24)
  })

  it('parses "continued from page N"', () => {
    const page = makePage({ elements: [para('(Continued from page 22) more body text.')] })
    expect(parseContinuationMarkers(page).fromPage).toBe(22)
  })
})

describe('analyzeContentType (de-hardcoded)', () => {
  it('classifies a long page by structure, not by document-specific keywords', () => {
    const page = articlePage(1, long('mohammad alawi discussed the red sea project.'))
    expect(analyzeContentType(page)).toBe('article')
  })
})
