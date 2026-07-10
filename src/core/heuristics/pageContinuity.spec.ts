import { describe, expect, it } from 'vitest'
import { makeImageElement, makePage, makeTextElement, PAGE_H, PAGE_W } from './__fixtures__/pages.js'
import {
  analyzeContentType,
  hasContentContinuity,
  isScreenshotPage,
  isSpreadArtworkHalf,
  isSpreadMatePair,
  mainBodyEndsHanging,
  nextStartsMidSentence,
  parseContinuationMarkers,
  runningHeadTokens,
  spreadMateContinuity,
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

describe('resource trailers, sidebar headings, late titles, connectives (wa.pdf regression set)', () => {
  it('a "More information" trailer ending on a URL does not read as a hanging body', () => {
    // wa p60: the article's last real paragraph ends with a full stop; a
    // resource trailer ("More information For more information see
    // dpird.wa.gov.au/stablefly") follows it and used to read as hanging,
    // gluing the page onto the UNRELATED next article.
    const page = makePage({
      elements: [
        para(long('community collaboration reduces outbreaks, Mr Shepherd said.')),
        para('More information For more information see dpird.wa.gov')
      ]
    })
    expect(mainBodyEndsHanging(page)).toBe(false)
  })

  it('a right-column panel heading does not open a new section', () => {
    // wa p60: the sidebar box "The Act" (fs19, right column) is first in
    // reading order on a CONTINUATION page; it must not block the merge.
    const page = makePage({
      elements: [
        makeTextElement({ data: 'The Act', type: 'header', fontSize: 19, left: 308, top: 121 }),
        para(long('the biosecurity act obliges growers to control breeding sites.'))
      ]
    })
    expect(startsNewSection(page)).toBe(false)
  })

  it('a left-region opening heading still opens a new section', () => {
    const page = makePage({
      elements: [
        makeTextElement({ data: 'THE FUTURE, NOW', type: 'header', fontSize: 26, left: 40, top: 90 }),
        para(long('a brand new feature article begins on this page.'))
      ]
    })
    expect(startsNewSection(page)).toBe(true)
  })

  it('a huge display title counts even when a small hero caption precedes it', () => {
    // wa p61: the "WHEN AI" article opens with a photo whose small caption is
    // first in reading order; the fs58 title must still mark a new section.
    const page = makePage({
      elements: [
        makeTextElement({ data: 'AI appears to have the capability to provide what looks to be a solution.', fontSize: 9, top: 120, left: 71 }),
        makeTextElement({ data: 'WHEN AI', type: 'header', fontSize: 58, top: 292, left: 74 })
      ]
    })
    expect(startsNewSection(page)).toBe(true)
  })

  it('a huge pull-quote in the bottom half does not open a new section', () => {
    const page = makePage({
      elements: [
        para(long('this is a continuation page with running body text on it and')),
        makeTextElement({ data: 'I DUG INTO THE NUMBERS', type: 'header', fontSize: 44, top: 700, left: 300 })
      ]
    })
    expect(startsNewSection(page)).toBe(false)
  })

  it('a first paragraph opening with a discourse connective continues the previous page', () => {
    // wa p14 -> p15: p14 ends on a sentence boundary, p15 begins
    // "Meanwhile, his own farming enterprise..." — same article.
    const current = makePage({ pageNumber: 14, elements: [para(long('the products are matched to their needs, he says.'))] })
    const next = makePage({
      pageNumber: 15,
      elements: [para('Meanwhile, his own farming enterprise was taking shape and taking off. ' + long('he produced his own seedlings.'))]
    })
    expect(hasContentContinuity(current, next)).toBe(true)
  })

  it('a capitalized non-connective start is still not continuation evidence', () => {
    const current = makePage({ pageNumber: 20, elements: [para(long('the first article ends cleanly right here.'))] })
    const next = makePage({ pageNumber: 21, elements: [para('The council announced a new program. ' + long('details follow below.'))] })
    expect(hasContentContinuity(current, next)).toBe(false)
  })
})

describe('running-head continuity (wa.pdf spreads with sentence-boundary page breaks)', () => {
  it('extracts normalized rare tokens from the stashed running head', () => {
    const page = makePage({ elements: [para(long('.'))], metadata: { runningHeadText: 'BUSINESS stable fly 58' } })
    expect(runningHeadTokens(page).sort()).toEqual(['business', 'fly', 'stable'])
  })

  it('returns no tokens without stashed metadata', () => {
    expect(runningHeadTokens(makePage({ elements: [para(long('.'))] }))).toEqual([])
  })

  it('sharedRunningHead evidence merges pages that both end on sentence boundaries', () => {
    const current = makePage({ pageNumber: 59, elements: [para(long('good management is more effective, he said.'))] })
    const next = makePage({ pageNumber: 60, elements: [para(long('the rapid lifecycle means waste vegetable material produces a surge.'))] })
    expect(hasContentContinuity(current, next)).toBe(false)
    expect(hasContentContinuity(current, next, true)).toBe(true)
  })

  it('a new-section title still blocks a shared running head', () => {
    const current = makePage({ pageNumber: 60, elements: [para(long('the article ends cleanly here.'))] })
    const next = makePage({
      pageNumber: 61,
      elements: [makeTextElement({ data: 'WHEN AI', type: 'header', fontSize: 58, top: 292, left: 74 }), para(long('a new article begins.'))]
    })
    expect(hasContentContinuity(current, next, true)).toBe(false)
  })
})

describe('spread-mate attachment', () => {
  const spreadMeta = (sourcePageNumber: number, half: 'left' | 'right') =>
    ({ spread: { sourcePageIndex: sourcePageNumber - 1, sourcePageNumber, half } })

  const textHalf = (sourcePage: number, half: 'left' | 'right') => makePage({
    pageIndex: half === 'left' ? (sourcePage - 1) * 2 : (sourcePage - 1) * 2 + 1,
    elements: [para(long('a proper article body that clearly exceeds the substance threshold.'))],
    metadata: spreadMeta(sourcePage, half)
  })

  const artworkHalf = (sourcePage: number, half: 'left' | 'right', extra: Record<string, unknown> = {}) => makePage({
    pageIndex: half === 'left' ? (sourcePage - 1) * 2 : (sourcePage - 1) * 2 + 1,
    elements: [makeImageElement({ width: PAGE_W, height: PAGE_H })],
    metadata: { ...spreadMeta(sourcePage, half), ...extra }
  })

  it('detects a left/right pair of the same physical page', () => {
    expect(isSpreadMatePair(textHalf(2, 'left'), artworkHalf(2, 'right'))).toBe(true)
  })

  it('rejects halves of different physical pages', () => {
    expect(isSpreadMatePair(artworkHalf(2, 'right'), textHalf(3, 'left'))).toBe(false)
  })

  it('rejects pages without spread metadata (portrait documents)', () => {
    const portrait = makePage({ elements: [makeImageElement({ width: PAGE_W, height: PAGE_H })] })
    expect(isSpreadMatePair(portrait, textHalf(2, 'right'))).toBe(false)
    expect(isSpreadArtworkHalf(portrait)).toBe(false)
  })

  it('classifies an image-only half as artwork, incl. with a short caption', () => {
    expect(isSpreadArtworkHalf(artworkHalf(2, 'right'))).toBe(true)
    const withCaption = makePage({
      elements: [makeImageElement({ width: PAGE_W, height: PAGE_H }), para('The Santa Maria, oil on canvas, 19th century.')],
      metadata: spreadMeta(2, 'right')
    })
    expect(isSpreadArtworkHalf(withCaption)).toBe(true)
  })

  it('a screenshot-collapsed half is artwork unless the reason is an ad', () => {
    expect(isSpreadArtworkHalf(artworkHalf(5, 'right', {
      convertedToScreenshot: true, conversionReason: 'single-large-image (100.0% coverage)'
    }))).toBe(true)
    expect(isSpreadArtworkHalf(artworkHalf(5, 'right', {
      convertedToScreenshot: true, conversionReason: 'hero-image-ad (85.0% hero, 420 text chars)'
    }))).toBe(false)
  })

  it('a half opening with its own display title is not artwork (independent article)', () => {
    const titled = makePage({
      elements: [
        makeTextElement({ data: 'A NEW CHAPTER', type: 'h1', fontSize: 47, top: 100, left: 60 }),
        makeImageElement({ width: PAGE_W, height: Math.round(PAGE_H * 0.7) })
      ],
      metadata: spreadMeta(4, 'right')
    })
    expect(isSpreadArtworkHalf(titled)).toBe(false)
  })

  it('merges text-left + artwork-right (the opus Treasures pattern)', () => {
    expect(spreadMateContinuity(textHalf(2, 'left'), artworkHalf(2, 'right'))).toBe(true)
    expect(hasContentContinuity(textHalf(2, 'left'), artworkHalf(2, 'right'))).toBe(true)
  })

  it('merges artwork-left + text-right (reversed direction)', () => {
    expect(spreadMateContinuity(artworkHalf(6, 'left'), textHalf(6, 'right'))).toBe(true)
    expect(hasContentContinuity(artworkHalf(6, 'left'), textHalf(6, 'right'))).toBe(true)
  })

  it('overrides the screenshot guard for a collapsed artwork mate', () => {
    const collapsed = artworkHalf(5, 'right', {
      convertedToScreenshot: true, conversionReason: 'single-large-image (100.0% coverage)'
    })
    expect(hasContentContinuity(textHalf(5, 'left'), collapsed)).toBe(true)
  })

  it('never attaches an ad half, even within a spread', () => {
    const ad = artworkHalf(7, 'right', {
      convertedToScreenshot: true, conversionReason: 'hero-image-ad (85.0% hero, 420 text chars)'
    })
    expect(hasContentContinuity(textHalf(7, 'left'), ad)).toBe(false)
  })

  it('does not merge two text halves via this rule (normal evidence still applies)', () => {
    const left = textHalf(3, 'left')
    const right = textHalf(3, 'right')
    expect(spreadMateContinuity(left, right)).toBe(false)
  })

  it('does not merge two artwork halves', () => {
    expect(spreadMateContinuity(artworkHalf(3, 'left'), artworkHalf(3, 'right'))).toBe(false)
  })

  it('requires article substance on the text side', () => {
    const thinText = makePage({
      elements: [para('Just a short caption here.')],
      metadata: spreadMeta(2, 'left')
    })
    expect(spreadMateContinuity(thinText, artworkHalf(2, 'right'))).toBe(false)
  })
})
