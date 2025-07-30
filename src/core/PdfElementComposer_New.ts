import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'

/**
 * Enhanced PdfElementComposer with proper spatial clustering and layout analysis.
 * Based on research-backed approaches for document layout analysis.
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
   * Compose elements for a single page using spatial clustering.
   */
  private static composePageElements(elements: PdfElement[]): PdfElement[] {
    // Separate text and non-text elements
    const textElements = elements.filter(el => el.type === 'text' && this.isMeaningfulText(el.formattedData || el.data))
    const nonTextElements = elements.filter(el => el.type !== 'text')

    // Group text elements into paragraphs using spatial clustering
    const paragraphs = this.groupIntoParagraphsClustering(textElements)

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
   * Group text elements into paragraphs using spatial clustering algorithm.
   * This is the core improvement - using proper clustering instead of hard-coded patterns.
   */
  private static groupIntoParagraphsClustering(textElements: PdfElement[]): PdfElement[] {
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

    // Use spatial clustering to group elements
    const clusters = this.spatialClustering(sortedElements)
    
    // Convert clusters to composed paragraphs
    const paragraphs = clusters
      .filter(cluster => cluster.length > 0)
      .map(cluster => this.createComposedParagraph(cluster))

    return paragraphs
  }

  /**
   * Spatial clustering algorithm for grouping text elements.
   * Based on proximity, font similarity, and layout patterns.
   */
  private static spatialClustering(elements: PdfElement[]): PdfElement[][] {
    if (elements.length === 0) return []

    const clusters: PdfElement[][] = []
    let currentCluster: PdfElement[] = [elements[0]]

    for (let i = 1; i < elements.length; i++) {
      const current = elements[i]
      const lastInCluster = currentCluster[currentCluster.length - 1]

      // Check if current element should be added to current cluster
      if (this.shouldGroupElements(lastInCluster, current)) {
        currentCluster.push(current)
      } else {
        // Start new cluster
        if (currentCluster.length > 0) {
          clusters.push([...currentCluster])
        }
        currentCluster = [current]
      }
    }

    // Add final cluster
    if (currentCluster.length > 0) {
      clusters.push(currentCluster)
    }

    return clusters
  }

  /**
   * Determine if two elements should be grouped together.
   * Uses geometric and typographic analysis instead of hard-coded patterns.
   */
  private static shouldGroupElements(previous: PdfElement, current: PdfElement): boolean {
    // Geometric analysis
    const geometricCompatible = this.areGeometricallyCompatible(previous, current)
    if (!geometricCompatible) return false

    // Typographic analysis  
    const typographicCompatible = this.areTypographicallyCompatible(previous, current)
    if (!typographicCompatible) return false

    // Semantic flow analysis (generic patterns only)
    const semanticFlow = this.hasSemanticFlow(previous, current)
    
    return semanticFlow
  }

  /**
   * Check geometric compatibility between elements.
   */
  private static areGeometricallyCompatible(previous: PdfElement, current: PdfElement): boolean {
    const prevTop = previous.boundingBox?.top || previous.y || 0
    const prevLeft = previous.boundingBox?.left || previous.x || 0
    const prevHeight = previous.boundingBox?.height || 12
    const prevBottom = prevTop + prevHeight

    const currentTop = current.boundingBox?.top || current.y || 0
    const currentLeft = current.boundingBox?.left || current.x || 0

    // Calculate vertical and horizontal gaps
    const verticalGap = currentTop - prevBottom
    const horizontalGap = Math.abs(currentLeft - prevLeft)

    // Dynamic thresholds based on font size
    const fontSize = previous.attributes?.fontSize || 12
    const maxVerticalGap = fontSize * 2.5 // Allow reasonable line spacing
    const maxHorizontalGap = fontSize * 4 // Allow for indentation and alignment variations

    return verticalGap <= maxVerticalGap && horizontalGap <= maxHorizontalGap
  }

  /**
   * Check typographic compatibility between elements.
   */
  private static areTypographicallyCompatible(previous: PdfElement, current: PdfElement): boolean {
    const prevFontSize = previous.attributes?.fontSize || 12
    const currentFontSize = current.attributes?.fontSize || 12
    const prevFontFamily = previous.attributes?.fontFamily || ''
    const currentFontFamily = current.attributes?.fontFamily || ''

    // Allow some variation in font size (common in PDF extraction)
    const fontSizeDiff = Math.abs(prevFontSize - currentFontSize)
    const maxFontSizeDiff = Math.max(prevFontSize, currentFontSize) * 0.2 // 20% tolerance

    const fontSizeCompatible = fontSizeDiff <= maxFontSizeDiff
    const fontFamilyCompatible = prevFontFamily === currentFontFamily || !prevFontFamily || !currentFontFamily

    return fontSizeCompatible && fontFamilyCompatible
  }

  /**
   * Check semantic flow between elements using generic patterns.
   */
  private static hasSemanticFlow(previous: PdfElement, current: PdfElement): boolean {
    const prevText = (previous.formattedData || previous.data || '').trim()
    const currentText = (current.formattedData || current.data || '').trim()

    if (!prevText || !currentText) return false

    // Generic continuation patterns
    const prevEndsIncomplete = !/[.!?]$/.test(prevText)
    const prevEndsWithComma = /,$/.test(prevText)
    const prevEndsWithConjunction = /\s(and|or|but|with|in|of|to|by|for)$/i.test(prevText)

    const currentStartsLowercase = /^[a-z]/.test(currentText)
    const currentStartsWithArticle = /^(a|an|the|this|that|these|those)\s/i.test(currentText)
    const currentStartsWithConnector = /^(and|or|but|however|moreover|furthermore|therefore|thus|hence|then|also)\s/i.test(currentText)

    // Generic break patterns (avoid hard-coded content)
    const currentLooksLikeTitle = this.looksLikeGenericTitle(currentText)
    const currentLooksLikeNewSection = this.looksLikeNewSection(currentText)

    // Strong break indicators
    if (currentLooksLikeTitle || currentLooksLikeNewSection) {
      return false
    }

    // Strong continuation indicators
    const strongContinuation = (
      prevEndsIncomplete || prevEndsWithComma || prevEndsWithConjunction ||
      currentStartsLowercase || currentStartsWithArticle || currentStartsWithConnector
    )

    return strongContinuation
  }

  /**
   * Generic title detection without hard-coded content.
   */
  private static looksLikeGenericTitle(text: string): boolean {
    if (!text || text.length === 0) return false

    const cleanText = text.trim()

    // Generic title patterns
    const isAllCaps = /^[A-Z\s\-.,!]+$/.test(cleanText) && cleanText.length < 100
    const isShortAndBold = cleanText.length < 50 && /^[A-Z]/.test(cleanText) && !/[.!?]$/.test(cleanText)
    const hasSpecialFormatting = /^(P\d+|CHAPTER \d+|SECTION \d+)$/i.test(cleanText)

    return isAllCaps || isShortAndBold || hasSpecialFormatting
  }

  /**
   * Generic new section detection.
   */
  private static looksLikeNewSection(text: string): boolean {
    if (!text || text.length === 0) return false

    // Question patterns (generic interview/conversation starters)
    const isQuestion = /^(Can you|How do|What|Where|When|Why|Would you|Tell us|Share|Describe|Explain)/i.test(text)
    
    // Formal introduction patterns
    const isFormalIntro = /^(Mr\.|Ms\.|Dr\.|Prof\.)\s/i.test(text)
    
    return isQuestion || isFormalIntro
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
      },
      elements: elements.map(el => ({ ...el })) // Store original elements for debugging
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
