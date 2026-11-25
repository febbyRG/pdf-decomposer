import type { PdfElement } from '../../models/PdfElement.js'
import type { PdfPageContent } from '../../models/PdfPageContent.js'
import type { SpreadSourceInfo } from '../spread/types.js'
import { isImageElement, normalizeBoundingBox } from './elementUtils.js'
import { getCleanPageText, getCleanText, getTextElements } from './textUtils.js'

/**
 * Pure page-continuity heuristics used by PdfPageComposer to decide whether two
 * consecutive pages belong to the same article and should be merged.
 *
 * Document-agnostic (no per-publication literals). Two consecutive same-document
 * pages are a continuation unless the next page clearly starts a new section, and
 * the continuation is evidenced from EITHER side:
 *  - the current page's MAIN body ends mid-sentence (bio/sidebar-aware), or
 *  - the next page begins mid-sentence (a lowercase body start), or
 *  - an explicit "continued on/from page N" marker links them, or
 *  - the next page is a headless page of body copy in the face of a titled
 *    article before it (isHeadlessContinuation).
 *
 * Ads / covers / screenshots never merge, with two exceptions that are no
 * ads: the artwork half of a spread (spreadMateContinuity) and the full-page
 * photograph an article opens on (openingPictureContinuity). An article may
 * continue past a standalone page (PdfPageComposer looks over one or two),
 * which stays a page of its own.
 */

// Ad-aware structural fallback thresholds (metadata is the primary signal; these
// only matter when the screenshot stage left an image-dominant page un-converted).
const SCREENSHOT_FALLBACK_COVERAGE = 0.8
const SCREENSHOT_FALLBACK_MAX_TEXT = 600

// Cover detection.
const COVER_MAX_TEXT = 1000
const COVER_HEADER_RATIO = 0.6
const LARGE_FONT = 20
// A cover carries display type and at most a tagline. A page with this much
// body copy under its title is the opening page of an article, however short
// (cyberwatch.pdf page 8: a 36pt title, a standfirst and 550 characters of
// body, which continue on page 9). Same figure as the clean composer's
// editorial guard (significantTextBlockThreshold).
const COVER_MAX_BODY_COPY = 300

// A display title at this font size or larger marks a new section/article (any element).
const HUGE_TITLE_FONT = 40
// A page that OPENS with a heading element at this font size or larger starts a
// new section/article (body text is typically ~9-12pt; a continuation opens with
// body, not a display heading).
const SECTION_HEADING_FONT = 18
// Minimum length for an element to count as a real body paragraph.
const MIN_BODY_PARAGRAPH = 40
// Where article titles live. An opening heading only counts as a new-article
// title when it sits in the left/center region (a right-column panel heading of
// a sidebar box, e.g. "The Act", is page furniture, not a title), and a huge
// display title only counts within the top half of the page.
const TITLE_REGION_WIDTH_RATIO = 0.45
const TITLE_REGION_HEIGHT_RATIO = 0.5

// A resource trailer closes an article ("More information ...", "Sources: ...").
// It is not body prose: its tail routinely ends on a bare URL/word and must not
// read as a hanging sentence gluing the page onto an unrelated neighbour.
const RESOURCE_TRAILER = /^(more information|for more information|further information|sources?[\s:]|references?[\s:]|see also\b)/i

// Discourse connectives that open a CONTINUATION paragraph. A page whose first
// body paragraph starts with one of these continues the previous page's story
// even when the previous page ended on a sentence boundary. Conservative list:
// fresh article ledes practically never open with these.
const CONTINUATION_CONNECTIVE = /^(Meanwhile|However|Nevertheless|Furthermore|Moreover|Similarly, |Likewise, |Instead, |Even so|At the same time|On the other hand|As a result|Consequently|By contrast)[,\s]/

// ── Headless continuation (a page of body copy with no heading of its own) ──
// A page that opens with running body text and carries no heading cannot open
// an article: it continues the titled article before it, even when both pages
// break on a sentence boundary and share no running head. The text-flow
// signals cannot see that case (cyberwatch.pdf pages 2-3: the editorial ends
// page 2 on a full stop, page 3 opens with a capital and closes with the
// author's card). Deliberately narrow, because a shared body face or a
// capitalized start alone once glued unrelated articles together: every one of
// the conditions in isHeadlessContinuation must hold.
// The first body paragraph of a continuation page sits at the top of the page;
// a new piece whose title is artwork (not text) opens with body further down.
const HEADLESS_BODY_TOP_RATIO = 0.25
// The page must carry real article copy, not a caption page or a short notice.
const HEADLESS_MIN_TEXT = 500
// Two pages of one article are set in the same body size.
const BODY_FONT_SIZE_TOLERANCE = 0.5

