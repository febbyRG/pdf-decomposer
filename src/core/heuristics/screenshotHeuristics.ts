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
}

export const DEFAULT_SCREENSHOT_THRESHOLDS: ScreenshotThresholds = {
  coverPageThreshold: 0.8,
  heroImageCoverageThreshold: 0.55,
  significantTextBlockThreshold: 300,
  adMaxTextChars: 600
}

// Tiled-cover detection (multiple distributed images). Internal, not tunable.
const MIN_IMAGE_COUNT = 3
const MIN_DISTRIBUTION_SCORE = 0.4

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
  const textElements = elements.filter(isTextElement)
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
  if (longestTextBlockChars >= thresholds.significantTextBlockThreshold) {
    return { convert: false, reason: `significant-text-content (${longestTextBlockChars} char block)` }
  }

  // 2. A single image covering almost the whole page (and, per the guard above,
  //    no long paragraph) is a cover / full-page visual.
  if (heroImageCoverage >= thresholds.coverPageThreshold) {
    return { convert: true, reason: `single-large-image (${(heroImageCoverage * 100).toFixed(1)}% coverage)` }
  }

  // 3. Hero-image ad: a dominant image with only short scattered promo text.
  if (heroImageCoverage >= thresholds.heroImageCoverageThreshold && totalTextChars <= thresholds.adMaxTextChars) {
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
