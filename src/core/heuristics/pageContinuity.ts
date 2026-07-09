import type { PdfElement } from '../../models/PdfElement.js'
import type { PdfPageContent } from '../../models/PdfPageContent.js'
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
 *  - an explicit "continued on/from page N" marker links them.
 *
 * Ads / covers / screenshots never merge.
 */

// Ad-aware structural fallback thresholds (metadata is the primary signal; these
// only matter when the screenshot stage left an image-dominant page un-converted).
const SCREENSHOT_FALLBACK_COVERAGE = 0.8
const SCREENSHOT_FALLBACK_MAX_TEXT = 600

// Cover detection.
const COVER_MAX_TEXT = 1000
const COVER_HEADER_RATIO = 0.6
const LARGE_FONT = 20

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

  const first = elements.find(isAnyTextElement)
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

export function isCoverPage(page: PdfPageContent): boolean {
  const textElements = getTextElements(page)
  if (textElements.length === 0) return true

  const isShortText = getCleanPageText(page).length < COVER_MAX_TEXT
  const headerRatio = getHeaderRatio(textElements)
  const hasLargeFonts = textElements.some(el => (el.attributes?.fontSize || 0) > LARGE_FONT)

  return (headerRatio > COVER_HEADER_RATIO && isShortText) || (hasLargeFonts && isShortText)
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
 */
export function hasContentContinuity(currentPage: PdfPageContent, nextPage: PdfPageContent, sharedRunningHead = false): boolean {
  // Ads / screenshots are standalone and never merge.
  if (isScreenshotPage(currentPage) || isScreenshotPage(nextPage)) return false

  // A cover page does not continue forward.
  if (isCoverPage(currentPage)) return false

  // Explicit continuation markers (strongest signal) when page numbers are real.
  const currentMarkers = parseContinuationMarkers(currentPage)
  const nextMarkers = parseContinuationMarkers(nextPage)
  if (currentMarkers.toPage !== null && currentMarkers.toPage === nextPage.pageNumber) return true
  if (nextMarkers.fromPage !== null && nextMarkers.fromPage === currentPage.pageNumber) return true

  // The next page begins a new section/article -> not a continuation of this one.
  if (startsNewSection(nextPage)) return false

  // Continuation evidence from either side (a marker on either side also counts,
  // covering renumbered slices where the printed page number no longer matches).
  const markerFlow = currentMarkers.toPage !== null || nextMarkers.fromPage !== null
  return mainBodyEndsHanging(currentPage) || nextStartsMidSentence(nextPage)
    || nextStartsWithConnective(nextPage) || sharedRunningHead || markerFlow
}
