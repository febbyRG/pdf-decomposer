import type { PdfElement } from '../../models/PdfElement.js'

// Two text runs are the same physical draw when their text matches and their
// boxes coincide within this tolerance (pt).
const DUPLICATE_TOLERANCE = 0.5

/**
 * Drop text runs that exactly duplicate an earlier run (same text, same
 * bounding box). Designed PDFs sometimes draw a display line twice at the
 * same position (overprint/registration duplicates); left in, the overlap
 * merge concatenates both copies into stuttered text ("C O N T E M P O R A R Y
 * C O N T E M P O R A R Y A R T A R T ...", davisart p7 TOC section label).
 * Runs with the same text at a DIFFERENT position are genuine repetition
 * (e.g. the same page number appearing twice on a TOC) and are kept.
 */
export function dropDuplicateRuns(elements: PdfElement[]): PdfElement[] {
  const kept: PdfElement[] = []
  for (const element of elements) {
    const box = element.boundingBox
    const duplicate = box && kept.some((other) => {
      if ((other.data ?? '') !== (element.data ?? '')) return false
      const otherBox = other.boundingBox
      if (!otherBox) return false
      return Math.abs(otherBox.top - box.top) <= DUPLICATE_TOLERANCE
        && Math.abs(otherBox.left - box.left) <= DUPLICATE_TOLERANCE
        && Math.abs(otherBox.width - box.width) <= DUPLICATE_TOLERANCE
        && Math.abs(otherBox.height - box.height) <= DUPLICATE_TOLERANCE
    })
    if (!duplicate) kept.push(element)
  }
  return kept
}
