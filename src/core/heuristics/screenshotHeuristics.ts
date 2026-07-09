import type { PdfElement } from '../../models/PdfElement.js'
import { computeImageDistribution, isImageElement, isTextElement, normalizeBoundingBox } from './elementUtils.js'
import { stripHtml } from './textUtils.js'

/**
 * Pure decision logic for whether a page should be collapsed to a single
 * full-page screenshot element (covers and full-page advertisements) instead of
 * being decomposed into text + images.
 *
 * The key discriminator is the LONGEST continuous text block, not the total text
 * length: a genuine editorial page has at least one long paragraph, whereas a
 * full-page ad only has short scattered promo fragments (headline, tagline,
 * bullets, legal line). The old "total text >= 200 chars" guard fired on those
 * scattered fragments and wrongly kept text-heavy ads as decomposed pages.
 */

export interface ScreenshotThresholds {
  /** Single/aggregate image coverage that marks a full-page visual. Default 0.8. */
  coverPageThreshold: number
  /** Hero-image coverage that flags an ad even when it also carries text. Default 0.55. */
  heroImageCoverageThreshold: number
  /** Longest continuous text block that marks real editorial content. Default 300. */
  significantTextBlockThreshold: number
  /** Max total text for a hero-image ad (above this it is treated as content). Default 600. */
  adMaxTextChars: number
  /**
   * Min distinct text elements for the editorial-guard exemption. Ads scatter
   * their copy across many boxes (headline, body, CTA, legal line, URL);
   * a photo-editorial page has only a title + caption + credit. Default 5.
   */
  adMinTextFragments: number
}

export const DEFAULT_SCREENSHOT_THRESHOLDS: ScreenshotThresholds = {
  coverPageThreshold: 0.8,
  heroImageCoverageThreshold: 0.55,
  significantTextBlockThreshold: 300,
  adMaxTextChars: 600,
  adMinTextFragments: 5
}

// Tiled-cover detection (multiple distributed images). Internal, not tunable.
const MIN_IMAGE_COUNT = 3
const MIN_DISTRIBUTION_SCORE = 0.4

// Legal fine print: the tiny-font trademark/disclaimer line at the foot of an
// ad. Editorial body copy runs ~9-12pt; legal lines run smaller.
const FINE_PRINT_MAX_FONT = 8.5

/**
 * Legal fine print is neither article substance the editorial guard should
 * protect nor promo copy: a 1,000+ char disclaimer on a full-page ad would
 * otherwise read as an "editorial paragraph" and keep the ad decomposed
 * (double-render downstream). Requires BOTH a tiny font AND legal markers, so
 * a genuine small-font body paragraph is never excluded.
 */
