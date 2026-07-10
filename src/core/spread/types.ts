/**
 * Shared types for spread handling (detection → partition → renumber).
 *
 * A "spread" is a PDF whose every physical page is a two-page magazine spread
 * exported as one landscape page (left+right magazine pages side by side).
 * Splitting turns each physical page into two logical portrait-ish pages so
 * every downstream stage (element/clean/page composers, consumers) operates
 * on normal single-page geometry.
 */

/** How decompose() treats spread pages. */
export type SpreadHandling =
  /** No detection, no splitting. Existing behaviour, the default. */
  | 'off'
  /** Detect document-level spread evidence and split only when confident. */
  | 'auto'
  /** Skip detection and split every landscape page. Escape hatch when auto misjudges. */
  | 'split'

/** Which part of the physical page a logical page represents. */
export type SpreadHalf = 'left' | 'right' | 'full'

/**
 * Source identity of a logical page after splitting. Attached as
 * `page.metadata.spread`. Downstream code that touches the physical PDF
 * (screenshot rasterization) MUST resolve pages through this instead of
 * assuming `pageIndex + 1` is a PDF page number.
 */
export interface SpreadSourceInfo {
  /** 0-based index of the physical PDF page this logical page came from. */
  sourcePageIndex: number
  /** 1-based PDF page number of the physical page. */
  sourcePageNumber: number
  /** 'left'/'right' for split halves, 'full' for pages kept whole in a split document. */
  half: SpreadHalf
}

/**
 * The half to crop when rasterizing this logical page from its physical
 * source page, or null when the page renders whole ('full' pages and
 * non-spread pages). Single source of truth for every rasterization site.
 */
export function spreadCropHalf(spread: SpreadSourceInfo | null | undefined): 'left' | 'right' | null {
  return spread && (spread.half === 'left' || spread.half === 'right') ? spread.half : null
}

/** Minimal structural shape the detection/partition logic needs from a page. */
export interface SpreadCandidatePage {
  pageIndex: number
  pageNumber: number
  width: number
  height: number
  elements: SpreadCandidateElement[]
}

/** Minimal structural shape the detection/partition logic needs from an element. */
export interface SpreadCandidateElement {
  type: string
  data?: string
  boundingBox: {
    top: number
    left: number
    bottom: number
    right: number
    width: number
    height: number
  }
}

/** Per-page evidence gathered by the detector, kept for logging/debugging. */
export interface SpreadPageEvidence {
  pageNumber: number
  isLandscape: boolean
  /** Pages with too few elements abstain instead of voting. */
  eligible: boolean
  /** Fraction of elements whose box meaningfully crosses the vertical midline. */
  crossingFraction: number
  /** Adjacent page-number pair found in the top/bottom margin bands (e.g. 736|737). */
  folioPair: boolean
  votesSpread: boolean
}

/** Document-level detection outcome. */
export interface SpreadDetectionResult {
  isSpreadDocument: boolean
  /** Human-readable reason for the decision, for observability. */
  reason: string
  pages: SpreadPageEvidence[]
}

/**
 * Aspect ratio (width/height) above which a page is even considered a spread
 * candidate. A4 spreads are ~1.41, US Letter spreads ~1.55, square-page
 * spreads 2.0. Kept below all of those but above portrait (< 1).
 */
export const SPREAD_MIN_LANDSCAPE_ASPECT = 1.25

/**
 * An element "crosses" the midline only when it extends beyond it by more
 * than this fraction of the page width ON BOTH sides. Text runs that merely
 * touch the centerline (justified text ending near the gutter) do not count.
 */
export const SPREAD_CROSSING_SLACK_RATIO = 0.02

/**
 * A page votes "spread" when at most this fraction of its elements cross the
 * midline. True spreads have an empty gutter: body text never crosses, and a
 * rare full-width visual (a panoramic photo) stays under this bound because
 * it is one element among hundreds.
 */
export const SPREAD_MAX_CROSSING_FRACTION = 0.1

/**
 * Pages with fewer elements than this abstain from voting: a full-bleed cover
 * (one image + a title) carries no gutter evidence either way. Abstaining
 * pages still get split once the document-level decision is "spread".
 */
export const SPREAD_MIN_ELEMENTS_TO_VOTE = 8

/** Folio numbers live in the top/bottom margin bands (fraction of page height). */
export const SPREAD_FOLIO_BAND_RATIO = 0.08

/**
 * Document is a spread when at least this fraction of eligible landscape
 * pages vote spread, with a minimum of two votes so a single odd page cannot
 * flip a whole document.
 */
export const SPREAD_MIN_VOTE_FRACTION = 0.5
export const SPREAD_MIN_VOTES = 2

/**
 * A spread export is landscape THROUGHOUT. A portrait document containing a
 * few rotated landscape pages (data tables, wide charts) must never be
 * declared a spread, however clean those pages' gutters look.
 */
export const SPREAD_MIN_LANDSCAPE_DOC_FRACTION = 0.5
