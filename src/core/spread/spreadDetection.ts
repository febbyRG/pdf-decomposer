/**
 * Document-level spread detection.
 *
 * Aspect ratio alone cannot identify a spread: an A4 spread (1.41) has the
 * same aspect as a single A4 landscape page, and 16:9 slide decks (1.78) sit
 * between Letter spreads (1.55) and square-page spreads (2.0). The reliable
 * signal is CONTENT evidence: a true spread has an empty vertical gutter at
 * the midline (elements do not cross it) and often carries a folio pair
 * (adjacent page numbers printed on the two halves, e.g. 736|737).
 *
 * The decision is made once per document, not per page, so evidence-free
 * pages (a full-bleed cover photo) follow the document verdict instead of
 * being left unsplit in an otherwise split document.
 */

import {
  SPREAD_CROSSING_SLACK_RATIO,
  SPREAD_FOLIO_BAND_RATIO,
  SPREAD_MAX_CROSSING_FRACTION,
  SPREAD_MIN_ELEMENTS_TO_VOTE,
  SPREAD_MIN_LANDSCAPE_ASPECT,
  SPREAD_MIN_LANDSCAPE_DOC_FRACTION,
  SPREAD_MIN_VOTES,
  SPREAD_MIN_VOTE_FRACTION,
  type SpreadCandidateElement,
  type SpreadCandidatePage,
  type SpreadDetectionResult,
  type SpreadPageEvidence
} from './types.js'

/** A page is a spread candidate only when clearly landscape. */
export function isLandscapePage(page: { width: number; height: number }): boolean {
  return page.height > 0 && page.width / page.height >= SPREAD_MIN_LANDSCAPE_ASPECT
}

/**
 * True when the element extends beyond the vertical midline by more than the
 * slack margin on BOTH sides. Touching the centerline is not crossing.
 */
export function crossesMidline(
  element: SpreadCandidateElement,
  pageWidth: number
): boolean {
  const midX = pageWidth / 2
  const slack = pageWidth * SPREAD_CROSSING_SLACK_RATIO
  const { left, right } = element.boundingBox
  return midX - left > slack && right - midX > slack
}

/**
 * Folio pair: two numeric-only text elements inside the top or bottom margin
 * band, one on each half, with adjacent values (left = right - 1 in LTR
 * publications, either order accepted). Strong direct evidence that the two
 * halves are distinct numbered pages.
 */
export function hasFolioPair(page: SpreadCandidatePage): boolean {
  const bandHeight = page.height * SPREAD_FOLIO_BAND_RATIO
  const midX = page.width / 2

  const folios = page.elements
    .filter(el => el.type === 'text')
    .map(el => ({
      value: typeof el.data === 'string' ? el.data.trim() : '',
      centerX: (el.boundingBox.left + el.boundingBox.right) / 2,
      centerY: (el.boundingBox.top + el.boundingBox.bottom) / 2
    }))
    .filter(el => /^\d{1,4}$/.test(el.value))
    .filter(el => el.centerY <= bandHeight || el.centerY >= page.height - bandHeight)

  const leftNumbers = folios.filter(f => f.centerX < midX).map(f => parseInt(f.value, 10))
  const rightNumbers = folios.filter(f => f.centerX >= midX).map(f => parseInt(f.value, 10))

  return leftNumbers.some(l => rightNumbers.some(r => Math.abs(l - r) === 1))
}

/** Gather per-page spread evidence. Exported for the orchestrator's logging. */
export function collectPageEvidence(page: SpreadCandidatePage): SpreadPageEvidence {
  const isLandscape = isLandscapePage(page)
  if (!isLandscape) {
    return {
      pageNumber: page.pageNumber,
      isLandscape: false,
      eligible: false,
      crossingFraction: 0,
      folioPair: false,
      votesSpread: false
    }
  }

  const elementCount = page.elements.length
  const eligible = elementCount >= SPREAD_MIN_ELEMENTS_TO_VOTE
  const crossingCount = page.elements.filter(el => crossesMidline(el, page.width)).length
  const crossingFraction = elementCount > 0 ? crossingCount / elementCount : 0
  const folioPair = hasFolioPair(page)

  // Gutter evidence carries the vote; a folio pair independently confirms a
  // spread even when unusual geometry pushes the crossing fraction up.
  const votesSpread = eligible && (crossingFraction <= SPREAD_MAX_CROSSING_FRACTION || folioPair)

  return {
    pageNumber: page.pageNumber,
    isLandscape,
    eligible,
    crossingFraction,
    folioPair,
    votesSpread
  }
}

/**
 * Decide once for the whole document whether landscape pages are spreads.
 * Requires a clear majority of eligible landscape pages voting spread, with
 * an absolute minimum of votes so one odd page cannot flip a document.
 */
export function detectSpreadDocument(pages: SpreadCandidatePage[]): SpreadDetectionResult {
  const evidence = pages.map(collectPageEvidence)

  const landscapePages = evidence.filter(e => e.isLandscape)
  if (landscapePages.length === 0) {
    return { isSpreadDocument: false, reason: 'no landscape pages', pages: evidence }
  }

  // A spread export is landscape throughout. A portrait document with a few
  // rotated landscape pages (data tables) must never be declared a spread.
  if (landscapePages.length / pages.length < SPREAD_MIN_LANDSCAPE_DOC_FRACTION) {
    return {
      isSpreadDocument: false,
      reason: `only ${landscapePages.length}/${pages.length} pages are landscape (portrait document with rotated pages)`,
      pages: evidence
    }
  }

  const eligiblePages = landscapePages.filter(e => e.eligible)
  const votes = eligiblePages.filter(e => e.votesSpread).length

  if (eligiblePages.length === 0) {
    return {
      isSpreadDocument: false,
      reason: `no landscape page has enough elements to vote (${landscapePages.length} landscape, all abstained)`,
      pages: evidence
    }
  }

  const voteFraction = votes / eligiblePages.length
  const isSpreadDocument = votes >= SPREAD_MIN_VOTES && voteFraction >= SPREAD_MIN_VOTE_FRACTION

  const reason = `${votes}/${eligiblePages.length} eligible landscape pages vote spread` +
    ` (${landscapePages.length - eligiblePages.length} abstained)`

  return { isSpreadDocument, reason, pages: evidence }
}