function isLegalFinePrint(element: PdfElement): boolean {
  const fontSize = element.attributes?.fontSize || 0
  if (fontSize <= 0 || fontSize > FINE_PRINT_MAX_FONT) return false
  const text = stripHtml(element.data || '')
  // Footnote/legal lead-in symbol.
  if (/^[\s"'']*[*†‡§©®]/.test(text)) return true
  // Trademark/legal symbol density.
  if ((text.match(/[®™©†‡§]/g) || []).length >= 2) return true
  return /\b(trademarks? (are|is) the property|all rights reserved|registered trademarks?)\b/i.test(text)
}

export interface ScreenshotInput {
  pageWidth: number
  pageHeight: number
  elements: PdfElement[]
}

export interface ScreenshotDecision {
  convert: boolean
  reason: string
}

export function decideScreenshot(
  input: ScreenshotInput,
  thresholds: ScreenshotThresholds = DEFAULT_SCREENSHOT_THRESHOLDS
): ScreenshotDecision {
  const { pageWidth, pageHeight, elements } = input

  if (!elements || elements.length === 0) {
    return { convert: false, reason: 'no-elements' }
  }

  const pageArea = pageWidth * pageHeight
  const images = elements.filter(isImageElement)

  if (images.length === 0) {
    return { convert: false, reason: 'no-images' }
  }

  // Image coverage signals (clamped so overlapping boxes cannot exceed the page).
  let heroImageCoverage = 0
  let totalImageArea = 0
  for (const image of images) {
    const bbox = normalizeBoundingBox(image.boundingBox)
    const area = bbox.width * bbox.height
    totalImageArea += area
    if (pageArea > 0) {
      heroImageCoverage = Math.max(heroImageCoverage, Math.min(area / pageArea, 1))
    }
  }
  const aggregateImageCoverage = pageArea > 0 ? Math.min(totalImageArea / pageArea, 1) : 0

  // Text signals: the longest single block is the editorial discriminator.
  // Legal fine print is excluded from every text signal (see isLegalFinePrint).
  const textElements = elements.filter(isTextElement).filter(element => !isLegalFinePrint(element))
  let totalTextChars = 0
  let longestTextBlockChars = 0
  for (const element of textElements) {
    const length = stripHtml(element.data || '').length
    totalTextChars += length
    longestTextBlockChars = Math.max(longestTextBlockChars, length)
  }

  // 1. Editorial guard (runs FIRST): a page with at least one long continuous
  //    paragraph is real article content and must stay decomposed even when a
  //    full-bleed background image covers the whole page. This has to precede the
  //    image-coverage checks below, otherwise an article laid over a full-page
  //    background (image coverage ~1.0 + body text on top) is wrongly collapsed
  //    to a screenshot. A genuine cover / full-page ad has only short scattered
  //    text, so this guard does not fire on it.
  //
  //    Exemption: when the hero-image-ad signals hold (dominant image, the
  //    page's ENTIRE text fits in adMaxTextChars, AND the text is scattered
  //    across adMinTextFragments+ boxes — the ad layout pattern of headline /
  //    body / CTA / legal / URL), the guard is skipped. Such a page has no
  //    article substance to protect, and a single marketing paragraph can
  //    exceed the block threshold on its own (mivision Rohto ad: 333-char promo
  //    block, 518 total, 66.7% hero, 6 fragments) — without the exemption
  //    text-heavy ads stay decomposed and double-render in the reader (ad image
  //    + transcribed promo text). The fragment minimum keeps photo-editorial
  //    pages (full-bleed photo + one long caption + credit, 1-3 fragments)
  //    decomposed: for those the long block IS the substance.
  const heroAdSignals = heroImageCoverage >= thresholds.heroImageCoverageThreshold
    && totalTextChars <= thresholds.adMaxTextChars
  // Nullish fallback: callers may pass a thresholds object built before this
  // field existed, and `count >= undefined` would silently disable the exemption.
  const minTextFragments = thresholds.adMinTextFragments ?? DEFAULT_SCREENSHOT_THRESHOLDS.adMinTextFragments
  const guardExempt = heroAdSignals && textElements.length >= minTextFragments
  if (!guardExempt && longestTextBlockChars >= thresholds.significantTextBlockThreshold) {
    return { convert: false, reason: `significant-text-content (${longestTextBlockChars} char block)` }
  }

  // 2. A single image covering almost the whole page (and, per the guard above,
  //    no long paragraph) is a cover / full-page visual.
  if (heroImageCoverage >= thresholds.coverPageThreshold) {
    return { convert: true, reason: `single-large-image (${(heroImageCoverage * 100).toFixed(1)}% coverage)` }
  }

  // 3. Hero-image ad: a dominant image with only short scattered promo text.
  if (heroAdSignals) {
    return {
      convert: true,
      reason: `hero-image-ad (${(heroImageCoverage * 100).toFixed(1)}% hero, ${totalTextChars} text chars)`
    }
  }

  // 4. Tiled cover: several images spread across the page with high coverage.
  if (images.length >= MIN_IMAGE_COUNT && aggregateImageCoverage >= thresholds.coverPageThreshold) {
    const distribution = computeImageDistribution(images, pageWidth, pageHeight)
    if (distribution.distributionScore >= MIN_DISTRIBUTION_SCORE) {
      return {
        convert: true,
        reason: `tiled-images (${images.length} images, ${(aggregateImageCoverage * 100).toFixed(1)}% coverage)`
      }
    }
  }

  return { convert: false, reason: 'insufficient-coverage' }
}
