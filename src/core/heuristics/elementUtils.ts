import type { PdfElement } from '../../models/PdfElement.js'

/**
 * Element-level geometry and type helpers shared by the screenshot and page
 * continuity heuristics. Pure functions with no I/O so they can be unit-tested
 * without rendering a PDF.
 */

export interface NormalizedBox {
  top: number
  left: number
  width: number
  height: number
}

/**
 * Normalize a bounding box (array or object form) to { top, left, width, height }.
 * Mirrors the historical PdfCleanComposer behaviour (uses `||` fallbacks) so the
 * existing cleaning/cover paths keep the exact same numbers.
 */
export function normalizeBoundingBox(boundingBox: any): NormalizedBox {
  if (Array.isArray(boundingBox)) {
    // Format: [left, top, width, height] or [top, left, width, height].
    const [a, b, width, height] = boundingBox
    return {
      left: Math.min(a, b),
      top: Math.max(a, b),
      width: width || 0,
      height: height || 0
    }
  }

  if (boundingBox && typeof boundingBox === 'object') {
    return {
      top: boundingBox.top || boundingBox.y || 0,
      left: boundingBox.left || boundingBox.x || 0,
      width: boundingBox.width || 0,
      height: boundingBox.height || 0
    }
  }

  return { top: 0, left: 0, width: 0, height: 0 }
}

export function isImageElement(element: PdfElement): boolean {
  return element.type === 'image'
}

/**
 * Broad text test used by screenshot detection: paragraph / heading / text or an
 * h1..h6 tag. Matches the original PdfCleanComposer.isTextElement.
 */
export function isTextElement(element: PdfElement): boolean {
  return element.type === 'paragraph'
    || element.type === 'heading'
    || element.type === 'text'
    || (typeof element.type === 'string' && element.type.startsWith('h'))
}

export function boundingBoxArea(element: PdfElement): number {
  const bbox = normalizeBoundingBox(element.boundingBox)
  return bbox.width * bbox.height
}

/**
 * Spread of an image cluster across the page (0-1), the minimum of the width and
 * height coverage of the union bounding box. High only when images are spread in
 * BOTH dimensions, which distinguishes a tiled cover from a single banner.
 */
export function computeImageDistribution(
  imageElements: PdfElement[],
  pageWidth: number,
  pageHeight: number
): { distributionScore: number, widthCoverage: number, heightCoverage: number } {
  if (imageElements.length === 0) {
    return { distributionScore: 0, widthCoverage: 0, heightCoverage: 0 }
  }

  let minX = pageWidth
  let maxX = 0
  let minY = pageHeight
  let maxY = 0

  for (const element of imageElements) {
    const bbox = normalizeBoundingBox(element.boundingBox)
    minX = Math.min(minX, bbox.left)
    maxX = Math.max(maxX, bbox.left + bbox.width)
    minY = Math.min(minY, bbox.top)
    maxY = Math.max(maxY, bbox.top + bbox.height)
  }

  const widthCoverage = pageWidth > 0 ? Math.max(0, maxX - minX) / pageWidth : 0
  const heightCoverage = pageHeight > 0 ? Math.max(0, maxY - minY) / pageHeight : 0

  return {
    distributionScore: Math.min(widthCoverage, heightCoverage),
    widthCoverage,
    heightCoverage
  }
}