// ── A page that opens with a sub-heading of the running article ──
// A heading that opens a page reads as a new article (startsNewSection). Inside
// one article the next part often opens a page the same way: "BENEFITS AND
// COMPETITIVE ADVANTAGES" at 18pt on cyberwatch.pdf page 9, under the running
// head of page 8, whose title is 36pt and whose own sub-heading is 18pt. The
// title of an article is clearly larger than the headings inside it, so an
// opening heading at the size of a heading the current page already has, well
// below that page's title, is a sub-heading. Only counted together with a
// shared running head (the caller's evidence that both pages are one piece).
const SUBHEADING_TITLE_RATIO = 1.5

// ── Opening picture (an article that opens on a full-page photograph) ──
// A feature often opens with its title set on a photograph that fills the
// page, and its text starts on the page after (WAGROWER.pdf pages 14-15 and
// 70-71). The clean composer collapses such a page to one picture, as it does
// an advertisement, and a collapsed page never merges: the reader got a
// picture as an article of its own and the text as an article without a title.
// What tells the opening page from an ad is the magazine's own furniture: it
// carries the running head of the page after it ("FEATURE grower" and "grower
// FEATURE"), an ad carries none. And the page after it has no title of its own.
// The page must carry real article copy, same figure as the headless rule.
const OPENING_PICTURE_MIN_TEXT = 500

// ── Spread-mate attachment (two logical halves of one physical spread page) ──
// In spread publications the two halves are routinely ONE editorial unit:
// article text on one half, its full-page artwork/photography on the other.
// An artwork half may carry captions but never real body copy, and ads betray
// themselves by scattering promo text across many boxes (the 5+ fragment
// pattern established by the ad heuristics), so a low fragment count separates
// editorial artwork from advertising.
const SPREAD_ARTWORK_MAX_OWN_TEXT = 200
const SPREAD_ARTWORK_MAX_TEXT_FRAGMENTS = 3
// The text side must carry real article substance for the pair to be one unit.
const SPREAD_ARTICLE_MIN_TEXT = 500
// Screenshot-collapse reason class that must never attach (advertisement).
const AD_CONVERSION_REASON = /^hero-image-ad/

export type ContentType = 'cover' | 'image' | 'article' | 'mixed'

export interface ContinuationMarkers {
  toPage: number | null
  fromPage: number | null
}

function isHeaderElement(element: PdfElement): boolean {
  return element.type === 'header'
    || /^h[1-6]$/i.test(element.type)
    || (element.attributes?.type && ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(element.attributes.type))
}

function isBodyParagraph(element: PdfElement): boolean {
  return element.type === 'paragraph' || element.type === 'text'
}

function isAnyTextElement(element: PdfElement): boolean {
  return isBodyParagraph(element) || isHeaderElement(element)
}

// A contents page tags its preview pictures with page numbers ("8", "26"),
// and such a tag can come first in reading order, before the page's title
// (WAGROWER.pdf page 3: "8", then "CONTENTS" at 39pt). A bare number is never
// what a page opens with.
const PAGE_TAG = /^\d{1,3}$/

/** The text a page opens with: its first text element that is not a bare page tag. */
function openingTextElement(page: PdfPageContent): PdfElement | undefined {
  return (page.elements || []).find(element => isAnyTextElement(element) && !PAGE_TAG.test(getCleanText(element)))
}

function getHeaderRatio(elements: PdfElement[]): number {
  if (elements.length === 0) return 0
  return elements.filter(isHeaderElement).length / elements.length
}

/**
 * The last real body paragraph on the page, ignoring a trailing sidebar/bio/
 * attribution block. Such a block is introduced by an interior heading (e.g. an
 * interviewee name box), so the main body ends before the LAST interior heading.
 * This is what lets us see that a page whose reading-order ends with a bio blurb
 * actually has a hanging main paragraph earlier (the real continuation point).
 */
