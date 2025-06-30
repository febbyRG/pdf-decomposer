import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'

/**
 * PdfElementComposer groups individual text elements into paragraphs for better document structure.
 * This is particularly useful for PDF-to-HTML conversion workflows.
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
    const textElements = elements.filter(el => el.type === 'text' && this.isMeaningfulText(el.formattedData || el.data))
    const nonTextElements = elements.filter(el => el.type !== 'text')

    // Group text elements into paragraphs
    const paragraphs = this.groupIntoParagraphs(textElements)

    // Combine paragraphs and non-text elements, sorted by reading order
    const allElements = [...paragraphs, ...nonTextElements].sort((a, b) => {
      const aTop = a.boundingBox?.top || 0
      const bTop = b.boundingBox?.top || 0
      const yDiff = aTop - bTop

      // If elements are on different lines (vertical difference > 10), sort by top position
      if (Math.abs(yDiff) > 10) return yDiff

      // Same line, sort by left position
      const aLeft = a.boundingBox?.left || 0
      const bLeft = b.boundingBox?.left || 0
      return aLeft - bLeft
    })

    return allElements
  }

  /**
   * Group text elements into paragraphs based on spatial proximity and formatting.
   */
  private static groupIntoParagraphs(textElements: PdfElement[]): PdfElement[] {
    if (textElements.length === 0) return []

    // Sort text elements by reading order (top to bottom, then left to right)
    const sortedElements = [...textElements].sort((a, b) => {
      const aTop = a.boundingBox?.top || 0
      const bTop = b.boundingBox?.top || 0
      const yDiff = aTop - bTop

      if (Math.abs(yDiff) > 10) return yDiff // Different lines

      const aLeft = a.boundingBox?.left || 0
      const bLeft = b.boundingBox?.left || 0
      return aLeft - bLeft // Same line, left to right
    })

    const paragraphs: PdfElement[] = []
    let currentParagraph: PdfElement[] = []

    for (let i = 0; i < sortedElements.length; i++) {
      const current = sortedElements[i]
      const previous = i > 0 ? sortedElements[i - 1] : null

      // Start a new paragraph if:
      // 1. This is the first element
      // 2. Vertical gap is large (more than 1.5x font size)
      // 3. Font size differs significantly (more than 2 points)
      // 4. Horizontal alignment changes significantly (new column/section)
      const shouldStartNewParagraph = !previous ||
        this.hasLargeVerticalGap(current, previous) ||
        this.hasFontSizeChange(current, previous) ||
        this.hasHorizontalAlignmentChange(current, previous)

      if (shouldStartNewParagraph && currentParagraph.length > 0) {
        // Finalize the current paragraph
        const composedParagraph = this.createComposedParagraph(currentParagraph)
        paragraphs.push(composedParagraph)
        currentParagraph = []
      }

      currentParagraph.push(current)
    }

    // Add the final paragraph
    if (currentParagraph.length > 0) {
      const composedParagraph = this.createComposedParagraph(currentParagraph)
      paragraphs.push(composedParagraph)
    }

    return paragraphs
  }

  /**
   * Check if there's a large vertical gap between two elements.
   */
  private static hasLargeVerticalGap(current: PdfElement, previous: PdfElement): boolean {
    const currentTop = current.boundingBox?.top || 0
    const previousBottom = (previous.boundingBox?.top || 0) + (previous.boundingBox?.height || 0)
    const previousFontSize = previous.attributes?.fontSize || 12

    const verticalGap = currentTop - previousBottom
    return verticalGap > (previousFontSize * 1.5)
  }

  /**
   * Check if there's a significant font size change between two elements.
   */
  private static hasFontSizeChange(current: PdfElement, previous: PdfElement): boolean {
    const currentFontSize = current.attributes?.fontSize || 12
    const previousFontSize = previous.attributes?.fontSize || 12

    return Math.abs(currentFontSize - previousFontSize) > 2
  }

  /**
   * Check if there's a significant horizontal alignment change.
   */
  private static hasHorizontalAlignmentChange(current: PdfElement, previous: PdfElement): boolean {
    const currentLeft = current.boundingBox?.left || 0
    const previousLeft = previous.boundingBox?.left || 0

    return Math.abs(currentLeft - previousLeft) > 50
  }

  /**
   * Create a composed paragraph element from multiple text elements.
   */
  private static createComposedParagraph(elements: PdfElement[]): PdfElement {
    // Calculate paragraph bounding box
    const bounds = this.calculateParagraphBounds(elements)

    // Combine text content
    const paragraphText = elements.map(el => el.formattedData || el.data).join(' ')

    // Calculate average font size
    const avgFontSize = elements.reduce((sum, el) => sum + (el.attributes?.fontSize || 12), 0) / elements.length

    // Use the first element as base and modify it
    const firstElement = elements[0]

    return {
      ...firstElement,
      type: 'paragraph', // New type for composed paragraphs
      boundingBox: bounds,
      data: paragraphText,
      formattedData: paragraphText,
      attributes: {
        ...firstElement.attributes,
        fontSize: Math.round(avgFontSize * 10) / 10, // Round to 1 decimal place
        composed: true // Mark as composed element
      }
    }
  }

  /**
   * Calculate the bounding box that encompasses all elements in a paragraph.
   */
  private static calculateParagraphBounds(elements: PdfElement[]): { top: number, left: number, bottom: number, right: number, width: number, height: number } {
    const tops = elements.map(el => el.boundingBox?.top || 0)
    const lefts = elements.map(el => el.boundingBox?.left || 0)
    const bottoms = elements.map(el => (el.boundingBox?.top || 0) + (el.boundingBox?.height || 0))
    const rights = elements.map(el => (el.boundingBox?.left || 0) + (el.boundingBox?.width || 0))

    const minTop = Math.min(...tops)
    const minLeft = Math.min(...lefts)
    const maxBottom = Math.max(...bottoms)
    const maxRight = Math.max(...rights)

    return {
      top: minTop,
      left: minLeft,
      bottom: maxBottom,
      right: maxRight,
      width: maxRight - minLeft,
      height: maxBottom - minTop
    }
  }

  /**
   * Check if text content is meaningful (filters out empty, whitespace-only, or control character text).
   */
  private static isMeaningfulText(text: string | undefined): boolean {
    if (!text || text.trim().length === 0) return false

    // Filter out control characters and non-printable Unicode characters
    const cleanText = text.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '').trim()
    if (cleanText.length === 0) return false

    // Filter out strings that are only whitespace, punctuation, or single characters
    if (cleanText.length < 2 && /^[\s\W]$/.test(cleanText)) return false

    return true
  }
}
