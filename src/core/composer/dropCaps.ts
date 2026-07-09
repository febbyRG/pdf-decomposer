import type { PdfElement } from '../../models/PdfElement.js'

/**
 * Drop-cap handling: a decorative oversized first letter extracts as its own
 * "header" element; merge it back into the paragraph it opens.
 */

// Drop caps are 1-3 characters (typically one letter).
const MAX_DROP_CAP_LENGTH = 3
// The drop cap font must dominate the paragraph font by at least this factor.
const MIN_FONT_RATIO = 2
// The paragraph must start within this vertical distance of the drop cap.
const MAX_VERTICAL_DISTANCE_PT = 50

/**
 * Merge drop caps with their following paragraphs. Pair-wise pass: a merge
 * consumes both elements, everything else passes through unchanged.
 */
export function mergeDropCaps(elements: PdfElement[]): PdfElement[] {
  if (elements.length === 0) return elements

  const result: PdfElement[] = []
  let i = 0

  while (i < elements.length) {
    const currentElement = elements[i]
    const nextElement = i + 1 < elements.length ? elements[i + 1] : null

    if (nextElement && isDropCap(currentElement, nextElement)) {
      result.push(mergeDropCapWithParagraph(currentElement, nextElement))
      i += 2 // Skip both elements as they're merged
    } else {
      result.push(currentElement)
      i++
    }
  }

  return result
}

/**
 * A drop cap is a very short, much larger "header" immediately above/beside
 * the paragraph it opens.
 */
function isDropCap(element: PdfElement, nextElement: PdfElement): boolean {
  if (!element || !nextElement) return false

  // Must be a header (large font) followed by a paragraph
  if (element.type !== 'header' || nextElement.type !== 'paragraph') return false

  const text = (element.data || '').trim()
  const fontSize = element.attributes?.fontSize || 0
  const nextFontSize = nextElement.attributes?.fontSize || 0

  const isShortText = text.length <= MAX_DROP_CAP_LENGTH
  const isLargeFont = fontSize > nextFontSize * MIN_FONT_RATIO
  const isVerticallyClose = areVerticallyClose(element, nextElement, MAX_VERTICAL_DISTANCE_PT)

  return isShortText && isLargeFont && isVerticallyClose
}

function areVerticallyClose(element1: PdfElement, element2: PdfElement, threshold: number): boolean {
  const top2 = element2.boundingBox?.top || 0
  const bottom1 = (element1.boundingBox?.top || 0) + (element1.boundingBox?.height || 0)

  const verticalDistance = Math.abs(top2 - bottom1)
  return verticalDistance <= threshold
}

function mergeDropCapWithParagraph(dropCap: PdfElement, paragraph: PdfElement): PdfElement {
  const dropCapText = (dropCap.data || '').trim()
  const paragraphText = (paragraph.data || '').trim()

  const combinedText = dropCapText + paragraphText

  // Use the paragraph's bounding box as the main area, extended to include the drop cap
  const combinedBoundingBox = {
    top: Math.min(dropCap.boundingBox?.top || 0, paragraph.boundingBox?.top || 0),
    left: Math.min(dropCap.boundingBox?.left || 0, paragraph.boundingBox?.left || 0),
    width: Math.max(
      (dropCap.boundingBox?.left || 0) + (dropCap.boundingBox?.width || 0),
      (paragraph.boundingBox?.left || 0) + (paragraph.boundingBox?.width || 0)
    ) - Math.min(dropCap.boundingBox?.left || 0, paragraph.boundingBox?.left || 0),
    height: Math.max(
      (dropCap.boundingBox?.top || 0) + (dropCap.boundingBox?.height || 0),
      (paragraph.boundingBox?.top || 0) + (paragraph.boundingBox?.height || 0)
    ) - Math.min(dropCap.boundingBox?.top || 0, paragraph.boundingBox?.top || 0)
  }

  const combinedFormattedData = combineDropCapFormatting(dropCap, paragraph)

  return {
    ...paragraph, // Use paragraph as base
    data: combinedText,
    formattedData: combinedFormattedData,
    boundingBox: combinedBoundingBox,
    attributes: {
      ...paragraph.attributes,
      composed: true
    }
  }
}

/**
 * Styled drop-cap letter prepended to the paragraph's formatted content.
 */
function combineDropCapFormatting(dropCap: PdfElement, paragraph: PdfElement): string {
  const paragraphFormatted = paragraph.formattedData || paragraph.data || ''

  const dropCapText = (dropCap.data || '').trim()
  const paragraphText = (paragraph.data || '').trim()

  if (!dropCapText || !paragraphText) {
    return paragraphFormatted
  }

  const dropCapStyled = `<span style="font-size: ${dropCap.attributes?.fontSize}px; font-family: ${dropCap.attributes?.fontFamily}"><strong>${dropCapText}</strong></span>`

  return `${dropCapStyled}${paragraphFormatted}`
}