function mainBodyLastParagraph(page: PdfPageContent): string | null {
  const elements = page.elements || []

  // An interior heading (not the page's opening title in the first 2 elements)
  // starts a sidebar/aside; the main body ends before the last one.
  let lastInteriorHeading = -1
  for (let i = 2; i < elements.length; i++) {
    if (isHeaderElement(elements[i])) lastInteriorHeading = i
  }
  const limit = lastInteriorHeading >= 0 ? lastInteriorHeading : elements.length

  for (let i = limit - 1; i >= 0; i--) {
    const element = elements[i]
    if (isBodyParagraph(element)) {
      const text = getCleanText(element)
      // A resource trailer is an article's closing furniture, not its body.
      if (RESOURCE_TRAILER.test(text)) continue
      if (text.length >= MIN_BODY_PARAGRAPH) return text
    }
  }
  return null
}

/**
 * The current page's main body ends mid-sentence, i.e. it looks like a clause cut
 * across the page break. Two conditions must both hold:
 *  - no terminal sentence punctuation, AND
 *  - the tail ends on a word or comma (a clause genuinely running on).
 * A tail that ends on a separator / number / symbol is NOT a hanging sentence:
 * ad legal fine print ("... | Chromos | -"), a stat callout, or a caption fragment
 * would otherwise read as "hanging" and wrongly glue an ad or a standalone page
 * onto its neighbour.
 */
