import type { PdfElement } from '../../models/PdfElement.js'

/**
 * Shared types for the element-composition pipeline (overlap merge → reading
 * order → text-type classification). Pure data shapes, no logic.
 */

/** Fully-resolved bounding box used throughout the composer. */
export interface CompositeBox {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

/** Internal working unit: one or more raw text elements merged together. */
export interface Composite {
  id: string
  data: string
  formattedData?: string
  boundingBox: CompositeBox
  attributes: {
    fontSize: number
    fontFamily?: string
    type?: string
    composed?: boolean
  }
  originalElements: PdfElement[]
}

/** Character-weighted page statistics driving the composer's dynamic thresholds. */
export interface CompositePageStats {
  averageFontSize: number
  totalCharacters: number
  pageWidth: number
}

/** A column boundary detected on the page (stage-1 merge constraint form). */
export interface ColumnBoundary {
  left: number
  right: number
}

/** A detected column with its member composites (stage-2 reading-order form). */
export interface DetectedColumn {
  leftBoundary: number
  rightBoundary: number
  elements: Composite[]
}

/**
 * Character-weighted page statistics from composites: long paragraphs dominate
 * the average font size instead of being outvoted by many small fragments.
 */
export function calculatePageStatistics(composites: Composite[]): CompositePageStats {
  const weightedPairs = composites.map(comp => [comp.attributes.fontSize, comp.data.length])
  const totalCharacters = weightedPairs.reduce((sum, [, charCount]) => sum + charCount, 0)
  const aggregatedSum = weightedPairs.reduce((sum, [fontSize, charCount]) => sum + fontSize * charCount, 0)
  const averageFontSize = totalCharacters > 0 ? aggregatedSum / totalCharacters : 12

  // Effective page width from composite bounding boxes
  const rightMost = composites.reduce((max, c) => Math.max(max, c.boundingBox.right), 0)
  const leftMost = composites.reduce((min, c) => Math.min(min, c.boundingBox.left), rightMost)
  const pageWidth = rightMost - leftMost

  return { averageFontSize, totalCharacters, pageWidth }
}

/**
 * Meaningful-text filter: drops empty, whitespace-only, control-character, and
 * single punctuation runs before composition. Anything passing this filter is
 * covered by the pipeline's preservation invariant (it must reach the output).
 */
export function isMeaningfulText(text: string | undefined): boolean {
  if (!text || text.trim().length === 0) return false

  // Filter out control characters and non-printable Unicode characters
  const cleanText = text.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '').trim()
  if (cleanText.length === 0) return false

  // Filter out strings that are only whitespace, punctuation, or single characters
  if (cleanText.length < 2 && /^[\s\W]$/.test(cleanText)) return false

  return true
}
