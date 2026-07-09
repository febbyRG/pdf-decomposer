import { mergeDropCaps } from './composer/dropCaps.js'
import { convertToComposites, mergeOverlappingComposites } from './composer/overlapMerge.js'
import { orderComposites } from './composer/readingOrder.js'
import { classifyTextTypes } from './composer/textTypes.js'
import { isMeaningfulText, type Composite } from './composer/types.js'
import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'

/**
 * Element composition pipeline: groups raw text runs into paragraphs and
 * headings in reading order, preserving images.
 *
 * Three stages, each a pure module under ./composer/:
 *   1. overlapMerge   - spatial merging of runs into composites (column-aware)
 *   2. readingOrder   - human reading order (preservation invariant: the
 *                       output is a permutation of the input, never a filter)
 *   3. textTypes      - h1-h5 / paragraph classification by font size
 * plus dropCaps (decorative first letters merged back into their paragraph).
 */
export class PdfElementComposer {
  /**
   * Compose elements by grouping text elements into paragraphs while preserving images.
   * @param pages Array of PDF page content with raw elements
   * @returns Array of PDF page content with composed elements (paragraphs + images)
   */
  static composeElements(pages: PdfPageContent[]): PdfPageContent[] {
    return pages.map(page => ({
      ...page,
      elements: this.composePageElements(page.elements)
    }))
  }

  /**
   * Compose elements for a single page.
   */
  private static composePageElements(elements: PdfElement[]): PdfElement[] {
    // Separate text and non-text elements
    const textElements = elements.filter(el => el.type === 'text' && isMeaningfulText(el.formattedData || el.data))
    const nonTextElements = elements.filter(el => el.type !== 'text')

    if (textElements.length === 0) return elements

    let composites = convertToComposites(textElements)
    composites = mergeOverlappingComposites(composites)
    composites = orderComposites(composites)
    composites = classifyTextTypes(composites)

    let processedElements = this.convertToElements(composites)
    processedElements = mergeDropCaps(processedElements)

    return this.interleaveWithNonText(processedElements, nonTextElements)
  }

  /**
   * Convert composites back to PdfElements, mapping the stage-3 classification
   * onto the element type.
   */
  private static convertToElements(composites: Composite[]): PdfElement[] {
    return composites.map(composite => {
      const firstOriginal = composite.originalElements[0]

      let elementType = firstOriginal.type
      if (composite.attributes.type === 'paragraph') {
        elementType = 'paragraph'
      } else if (['h1', 'h2', 'h3', 'h4', 'h5'].includes(composite.attributes.type || '')) {
        elementType = 'header'
      }

      return {
        ...firstOriginal,
        type: elementType,
        data: composite.data,
        formattedData: composite.formattedData || composite.data,
        boundingBox: {
          top: composite.boundingBox.top,
          left: composite.boundingBox.left,
          width: composite.boundingBox.width,
          height: composite.boundingBox.height
        },
        attributes: {
          ...firstOriginal.attributes,
          fontSize: composite.attributes.fontSize,
          fontFamily: composite.attributes.fontFamily,
          type: composite.attributes.type,
          composed: composite.attributes.composed
        }
      }
    })
  }

  /**
   * Merge text and non-text elements while preserving the algorithmic order of
   * the text elements. Non-text elements are position-sorted and interleaved
   * by vertical position.
   */
  private static interleaveWithNonText(textElements: PdfElement[], nonTextElements: PdfElement[]): PdfElement[] {
    const sortedNonTextElements = nonTextElements.sort((a, b) => {
      const aTop = a.boundingBox?.top || 0
      const bTop = b.boundingBox?.top || 0
      const yDiff = aTop - bTop

      if (Math.abs(yDiff) > 10) return yDiff

      const aLeft = a.boundingBox?.left || 0
      const bLeft = b.boundingBox?.left || 0
      return aLeft - bLeft
    })

    const finalElements: PdfElement[] = []
    let textIndex = 0
    let nonTextIndex = 0

    while (textIndex < textElements.length || nonTextIndex < sortedNonTextElements.length) {
      const textEl = textIndex < textElements.length ? textElements[textIndex] : null
      const nonTextEl = nonTextIndex < sortedNonTextElements.length ? sortedNonTextElements[nonTextIndex] : null

      if (!textEl) {
        if (nonTextEl) {
          finalElements.push(nonTextEl)
        }
        nonTextIndex++
      } else if (!nonTextEl) {
        finalElements.push(textEl)
        textIndex++
      } else {
        const textTop = textEl.boundingBox?.top || 0
        const nonTextTop = nonTextEl.boundingBox?.top || 0

        if (textTop <= nonTextTop + 10) { // Text element comes first or same line
          finalElements.push(textEl)
          textIndex++
        } else {
          finalElements.push(nonTextEl)
          nonTextIndex++
        }
      }
    }

    return finalElements
  }
}