export function mainBodyEndsHanging(page: PdfPageContent): boolean {
  const text = mainBodyLastParagraph(page)
  if (!text) return false
  const noTerminalPunctuation = !/[.!?]["')\]]?\s*$/.test(text)
  const cutMidSentence = /[A-Za-z,]\s*$/.test(text)
  return noTerminalPunctuation && cutMidSentence
}

/** The next page begins mid-sentence: its first text element is body starting lowercase. */
export function nextStartsMidSentence(page: PdfPageContent): boolean {
  const first = (page.elements || []).find(isAnyTextElement)
  if (!first || isHeaderElement(first)) return false
  return /^[a-z]/.test(getCleanText(first))
}

/** The page opens a new section/article (large display title or a section-marker word). */
export function startsNewSection(page: PdfPageContent): boolean {
  const elements = page.elements || []

  // A large display title in the top half marks a new section wherever it sits
  // in reading order: a small hero-image caption can legitimately precede the
  // title (e.g. a caption laid over the opening photo), so checking only the
  // FIRST text element misses the actual title and glues the new article onto
  // the previous page.
  const pageHeight = page.height || 0
  for (const element of elements) {
    if (!isAnyTextElement(element)) continue
    if ((element.attributes?.fontSize || 0) >= HUGE_TITLE_FONT) {
      const top = normalizeBoundingBox(element.boundingBox).top
      if (pageHeight <= 0 || top <= pageHeight * TITLE_REGION_HEIGHT_RATIO) return true
    }
  }

  const first = openingTextElement(page)
  if (!first) return false
  const text = getCleanText(first)
  const fontSize = first.attributes?.fontSize || 0

  // Explicit section-marker words.
  if (/^(FEATURE|SECTION|CHAPTER)\b/i.test(text)) return true

  // Mid-size opening headings only count in the title region: a right-column
  // panel heading (a sidebar box like "The Act" on a continuation page) is at
  // heading size too, but it is page furniture, not an article title.
  const left = normalizeBoundingBox(first.boundingBox).left
  const inTitleRegion = !page.width || left < page.width * TITLE_REGION_WIDTH_RATIO
  // A page that opens with a heading element sized clearly above body text is a
  // new section/article title (e.g. "THE FUTURE, NOW"). A continuation page opens
  // with running body text, not a display heading; and a small inline subheading
  // (e.g. "SHOPPING CENTRE UPDATE" at body size) stays below this threshold.
  if (isHeaderElement(first) && fontSize >= SECTION_HEADING_FONT && inTitleRegion) return true
  // All-caps banner headline (punctuation allowed) sized above body.
  if (/^[A-Z][A-Z\s.,:'&()!?-]{10,}$/.test(text) && text.length < 80 && fontSize > 15 && inTitleRegion) return true
  return false
}

/**
 * The next page's first body paragraph opens with a discourse connective
 * ("Meanwhile, ..."): continuation evidence even when the previous page ended
 * on a sentence boundary.
 */
export function nextStartsWithConnective(page: PdfPageContent): boolean {
  const first = (page.elements || []).find(isAnyTextElement)
  if (!first || isHeaderElement(first)) return false
  return CONTINUATION_CONNECTIVE.test(getCleanText(first))
}

export interface BodyFace {
  fontFamily: string
  fontSize: number
}

/**
 * The face the page's body copy is set in: the font family and size that carry
 * the most characters of its real body paragraphs. Null when the page has no
 * body paragraph with a known size.
 */
export function dominantBodyFace(page: PdfPageContent): BodyFace | null {
  const weights = new Map<string, { face: BodyFace, characters: number }>()
  for (const element of page.elements || []) {
    if (!isBodyParagraph(element)) continue
    const text = getCleanText(element)
    if (text.length < MIN_BODY_PARAGRAPH) continue
    const fontSize = Number(element.attributes?.fontSize) || 0
    if (fontSize <= 0) continue
    const fontFamily = String(element.attributes?.fontFamily || '')
    const key = `${fontFamily}|${fontSize.toFixed(1)}`
    const entry = weights.get(key) ?? { face: { fontFamily, fontSize }, characters: 0 }
    entry.characters += text.length
    weights.set(key, entry)
  }
  let dominant: { face: BodyFace, characters: number } | null = null
  for (const entry of weights.values()) {
    if (!dominant || entry.characters > dominant.characters) dominant = entry
  }
  return dominant ? dominant.face : null
}

function sameBodyFace(a: BodyFace, b: BodyFace): boolean {
  if (Math.abs(a.fontSize - b.fontSize) > BODY_FONT_SIZE_TOLERANCE) return false
  // A family is compared only when both pages name one.
  return !a.fontFamily || !b.fontFamily || a.fontFamily === b.fontFamily
}

/**
 * The page opens an article: it starts a new section, or it carries a heading
 * sized clearly above body text. PdfPageComposer asks this of the pages of the
 * group it is building, since a headless page can only continue an article
 * that has a title.
 */
export function hasArticleTitle(page: PdfPageContent): boolean {
  if (startsNewSection(page)) return true
  return (page.elements || []).some(element =>
    isHeaderElement(element) && (element.attributes?.fontSize || 0) >= SECTION_HEADING_FONT)
}

/**
 * The next page is a headless continuation of the current page's article:
 *  - it has no heading element and no display-size text at all,
 *  - it opens with a real body paragraph at the top of the page,
 *  - it carries real article copy, and
 *  - its body is set in the same face and size as the current page's body.
 * And the two pages do not stand under different running heads: a feature
 * whose title is printed on a full-page photograph opens its text page without
 * a heading too (WAGROWER.pdf page 15, after the "news" article of page 13).
 * Whether the article so far has a title is the caller's to establish
 * (hasContentContinuity's `articleHasTitle`).
 */
export function isHeadlessContinuation(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
  if (runningHeadsDiffer(currentPage, nextPage)) return false
  const textElements = (nextPage.elements || []).filter(isAnyTextElement)
  if (textElements.length === 0) return false
  if (textElements.some(isHeaderElement)) return false
  // A title the element composer typed as a paragraph is still a title.
  if (textElements.some(element => (element.attributes?.fontSize || 0) >= SECTION_HEADING_FONT)) return false

  const first = textElements[0]
  if (getCleanText(first).length < MIN_BODY_PARAGRAPH) return false
  const pageHeight = nextPage.height || 0
  if (pageHeight > 0 && normalizeBoundingBox(first.boundingBox).top > pageHeight * HEADLESS_BODY_TOP_RATIO) return false

  if (getCleanPageText(nextPage).length < HEADLESS_MIN_TEXT) return false

  const currentFace = dominantBodyFace(currentPage)
  const nextFace = dominantBodyFace(nextPage)
  return currentFace !== null && nextFace !== null && sameBodyFace(currentFace, nextFace)
}

function textSizes(page: PdfPageContent): number[] {
  return (page.elements || [])
    .filter(isAnyTextElement)
    .map(element => Number(element.attributes?.fontSize) || 0)
    .filter(size => size > 0)
}

/**
 * The next page opens with a sub-heading of the current page's article, not
 * with the title of a new one:
 *  - its opening text is the largest type on the next page (no bigger title
 *    stands further down) and is not display-title size,
 *  - the current page has a heading of the same size, and
 *  - the current page's own title is clearly larger than that.
 */
export function opensWithSubheadingOf(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
  const first = openingTextElement(nextPage)
  if (!first) return false
  const openingSize = Number(first.attributes?.fontSize) || 0
  if (openingSize <= 0 || openingSize >= HUGE_TITLE_FONT) return false
  if (/^(FEATURE|SECTION|CHAPTER)\b/i.test(getCleanText(first))) return false

  const nextSizes = textSizes(nextPage)
  if (Math.max(...nextSizes) > openingSize + BODY_FONT_SIZE_TOLERANCE) return false

  const currentSizes = textSizes(currentPage)
  if (currentSizes.length === 0) return false
  const titleSize = Math.max(...currentSizes)
  if (titleSize < openingSize * SUBHEADING_TITLE_RATIO) return false
  return currentSizes.some(size => Math.abs(size - openingSize) <= BODY_FONT_SIZE_TOLERANCE)
}

/**
 * Distinct normalized tokens of the page's running head / kicker (stashed by
 * the clean composer in metadata.runningHeadText before the margin filter
 * discards those elements). "BUSINESS stable fly" -> [business, stable, fly].
 */
export function runningHeadTokens(page: PdfPageContent): string[] {
  const metadata = page.metadata as Record<string, any> | undefined
  const text = String(metadata?.runningHeadText || '')
  if (!text) return []
  const tokens = text.toLowerCase().match(/[a-z]{3,}/g) || []
  return Array.from(new Set(tokens))
}

/**
 * Both pages carry a running head and the two differ ("news UPFRONT" against
 * "grower FEATURE"): the pages belong to different sections. Order does not
 * matter, a left page prints "BUSINESS water" and its right page "water
 * BUSINESS". False when either page has none, which says nothing.
 */
export function runningHeadsDiffer(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
  const current = runningHeadTokens(currentPage)
  const next = runningHeadTokens(nextPage)
  if (current.length === 0 || next.length === 0) return false
  return current.length !== next.length || !current.every(token => next.includes(token))
}

/**
 * Both pages carry the same running head, in any order of its words. Unlike
 * the composer's shared RARE running head this says nothing about how many
 * pages share it: it only places two neighbouring pages in one section.
 */
export function runningHeadsMatch(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
  const current = runningHeadTokens(currentPage)
  const next = runningHeadTokens(nextPage)
  return current.length > 0 && current.length === next.length && current.every(token => next.includes(token))
}

function isCollapsedToPicture(page: PdfPageContent): boolean {
  const metadata = page.metadata as Record<string, any> | undefined
  return Boolean(metadata?.convertedToScreenshot || metadata?.processedAsScreenshot)
}

/**
 * The current page is the opening picture of the article whose text starts on
 * the next page:
 *  - the clean composer collapsed it to one picture, and it is not the
 *    document's first page (the magazine's cover opens no article),
 *  - both pages carry the same running head,
 *  - the next page is a text page with real copy and no title of its own.
 * Evaluated before the screenshot guard in hasContentContinuity, like the
 * spread-mate attachment.
 */
export function openingPictureContinuity(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
  if (!isCollapsedToPicture(currentPage) || currentPage.pageIndex === 0) return false
  if ((currentPage.metadata as Record<string, any> | undefined)?.coverPage) return false
  if (!runningHeadsMatch(currentPage, nextPage)) return false
  if (isScreenshotPage(nextPage) || hasArticleTitle(nextPage)) return false
  return getCleanPageText(nextPage).length >= OPENING_PICTURE_MIN_TEXT
}

/**
 * Parse "continued on/from page N" markers from a page's text.
 */
export function parseContinuationMarkers(page: PdfPageContent): ContinuationMarkers {
  const text = getCleanPageText(page)
  const onMatch = text.match(/continued\s+on\s+p(?:age|g)?\.?\s*(\d+)/i)
    || text.match(/cont(?:'?d|inued)?\.?\s+on\s+(?:p(?:age|g)?\.?\s*)?(\d+)/i)
  const fromMatch = text.match(/continued\s+from\s+p(?:age|g)?\.?\s*(\d+)/i)
    || text.match(/cont(?:'?d|inued)?\.?\s+from\s+(?:p(?:age|g)?\.?\s*)?(\d+)/i)
  return {
    toPage: onMatch ? parseInt(onMatch[1], 10) : null,
    fromPage: fromMatch ? parseInt(fromMatch[1], 10) : null
  }
}

function getSpreadInfo(page: PdfPageContent): SpreadSourceInfo | null {
  const spread = (page.metadata as Record<string, any> | undefined)?.spread
  if (!spread || typeof spread.sourcePageNumber !== 'number') return null
  return spread as SpreadSourceInfo
}

/**
 * The two pages are the left and right halves of the SAME physical spread page
 * (adjacent by construction: the splitter emits left then right).
 */
export function isSpreadMatePair(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
  const current = getSpreadInfo(currentPage)
  const next = getSpreadInfo(nextPage)
  return current !== null && next !== null
    && current.sourcePageNumber === next.sourcePageNumber
    && current.half === 'left' && next.half === 'right'
}

/**
 * An "artwork half": a spread half whose content is imagery belonging to its
 * mate's article, not an article of its own. Evidence: it has image content,
 * no article opening of its own, and at most caption-level text in few boxes
 * (ads scatter promo copy across 5+ boxes; editorial artwork carries 0-3).
 * For halves already collapsed to a screenshot, the collapse reason separates
 * editorial artwork (single-large-image / tiled-images / cover) from ads.
 */
export function isSpreadArtworkHalf(page: PdfPageContent): boolean {
  if (getSpreadInfo(page) === null) return false
  if (startsNewSection(page)) return false

  const metadata = page.metadata as Record<string, any> | undefined
  if (metadata?.convertedToScreenshot || metadata?.processedAsScreenshot || metadata?.coverPage) {
    const reason = String(metadata.conversionReason || metadata.detectionMethod || '')
    return !AD_CONVERSION_REASON.test(reason)
  }

  const elements = page.elements || []
  if (!elements.some(isImageElement)) return false

  const textElements = getTextElements(page)
  const totalText = textElements.reduce((sum, el) => sum + getCleanText(el).length, 0)
  return totalText < SPREAD_ARTWORK_MAX_OWN_TEXT
    && textElements.length <= SPREAD_ARTWORK_MAX_TEXT_FRAGMENTS
}

/**
 * Spread-mate attachment: exactly one half is artwork and the other carries
 * the article text. Direction-agnostic (artwork may sit left or right).
 * Evaluated BEFORE the screenshot guard in hasContentContinuity: within a
 * spread, a full-page editorial image belongs to its mate's article, unlike a
 * portrait document where an image-only page is a standalone ad/insert.
 */
export function spreadMateContinuity(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
  if (!isSpreadMatePair(currentPage, nextPage)) return false

  const currentIsArtwork = isSpreadArtworkHalf(currentPage)
  const nextIsArtwork = isSpreadArtworkHalf(nextPage)
  if (currentIsArtwork === nextIsArtwork) return false

  const textSide = currentIsArtwork ? nextPage : currentPage
  return getCleanPageText(textSide).length >= SPREAD_ARTICLE_MIN_TEXT
}

/**
 * A page that has been (or should be) collapsed to a single full-page screenshot
 * is standalone and must never merge with a neighbour. Primary signal is the
 * metadata the screenshot stage writes; the structural fallback covers ads that
 * the per-document screenshot cap left un-converted.
 */
export function isScreenshotPage(page: PdfPageContent): boolean {
  const metadata = page.metadata as Record<string, any> | undefined
  if (metadata && (metadata.convertedToScreenshot || metadata.processedAsScreenshot || metadata.coverPage)) {
    return true
  }

  const elements = page.elements || []
  if (elements.length === 0) return false

  const images = elements.filter(isImageElement)
  if (images.length === 0) return false

  const textElements = getTextElements(page)

  // A page whose only content is image(s) with no body text is a screenshot/ad.
  if (textElements.length === 0) return true

  // Image-dominant with little text.
  const pageArea = page.width * page.height
  if (pageArea > 0) {
    const totalImageArea = images.reduce((sum, img) => {
      const bbox = normalizeBoundingBox(img.boundingBox)
      return sum + bbox.width * bbox.height
    }, 0)
    const coverage = Math.min(totalImageArea / pageArea, 1)
    const totalText = textElements.reduce((sum, el) => sum + getCleanText(el).length, 0)
    if (coverage >= SCREENSHOT_FALLBACK_COVERAGE && totalText < SCREENSHOT_FALLBACK_MAX_TEXT) {
      return true
    }
  }

  return false
}

/**
 * Characters of body copy on the page: real paragraphs set below display size.
 * Titles, standfirsts in display type and short labels do not count.
 */
function bodyCopyLength(page: PdfPageContent): number {
  let length = 0
  for (const element of getTextElements(page)) {
    if ((element.attributes?.fontSize || 0) >= SECTION_HEADING_FONT) continue
    const text = getCleanText(element)
    if (text.length >= MIN_BODY_PARAGRAPH) length += text.length
  }
  return length
}

/**
 * A cover: no text at all, or display type with little text and no real body
 * copy. A page with a large title and a few hundred characters of body is the
 * opening page of an article and may continue onto the next page.
 */
export function isCoverPage(page: PdfPageContent): boolean {
  const textElements = getTextElements(page)
  if (textElements.length === 0) return true

  const isShortText = getCleanPageText(page).length < COVER_MAX_TEXT
  if (!isShortText || bodyCopyLength(page) >= COVER_MAX_BODY_COPY) return false

  const headerRatio = getHeaderRatio(textElements)
  const hasLargeFonts = textElements.some(el => (el.attributes?.fontSize || 0) > LARGE_FONT)
  return headerRatio > COVER_HEADER_RATIO || hasLargeFonts
}

export function analyzeContentType(page: PdfPageContent): ContentType {
  if (isCoverPage(page)) return 'cover'
  if (isScreenshotPage(page)) return 'image'
  if (getCleanPageText(page).length > 500) return 'article'
  return 'mixed'
}

/**
 * Decide whether content flows continuously from currentPage into nextPage.
 *
 * `sharedRunningHead` is document-level evidence the caller computes (see
 * PdfPageComposer): both pages carry the same RARE running-head kicker (an
 * article subject line such as "stable fly", not a section label). It covers
 * continuations whose pages each end on a clean sentence boundary, which the
 * text-flow signals below cannot see.
 *
 * `articleHasTitle` is group-level evidence for the headless continuation
 * (isHeadlessContinuation): the article the current page belongs to has a
 * title. It defaults to the current page's own title; PdfPageComposer passes
 * it for the whole group, so a third page can follow a headless second one.
 *
 * `nextPage` is usually the page right after `currentPage`. PdfPageComposer
 * also asks about the page that follows one or two standalone pages (an ad
 * between two pages of one article), the decision is the same.
 */
export function hasContentContinuity(
  currentPage: PdfPageContent,
  nextPage: PdfPageContent,
  sharedRunningHead = false,
  articleHasTitle = hasArticleTitle(currentPage)
): boolean {
  // Two halves of one physical spread page forming one editorial unit
  // (article + its artwork) merge BEFORE the screenshot guard below: within
  // a spread, a full-page editorial image belongs to its mate's article.
  if (spreadMateContinuity(currentPage, nextPage)) return true

  // An article's opening photograph belongs to the text that follows it.
  if (openingPictureContinuity(currentPage, nextPage)) return true

  // Ads / screenshots are standalone and never merge.
  if (isScreenshotPage(currentPage) || isScreenshotPage(nextPage)) return false

  // A cover page does not continue forward.
  if (isCoverPage(currentPage)) return false

  // Explicit continuation markers (strongest signal) when page numbers are real.
  const currentMarkers = parseContinuationMarkers(currentPage)
  const nextMarkers = parseContinuationMarkers(nextPage)
  if (currentMarkers.toPage !== null && currentMarkers.toPage === nextPage.pageNumber) return true
  if (nextMarkers.fromPage !== null && nextMarkers.fromPage === currentPage.pageNumber) return true

  // The next page begins a new section/article -> not a continuation of this
  // one, unless what opens it is a sub-heading of this article under the same
  // running head.
  if (startsNewSection(nextPage)) {
    return sharedRunningHead && opensWithSubheadingOf(currentPage, nextPage)
  }

  // Continuation evidence from either side (a marker on either side also counts,
  // covering renumbered slices where the printed page number no longer matches).
  const markerFlow = currentMarkers.toPage !== null || nextMarkers.fromPage !== null
  return mainBodyEndsHanging(currentPage) || nextStartsMidSentence(nextPage)
    || nextStartsWithConnective(nextPage) || sharedRunningHead || markerFlow
    || (articleHasTitle && isHeadlessContinuation(currentPage, nextPage))
}
