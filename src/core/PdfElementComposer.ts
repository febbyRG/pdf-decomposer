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
      // 2. Current or previous element is likely a title/header
      // 3. Vertical gap is large (more than 6.0x font size) AND no semantic continuity
      // 4. Font size differs significantly (more than 4 points)
      // 5. Horizontal alignment changes significantly (new column/section)
      
      // Start a new paragraph if:
      // 1. This is the first element
      // 2. Current or previous element is likely a title/header
      // 3. Vertical gap is large (more than 6.0x font size) AND no semantic continuity
      // 4. Font size differs significantly (more than 4 points)
      // 5. Horizontal alignment changes significantly (new column/section)
      const shouldStartNewParagraph = !previous ||
        this.isLikelyTitle(current) ||
        this.isLikelyTitle(previous) ||
        (this.hasLargeVerticalGap(current, previous) && !this.hasSemanticContinuity(current, previous)) ||
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
   * Improved logic to handle overlapping elements and better paragraph detection.
   */
  private static hasLargeVerticalGap(current: PdfElement, previous: PdfElement): boolean {
    const currentTop = current.boundingBox?.top || 0
    const previousTop = previous.boundingBox?.top || 0
    const previousHeight = previous.boundingBox?.height || 0
    const previousBottom = previousTop + previousHeight
    const rawPreviousFontSize = previous.attributes?.fontSize || 12
    
    // Handle edge case where fontSize is 0 (use default)
    const previousFontSize = rawPreviousFontSize === 0 ? 12 : rawPreviousFontSize

    const verticalGap = currentTop - previousBottom

    // Handle overlapping or very close elements (common in paragraph text)
    // If elements overlap or are very close (< 1.0x font size), they're likely same paragraph
    // Improved threshold to handle more overlapping cases
    if (verticalGap < (previousFontSize * 1.0)) {
      return false
    }

    // For normal paragraph spacing, use more relaxed threshold
    // Most paragraphs have line spacing between 1.2x to 1.8x font size
    // But some PDF layouts have larger gaps within same paragraph due to formatting
    const relaxedThreshold = previousFontSize * 6.0 // Increased to 6.0x to handle even larger within-paragraph gaps
    
    return verticalGap > relaxedThreshold
  }

  /**
   * Check if there's a significant font size change between two elements.
   * More lenient for small variations that are common in continuous text.
   */
  private static hasFontSizeChange(current: PdfElement, previous: PdfElement): boolean {
    const currentFontSize = current.attributes?.fontSize || 12
    const previousFontSize = previous.attributes?.fontSize || 12

    // Handle edge case where fontSize is 0 (invalid/missing font size)
    const normalizedCurrent = currentFontSize === 0 ? 12 : currentFontSize
    const normalizedPrevious = previousFontSize === 0 ? 12 : previousFontSize

    // Allow for small variations that are common in PDF text extraction
    // Further increased threshold from 3 to 4 points for paragraph continuity
    // This handles cases like 9.1 vs 10.2 fontSize in same paragraph
    return Math.abs(normalizedCurrent - normalizedPrevious) > 4
  }

  /**
   * Check if there's a significant horizontal alignment change.
   */
  private static hasHorizontalAlignmentChange(current: PdfElement, previous: PdfElement): boolean {
    const currentLeft = current.boundingBox?.left || 0
    const previousLeft = previous.boundingBox?.left || 0

    // Increased threshold from 50px to 200px to handle text wrapping and column layouts
    // In PDF paragraph text, elements can have significant horizontal shifts due to:
    // - Text wrapping to new lines
    // - Column-based layouts  
    // - Justified text alignment
    return Math.abs(currentLeft - previousLeft) > 200
  }

  /**
   * Check if text has semantic continuity (should continue as same paragraph).
   * Analyzes punctuation and text flow patterns.
   */
  private static hasSemanticContinuity(current: PdfElement, previous: PdfElement): boolean {
    const currentText = (current.data || '').trim()
    const previousText = (previous.data || '').trim()

    if (!currentText || !previousText) return false

    // Strong indicators that suggest NEW paragraph (should NOT continue)
    const currentLooksLikeTitle = this.looksLikeTitle(currentText)
    const previousLooksLikeTitle = this.looksLikeTitle(previousText)
    
    // Don't continue from title to content or content to title
    if (currentLooksLikeTitle || previousLooksLikeTitle) {
      return false
    }

    // Strong indicators that previous text should continue
    const previousEndsIncomplete = !/[.!?;:]$/.test(previousText) // Doesn't end with strong punctuation
    const previousEndsWithComma = /,$/.test(previousText) // Ends with comma (definitely continues)
    const previousEndsWithAnd = /\s(and|or|but|yet|so|for|nor)$/.test(previousText) // Ends with conjunction
    const previousEndsWithPreposition = /\s(with|in|at|on|by|for|of|to|from|under|over|through|across|into|onto)$/i.test(previousText)

    // Strong indicators that current text is continuation
    const currentStartsLowercase = /^[a-z]/.test(currentText) // Starts with lowercase
    const currentStartsWithArticle = /^(a|an|the|this|that|these|those|it|he|she|they|we|you|which|who|where|when|while)\s/i.test(currentText)
    const currentStartsWithConjunction = /^(and|or|but|however|moreover|furthermore|additionally|also|therefore|thus|hence|then|next|finally)\s/i.test(currentText)
    const currentIsFragment = currentText.length < 30 && !currentText.endsWith('.') && !currentText.endsWith('!') && !currentText.endsWith('?')

    // Strong indicators that suggest NEW paragraph
    const currentStartsWithCapitalSentence = /^[A-Z][a-z].*[.!?]$/.test(currentText) && currentText.length > 20 // Complete sentence starting with capital
    
    // Don't continue if current looks like a new section
    if (currentStartsWithCapitalSentence) {
      return false
    }

    // Enhanced continuity detection - be more aggressive about continuing
    return previousEndsIncomplete || previousEndsWithComma || previousEndsWithAnd || previousEndsWithPreposition ||
           currentStartsLowercase || currentStartsWithArticle || currentStartsWithConjunction || currentIsFragment
  }

  /**
   * Check if text looks like a title or header.
   */
  private static looksLikeTitle(text: string): boolean {
    if (!text || text.trim().length === 0) return false
    
    const cleanText = text.trim()
    
    // Short ALL CAPS text (likely titles/headers)
    if (cleanText.length < 100 && /^[A-Z\s\-.,!]+$/.test(cleanText)) {
      return true
    }
    
    // Pattern matching for common title formats
    const titlePatterns = [
      /^[A-Z][A-Z\s]+UPDATE$/i,  // "SHOPPING CENTRE UPDATE"
      /^[A-Z\s]{10,50}$/,        // Medium length all caps
      /^P\d+$/,                  // Page numbers like "P12"
      /^FEATURING:/i,            // Article sections
      /^MR\.|MS\.|DR\./i         // Titles with people names
    ]
    
    return titlePatterns.some(pattern => pattern.test(cleanText))
  }

  /**
   * Additional check if element is likely a title based on formatting context.
   */
  private static isLikelyTitle(element: PdfElement): boolean {
    const text = (element.data || '').trim()
    const fontSize = element.attributes?.fontSize || 12

    // Elements with fontSize 0 that look like titles are likely titles
    if (fontSize === 0 && this.looksLikeTitle(text)) {
      return true
    }

    // Other title indicators
    return this.looksLikeTitle(text)
  }

  /**
   * Create a composed paragraph element from multiple text elements.
   */
  private static createComposedParagraph(elements: PdfElement[]): PdfElement {
    // Calculate paragraph bounding box
    const bounds = this.calculateParagraphBounds(elements)

    // Combine plain text content
    const paragraphText = elements.map(el => el.data).join(' ')
    
    // Combine formatted HTML content preserving individual formatting
    const formattedHtml = this.combineFormattedText(elements)

    // Calculate average font size
    const avgFontSize = elements.reduce((sum, el) => sum + (el.attributes?.fontSize || 12), 0) / elements.length

    // Use the first element as base and modify it
    const firstElement = elements[0]

    return {
      ...firstElement,
      type: 'paragraph', // New type for composed paragraphs
      boundingBox: bounds,
      data: paragraphText, // Plain text
      formattedData: formattedHtml, // HTML formatted text
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

  /**
   * Combine formatted HTML text from multiple elements intelligently
   */
  private static combineFormattedText(elements: PdfElement[]): string {
    if (elements.length === 0) return ''
    
    // Join formatted text with appropriate spacing
    const formattedParts = elements.map(el => {
      const formatted = el.formattedData || el.data || ''
      return formatted.trim()
    }).filter(part => part.length > 0)

    if (formattedParts.length === 0) return ''

    // Smart joining - add space between parts unless they end/start with HTML tags
    let result = formattedParts[0]
    for (let i = 1; i < formattedParts.length; i++) {
      const prev = formattedParts[i - 1]
      const current = formattedParts[i]
      
      // Check if we need space between parts
      const needsSpace = !prev.endsWith('>') && !current.startsWith('<') && 
                        !prev.endsWith(' ') && !current.startsWith(' ')
      
      result += (needsSpace ? ' ' : '') + current
    }

    // Wrap the combined content in a paragraph tag if it doesn't already have block-level tags
    if (!this.hasBlockLevelTags(result)) {
      result = `<p>${result}</p>`
    }

    return result
  }

  /**
   * Check if text contains block-level HTML tags
   */
  private static hasBlockLevelTags(html: string): boolean {
    const blockTags = ['<p>', '<h1>', '<h2>', '<h3>', '<h4>', '<h5>', '<h6>', '<div>', '<section>', '<article>']
    return blockTags.some(tag => html.includes(tag))
  }
}
