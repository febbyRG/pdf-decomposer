import { describe, expect, it } from 'vitest'
import { makeImageElement, makePage, makeTextElement, PAGE_H, PAGE_W } from './__fixtures__/pages.js'
import {
  analyzeContentType,
  dominantBodyFace,
  hasArticleTitle,
  hasContentContinuity,
  isCoverPage,
  isHeadlessContinuation,
  isScreenshotPage,
  isSpreadArtworkHalf,
  isSpreadMatePair,
  mainBodyEndsHanging,
  nextStartsMidSentence,
  opensWithSubheadingOf,
  parseContinuationMarkers,
  runningHeadsDiffer,
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

describe('headless continuation (cyberwatch.pdf pages 2-3, a sentence-boundary page break without a running head)', () => {
  // Geometry and faces of the real pages: an editorial whose title, byline and
  // two body columns fill page 2 (ending on a full stop and a pull quote), and
  // whose page 3 opens with body copy at the top and closes with the author's
  // card. No running head, no hanging sentence, a capitalized start.
  const bodyCopy = (lead: string) => lead + ' ' + 'The question is how the situation develops and what can be learned from it for the coming years. '.repeat(8)
  const body = (data: string, top: number, left = 51) =>
    makeTextElement({ data, type: 'paragraph', fontSize: 10.4, fontFamily: 'Crimson Text', top, left, width: 238 })

  const titledPage = () => makePage({
    pageIndex: 1,
    pageNumber: 2,
    elements: [
      makeTextElement({ data: 'CAN THE DEVELOPMENT OF THE CYBER WORLD', type: 'header', fontSize: 31.4, top: 183, left: 119 }),
      makeTextElement({ data: 'BE PREDICTED?', type: 'header', fontSize: 31.4, top: 267, left: 175 }),
      makeTextElement({ data: '// Aapo Cederberg', type: 'paragraph', fontSize: 7, top: 312, left: 262 }),
      body(bodyCopy('The invasion has permanently changed the European security system.') + 'so as not to draw the wrong conclusions from', 392),
      body('which future developments are predicted. ' + bodyCopy('Are you wondering when it ends?') + 'supporting cyber defense.', 403, 305),
      makeTextElement({ data: 'The importance of anticipation is growing in the strategy work of both state actors and private companies.', type: 'paragraph', fontSize: 9.7, top: 733, left: 189 })
    ]
  })

  const headlessPage = (overrides: { elements?: ReturnType<typeof makeTextElement>[] } = {}) => makePage({
    pageIndex: 2,
    pageNumber: 3,
    elements: overrides.elements ?? [
      body(bodyCopy('The general perception seems to be that the attacker has not been particularly successful.'), 99, 54),
      body(bodyCopy('On the other side there is a great need to use these means as part of hybrid operations.'), 99, 305),
      makeImageElement({ top: 388, left: 242, width: 299, height: 400 }),
      makeTextElement({ data: 'AAPO CEDERBERG', type: 'paragraph', fontSize: 9, top: 648, left: 140 }),
      makeTextElement({ data: 'Managing Director and Founder of Cyberwatch Finland', type: 'paragraph', fontSize: 8.5, top: 668, left: 116 })
    ]
  })

  it('names the face that carries most of a page\'s body copy', () => {
    expect(dominantBodyFace(titledPage())).toEqual({ fontFamily: 'Crimson Text', fontSize: 10.4 })
    expect(dominantBodyFace(makePage({ elements: [makeTextElement({ data: 'Short.', type: 'paragraph' })] }))).toBeNull()
  })

  it('knows a page that carries an article title from one that does not', () => {
    expect(hasArticleTitle(titledPage())).toBe(true)
    expect(hasArticleTitle(headlessPage())).toBe(false)
  })

  it('merges a headless page of body copy onto the titled article before it', () => {
    expect(isHeadlessContinuation(titledPage(), headlessPage())).toBe(true)
    expect(hasContentContinuity(titledPage(), headlessPage())).toBe(true)
  })

  it('does not merge when the article so far has no title', () => {
    const untitled = makePage({ pageIndex: 1, pageNumber: 2, elements: [body(bodyCopy('An article without a heading ends here.'), 99)] })
    expect(hasContentContinuity(untitled, headlessPage())).toBe(false)
    // The composer passes the title of the whole group: a third page follows a
    // headless second one, which has no title of its own to offer.
    const second = makePage({ pageIndex: 2, pageNumber: 3, elements: [body(bodyCopy('The second page of the article is body copy alone.'), 99)] })
    const third = makePage({ pageIndex: 3, pageNumber: 4, elements: [body(bodyCopy('The third page of the article is body copy alone.'), 99)] })
    expect(hasContentContinuity(second, third)).toBe(false)
    expect(hasContentContinuity(second, third, false, true)).toBe(true)
  })

  it('does not merge a page that carries a heading of its own, however small', () => {
    const withSubheading = headlessPage({
      elements: [
        body(bodyCopy('The general perception seems to be that little has changed.'), 99, 54),
        makeTextElement({ data: 'A new angle', type: 'header', fontSize: 12, top: 320, left: 54 }),
        body(bodyCopy('Another piece of copy follows the small heading.'), 340, 54)
      ]
    })
    expect(hasContentContinuity(titledPage(), withSubheading)).toBe(false)
  })

  it('does not merge a page whose display type was typed as a paragraph', () => {
    const displayParagraph = headlessPage({
      elements: [
        body(bodyCopy('The general perception seems to be that little has changed.'), 99, 54),
        makeTextElement({ data: 'A PASSION FOR A SAFE CYBER WORLD', type: 'paragraph', fontSize: 35.9, top: 600, left: 54 })
      ]
    })
    expect(hasContentContinuity(titledPage(), displayParagraph)).toBe(false)
  })

  it('does not merge a page whose body starts further down (a title that is artwork, not text)', () => {
    const underArtwork = headlessPage({
      elements: [
        makeImageElement({ top: 0, left: 0, width: PAGE_W, height: 380 }),
        body(bodyCopy('The general perception seems to be that little has changed.'), 400, 54),
        body(bodyCopy('A second column of the same piece.'), 400, 305)
      ]
    })
    expect(hasContentContinuity(titledPage(), underArtwork)).toBe(false)
  })

  it('does not merge a page set in another body size or another face', () => {
    const smaller = headlessPage({
      elements: [makeTextElement({ data: bodyCopy('Fine print in a smaller size opens this page.'), type: 'paragraph', fontSize: 8.5, fontFamily: 'Crimson Text', top: 99, left: 54 })]
    })
    const otherFace = headlessPage({
      elements: [makeTextElement({ data: bodyCopy('The same size in another family opens this page.'), type: 'paragraph', fontSize: 10.4, fontFamily: 'Arimo', top: 99, left: 54 })]
    })
    expect(hasContentContinuity(titledPage(), smaller)).toBe(false)
    expect(hasContentContinuity(titledPage(), otherFace)).toBe(false)
  })

  it('does not merge a page with too little copy to be an article page', () => {
    const notice = headlessPage({
      elements: [body('A short notice of a few lines that says something about the next issue and nothing more than that.', 99, 54)]
    })
    expect(hasContentContinuity(titledPage(), notice)).toBe(false)
  })

  it('still stops at a page that starts a new section', () => {
    const newArticle = makePage({
      pageIndex: 2,
      pageNumber: 3,
      elements: [
        makeTextElement({ data: 'CYBER SAFETY', type: 'header', fontSize: 44.5, top: 116, left: 54 }),
        body(bodyCopy('A new article begins under its own title.'), 300, 54)
      ]
    })
    expect(hasContentContinuity(titledPage(), newArticle)).toBe(false)
  })
})

describe('a short opening page and the page that continues it (cyberwatch.pdf pages 8-9)', () => {
  // The real shapes: page 8 is a 36pt title, a standfirst in 18pt display
  // type and 550 characters of body. Page 9 opens with an 18pt heading of the
  // same style, and both carry the running head "Cyberwatch Finland".
  const sentence = 'Strategic expertise requires a holistic view and an understanding of how the parts depend on one another. '
  const display = (data: string, fontSize: number, top: number) =>
    makeTextElement({ data, type: 'paragraph', fontSize, fontFamily: 'Arimo', top, left: 90 })
  const copy = (data: string, top: number) =>
    makeTextElement({ data, type: 'paragraph', fontSize: 10.5, fontFamily: 'Arimo', top, left: 90 })

  const opener = (lastWords = 'It ends on a full stop.') => makePage({
    pageIndex: 7,
    pageNumber: 8,
    elements: [
      display('A PASSION FOR A SAFE CYBER WORLD', 35.9, 260),
      display('FORMULATING A DEPENDABLE CYBER SECURITY', 18.1, 516),
      copy(sentence.repeat(4) + lastWords, 593),
      copy(sentence, 705)
    ]
  })
  const nextPart = (heading: { data: string, fontSize: number } = { data: 'BENEFITS AND COMPETITIVE ADVANTAGES', fontSize: 18.1 }) => makePage({
    pageIndex: 8,
    pageNumber: 9,
    elements: [
      display(heading.data, heading.fontSize, 94),
      copy(sentence.repeat(6), 154),
      makeTextElement({ data: 'REFERENCES', type: 'header', fontSize: 18.1, fontFamily: 'Arimo', top: 245, left: 90 }),
      copy(sentence.repeat(6), 286)
    ]
  })

  it('does not take an opening page with real body copy for a cover', () => {
    expect(isCoverPage(opener())).toBe(false)
    expect(analyzeContentType(opener())).not.toBe('cover')
  })

  it('still takes display type with a tagline, or no text at all, for a cover', () => {
    const titleAndTagline = makePage({
      elements: [display('MAGAZINE TITLE', 40, 100), copy('The quarterly review of things that matter to people who read.', 400)]
    })
    expect(isCoverPage(titleAndTagline)).toBe(true)
    expect(isCoverPage(makePage({ elements: [makeImageElement({ width: PAGE_W, height: PAGE_H })] }))).toBe(true)
  })

  it('lets a short opening page continue on text-flow evidence, as any article page does', () => {
    const continuation = makePage({ pageIndex: 8, pageNumber: 9, elements: [copy('and goes on from the page before. ' + sentence.repeat(6), 99)] })
    expect(hasContentContinuity(opener('the sentence runs over the page break and'), continuation)).toBe(true)
  })

  it('knows a heading at the size of the article\'s own sub-heading from a title', () => {
    expect(startsNewSection(nextPart())).toBe(true)
    expect(opensWithSubheadingOf(opener(), nextPart())).toBe(true)
  })

  it('continues onto a page that opens with such a sub-heading, under a shared running head only', () => {
    expect(hasContentContinuity(opener(), nextPart(), true)).toBe(true)
    expect(hasContentContinuity(opener(), nextPart(), false)).toBe(false)
  })

  it('still stops at a display title, shared running head or not ("OUR SERVICES" on page 10)', () => {
    const newArticle = nextPart({ data: 'OUR SERVICES', fontSize: 37.4 })
    expect(opensWithSubheadingOf(nextPart(), newArticle)).toBe(false)
    expect(hasContentContinuity(nextPart(), newArticle, true)).toBe(false)
  })

  it('still stops at a heading of a size the current page does not use', () => {
    expect(hasContentContinuity(opener(), nextPart({ data: 'A DIFFERENT KIND OF HEADING', fontSize: 24 }), true)).toBe(false)
  })

  it('still stops when the current page has no title clearly larger than the heading', () => {
    const flat = makePage({
      pageIndex: 7,
      pageNumber: 8,
      elements: [display('A SECTION OF EQUAL HEADINGS', 18.1, 100), copy(sentence.repeat(6), 160)]
    })
    expect(opensWithSubheadingOf(flat, nextPart())).toBe(false)
    expect(hasContentContinuity(flat, nextPart(), true)).toBe(false)
  })

  it('still stops when a larger title stands further down the next page', () => {
    const titleBelow = makePage({
      pageIndex: 8,
      pageNumber: 9,
      elements: [
        display('BENEFITS AND COMPETITIVE ADVANTAGES', 18.1, 94),
        display('A NEW ARTICLE', 30, 200),
        copy(sentence.repeat(6), 300)
      ]
    })
    expect(opensWithSubheadingOf(opener(), titleBelow)).toBe(false)
  })
})

describe('what the 120-page magazine showed (WAGROWER.pdf)', () => {
  const sentence = 'Growers across the region have taken part in the program and report what it changed for them this season. '
  const copy = (data: string, top = 99) =>
    makeTextElement({ data, type: 'paragraph', fontSize: 10, fontFamily: 'Body Serif', top, left: 60 })

  it('does not take a page tag for the opening text of a contents page (pages 2-3)', () => {
    // "8" tags a preview picture and comes first in reading order, the title follows.
    const contents = makePage({
      pageNumber: 3,
      elements: [
        makeTextElement({ data: '8', type: 'header', fontSize: 12, top: 207, left: 60 }),
        makeTextElement({ data: 'CONTENTS', type: 'header', fontSize: 39, top: 235, left: 60 }),
        copy('64 WorkSafe safety forum 66 Traffic safety in packhouses 68 Visiting your GP', 330)
      ]
    })
    expect(startsNewSection(contents)).toBe(true)
    const events = makePage({
      pageNumber: 2,
      elements: [
        makeTextElement({ data: 'Upcoming EVENTS', type: 'header', fontSize: 42.8, top: 338, left: 40 }),
        copy(sentence.repeat(4), 500),
        makeTextElement({ data: 'Introduction to Responsible Beekeeping Course', type: 'paragraph', fontSize: 11, top: 600, left: 40 })
      ]
    })
    expect(hasContentContinuity(events, contents)).toBe(false)
  })

  it('tells two running heads apart whatever the order of their words', () => {
    const page = (runningHeadText?: string) => makePage({ elements: [copy(sentence)], ...(runningHeadText ? { metadata: { runningHeadText } } : {}) })
    expect(runningHeadsDiffer(page('news UPFRONT'), page('grower FEATURE'))).toBe(true)
    expect(runningHeadsDiffer(page('BUSINESS water'), page('water BUSINESS'))).toBe(false)
    expect(runningHeadsDiffer(page('news UPFRONT'), page())).toBe(false)
    expect(runningHeadsDiffer(page(), page())).toBe(false)
  })

  it('does not take a page under another running head for a headless continuation (pages 13 and 15)', () => {
    const titled = (runningHeadText: string) => makePage({
      pageNumber: 13,
      elements: [makeTextElement({ data: 'DR SUKHVINDER PAL (SP) SINGH', type: 'header', fontSize: 36, top: 120, left: 60 }), copy(sentence.repeat(6), 300)],
      metadata: { runningHeadText }
    })
    const headless = (runningHeadText: string) => makePage({ pageNumber: 15, elements: [copy(sentence.repeat(8))], metadata: { runningHeadText } })
    expect(hasContentContinuity(titled('news UPFRONT'), headless('grower FEATURE'))).toBe(false)
    // The same two pages under one running head are one article.
    expect(hasContentContinuity(titled('news UPFRONT'), headless('UPFRONT news'))).toBe(true)
  })
})
