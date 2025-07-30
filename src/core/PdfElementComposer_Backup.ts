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
   * Group text elements into paragraphs based on spatial proximity and enhanced semantic analysis.
   * Uses Indonesian paragraph pattern recognition.
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

      // FIXED: Compare against the CURRENT PARAGRAPH STATE, not individual previous element
      let shouldStartNewParagraph = false
      
      if (!previous) {
        shouldStartNewParagraph = false // First element
      } else if (currentParagraph.length === 0) {
        shouldStartNewParagraph = false // No current paragraph yet
      } else {
        // CRITICAL FIX: Use the LAST element in current paragraph for bounding box comparison
        // This ensures we compare against the most recent merged state, not stale first element
        const lastElementInParagraph = currentParagraph[currentParagraph.length - 1]
        shouldStartNewParagraph = this.isParagraphBoundary(current, lastElementInParagraph, sortedElements, i)
      }

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

    // POST-PROCESSING: Split overly large paragraphs with mixed content
    const finalParagraphs = this.postProcessMixedContent(paragraphs)

    return finalParagraphs
  }

  /**
   * Post-process paragraphs to split those with mixed content types using positioning logic
   */
  private static postProcessMixedContent(paragraphs: PdfElement[]): PdfElement[] {
    const result: PdfElement[] = []
    
    for (const paragraph of paragraphs) {
      // Check if paragraph has mixed content that should be split based on positioning
      const originalElements = (paragraph as any).elements as PdfElement[] | undefined
      
      if (!originalElements || originalElements.length <= 3) {
        result.push(paragraph) // Too few elements to meaningfully split
        continue
      }
      
      // Analyze positioning patterns to detect mixed content
      const shouldSplit = this.shouldSplitMixedContent(originalElements)
      
      if (shouldSplit) {
        console.log(`🔧 Post-processing split for mixed content paragraph (${originalElements.length} elements)`)
        const splitParagraphs = this.splitMixedContentParagraph(paragraph)
        result.push(...splitParagraphs)
      } else {
        result.push(paragraph)
      }
    }
    
    return result
  }

  /**
   * Determine if there should be a paragraph boundary based on comprehensive text patterns.
   * Implements user-defined rules for paragraph detection.
   */
  private static isParagraphBoundary(current: PdfElement, previous: PdfElement, allElements: PdfElement[], currentIndex: number): boolean {
    const currentText = (current.formattedData || current.data || '').trim()
    const previousText = (previous.formattedData || previous.data || '').trim()
    
    // Always break for empty elements
    if (!currentText.length || !previousText.length) return true
    
    // Get positioning and styling data
    const currentTop = current.boundingBox?.top || current.y || 0
    const currentLeft = current.boundingBox?.left || current.x || 0
    const currentFontSize = current.attributes?.fontSize || current.font_size || 12
    
    const previousTop = previous.boundingBox?.top || previous.y || 0
    const previousLeft = previous.boundingBox?.left || previous.x || 0
    const previousFontSize = previous.attributes?.fontSize || previous.font_size || 12
    const previousHeight = previous.boundingBox?.height || 12
    const previousBottom = previousTop + previousHeight
    
    // PRIORITY RULE: Same-font aggressive merging (runs FIRST)
    // For elements with same font size and style, be very aggressive about merging
    const fontSizeDiff = Math.abs(currentFontSize - previousFontSize)
    const sameFont = fontSizeDiff < 0.5 // STRICTER: Only truly same font sizes
    const sameFontFamily = (current.attributes?.fontFamily || '') === (previous.attributes?.fontFamily || '')
    
    if (sameFont && sameFontFamily) {
      // Check spatial compatibility
      const verticalGap = currentTop - previousBottom
      const maxVerticalGap = Math.max(previousFontSize * 2, 30) // More conservative gap
      const horizontalGap = Math.abs(currentLeft - previousLeft)
      const maxHorizontalGap = 30 // More conservative alignment
      
      if (verticalGap <= maxVerticalGap && horizontalGap <= maxHorizontalGap) {
        // ONLY break for very strong semantic boundaries
        const veryStrongSemanticBreak = (
          // Clear question patterns starting new conversation
          /^(Can you|How do|What|Where|When|Why|Would you|Tell us|Share|Describe|Explain)/i.test(currentText) ||
          // Bio/name introduction patterns
          /^(My name is|I am|About me|Biography|MOHAMMAD ALAWI|MR\.)/i.test(currentText)
        )
        
        if (!veryStrongSemanticBreak) {
          return false // MERGE: Continue same paragraph (highest priority)
        }
      }
    }
    
    // ENHANCED RULE: Detect different content types with any font size difference
    // Be more strict about merging different content types
    if (fontSizeDiff > 0.3) { // Even tiny differences matter for content types
      // Check for specific content type patterns
      const currentIsName = /^(MOHAMMAD|MR\.|DR\.|MS\.|Mrs\.)/i.test(currentText)
      const currentIsTitle = /^(CHAIRMAN|CEO|DIRECTOR|MANAGER|EXECUTIVE|COMMITTEE|PRESIDENT|VP|VICE)/i.test(currentText)
      const currentIsCompany = /^(RED SEA|COMPANY|LIMITED|INC|CORP|LLC|LTD)/i.test(currentText)
      const currentIsBio = /^(With over|He has|She has|Mohammad|They have|Mr\.|Dr\.)/i.test(currentText)
      const previousIsMainText = /^(My path|I |We |The |This |In |At |On |For |With |About |During |After |Before )/.test(previousText)
      
      // Any name, title, company, or bio pattern should break from main text
      if (previousIsMainText && (currentIsName || currentIsTitle || currentIsCompany || currentIsBio)) {
        return true // Break for different content type
      }
      
      // Name/title to bio transition should also break
      if ((currentIsTitle || currentIsCompany) && fontSizeDiff > 0.5) {
        return true // Break between title/company elements
      }
      
      // Bio text should start new section
      if (currentIsBio) {
        return true // Break for bio section
      }
    }
    
    // RULE 1: Font size must be compatible for same paragraph
    // Only break on major font size differences (like title vs paragraph)
    
    // Major font differences indicate titles vs paragraphs (e.g., 21px vs 9px)
    if (fontSizeDiff > 3) {
      return true
    }
    
    // Medium differences (1.5-3px) - check for specific semantic contexts
    if (fontSizeDiff > 1.5) {
      // 11px is typically questions, 9.1px is paragraph content
      const isQuestionTransition = (currentFontSize > 10.5 && previousFontSize < 10) || 
                                   (previousFontSize > 10.5 && currentFontSize < 10)
      if (isQuestionTransition) {
        return true // Question vs paragraph boundary
      }
      
      // Other medium differences for small fonts can continue
      const bothSmallFonts = currentFontSize < 12 && previousFontSize < 12
      if (!bothSmallFonts) {
        return true // Different font categories
      }
    }
    
    // RULE 2: Title detection - always break for clear titles
    if (this.looksLikeTitle(currentText) || this.looksLikeTitle(previousText)) {
      return true
    }
    
    // RULE 3: Semantic boundaries - questions, names, bio sections
    if (this.isSemanticBreakpoint(currentText, previousText)) {
      return true
    }
    
    // RULE 4: Paragraph end detection - STRENGTHENED
    // If previous ends with period AND no text to the right, it's paragraph end
    const previousEndsWithPeriod = /\.$/.test(previousText)
    if (previousEndsWithPeriod) {
      const hasTextToRight = this.hasTextToRightOfElement(previous, current, allElements, currentIndex)
      if (!hasTextToRight) {
        // Strong indicators of new paragraph after period
        const currentStartsWithCapital = /^[A-Z]/.test(currentText)
        const isQuestionStart = /^(Can you|How do|What|Where|When|Why|Would you|Tell us|Share|Describe|Explain)/i.test(currentText)
        const fontSizeChange = Math.abs(currentFontSize - previousFontSize) > 1.5
        
        // Break if any strong indicator
        if (currentStartsWithCapital || isQuestionStart || fontSizeChange) {
          return true // Strong paragraph boundary after period
        }
      }
    }
    
    // RULE 5: Check for same-line continuation FIRST (most important)
    // If elements are on the same line (overlapping or very close vertically)
    const elementsOnSameLine = Math.abs(currentTop - previousTop) < 8 || 
                               (currentTop >= previousTop && currentTop <= previousBottom)
    
    if (elementsOnSameLine) {
      // On same line - check horizontal positioning
      const previousRight = previousLeft + (previous.boundingBox?.width || 100)
      
      // If current is to the right of previous, it's same-line continuation
      if (currentLeft >= previousRight - 20) { // Allow 20px overlap
        return false // Continue same paragraph (same line)
      }
    }
    
    // Default: continue if basic semantic continuity exists
    return !this.hasBasicSemanticContinuity(currentText, previousText)
  }
  
  /**
   * Check if there's text to the right of an element (same line continuation)
   */
  private static hasTextToRightOfElement(element: PdfElement, nextElement: PdfElement, allElements: PdfElement[], nextIndex: number): boolean {
    const elementTop = element.boundingBox?.top || element.y || 0
    const elementRight = (element.boundingBox?.left || element.x || 0) + (element.boundingBox?.width || 100)
    
    // Check all remaining elements on the same line
    for (let i = nextIndex; i < allElements.length; i++) {
      const checkElement = allElements[i]
      const checkTop = checkElement.boundingBox?.top || checkElement.y || 0
      const checkLeft = checkElement.boundingBox?.left || checkElement.x || 0
      
      // If on same line (within 5px vertically) and to the right
      const sameLine = Math.abs(elementTop - checkTop) < 5
      const toTheRight = checkLeft > elementRight + 10 // 10px margin
      
      if (sameLine && toTheRight) {
        return true // Found text to the right
      }
      
      // If we've moved to next line, stop checking
      if (checkTop > elementTop + 10) {
        break
      }
    }
    
    return false // No text to the right
  }
  
  /**
   * Check for semantic breakpoints (questions, names, bio sections)
   */
  private static isSemanticBreakpoint(currentText: string, previousText: string): boolean {
    // Question start
    if (/^(Can you|How do|What|Where|When|Why|Would you|Tell us|Share|Describe|Explain)/i.test(currentText)) {
      return true
    }
    
    // Answer after question
    if (previousText.includes('?') && /^(My |I |Well,|Actually,|Yes,|No,)/i.test(currentText)) {
      return true
    }
    
    // Name/title blocks
    if (/^(MR\.|MS\.|DR\.|MOHAMMAD ALAWI|CHAIRMAN|CEO|DIRECTOR)/i.test(currentText)) {
      return true
    }
    
    // Bio section
    if (/^(With over \d+|He has|She has)/i.test(currentText)) {
      return true
    }
    
    return false
  }
  
  /**
   * Basic semantic continuity check - enhanced for better paragraph composition
   */
  private static hasBasicSemanticContinuity(currentText: string, previousText: string): boolean {
    // Very strong continuation indicators
    const currentStartsLowercase = /^[a-z]/.test(currentText)
    const currentStartsWithConnector = /^(and |or |but |in |of |to |with |by |for |at |on |the |a |an |this |that |which |who |where |when |while |however |moreover |furthermore |therefore |thus |hence |then |also |additionally|my |i |we |they |it |he |she|his |her |their|was |were |is |are|had |have |has)/i.test(currentText)
    const previousEndsWithComma = /,$/.test(previousText)
    const previousEndsWithConnector = /\s(and|or|but|with|in|of|to|by|for|was|were|is|are|had|have|has)$/i.test(previousText)
    const previousEndsIncomplete = !/[.!?]$/.test(previousText)
    
    // Enhanced continuity - if previous doesn't end with punctuation, likely continues
    const strongContinuity = currentStartsLowercase || currentStartsWithConnector || previousEndsWithComma || previousEndsWithConnector || previousEndsIncomplete
    
    return strongContinuity
  }

  /**
   * Check for significant column changes (different sections)
   */
  private static hasSignificantColumnChange(current: PdfElement, previous: PdfElement): boolean {
    const currentLeft = current.boundingBox?.left || 0
    const previousLeft = previous.boundingBox?.left || 0
    const horizontalGap = Math.abs(currentLeft - previousLeft)
    
    // Only consider major column changes (200+ pixels) AND semantic indicators
    if (horizontalGap < 200) return false
    
    const currentText = (current.formattedData || current.data || '').trim()
    const isNewSection = this.isSemanticBreakpoint(currentText, '') || this.looksLikeTitle(currentText)
    
    return isNewSection
  }

  /**
   * Check for strong semantic boundaries that definitely indicate a new paragraph
   */
  private static isStrongSemanticBoundary(current: PdfElement, previous: PdfElement): boolean {
    const currentText = (current.formattedData || current.data || '').trim()
    const previousText = (previous.formattedData || previous.data || '').trim()
    
    // Headers should not be mixed with content
    if (this.looksLikeTitle(currentText) || this.looksLikeTitle(previousText)) return true
    
    // Question boundaries
    if (this.isQuestionStart(currentText)) return true
    if (previousText.endsWith('?') && this.isAnswerStart(currentText)) return true
    
    // Name/title blocks
    if (this.isPersonNameTitle(currentText)) return true
    
    // Bio section starts
    if (this.isBioSectionStart(currentText)) return true
    
    // Major content transitions (from intro to questions, etc.)
    if (this.isContentTransition(currentText, previousText)) return true
    
    return false
  }

  /**
   * More aggressive semantic continuity check
   */
  private static hasStrongSemanticContinuity(current: PdfElement, previous: PdfElement): boolean {
    const currentText = (current.formattedData || current.data || '').trim()
    const previousText = (previous.formattedData || previous.data || '').trim()

    // Never continue from/to titles or headers
    if (this.looksLikeTitle(currentText) || this.looksLikeTitle(previousText)) {
      return false
    }

    // Very strong continuity indicators
    const previousEndsIncomplete = !/[.!?]$/.test(previousText) || /,$/.test(previousText)
    const currentStartsLowercase = /^[a-z]/.test(currentText)
    const currentIsVeryShort = currentText.length < 20
    const currentStartsWithConnector = /^(and |or |but |in |of |to |with |by |for |at |on |the |a |an |this |that |which |who |where |when |while |however |moreover |furthermore |therefore |thus |hence |then |also |additionally)/i.test(currentText)
    
    // Same column (spatial continuity)
    const currentLeft = current.boundingBox?.left || 0
    const previousLeft = previous.boundingBox?.left || 0
    const sameColumn = Math.abs(currentLeft - previousLeft) < 50
    
    return sameColumn && (previousEndsIncomplete || currentStartsLowercase || currentIsVeryShort || currentStartsWithConnector)
  }

  /**
   * Check for major font size changes (not minor variations)
   */
  private static hasMajorFontSizeChange(current: PdfElement, previous: PdfElement): boolean {
    const currentFontSize = current.attributes?.fontSize || 12
    const previousFontSize = previous.attributes?.fontSize || 12
    
    // Only break on very significant changes (5+ points)
    return Math.abs(currentFontSize - previousFontSize) > 5
  }

  /**
   * Check for column changes (multi-column layout)
   */
  private static hasColumnChange(current: PdfElement, previous: PdfElement): boolean {
    const currentLeft = current.boundingBox?.left || 0
    const previousLeft = previous.boundingBox?.left || 0
    const horizontalGap = Math.abs(currentLeft - previousLeft)
    
    // More restrictive column change detection - only for major layout changes
    // Must be both a large horizontal gap AND different column positions
    if (horizontalGap < 250) return false // Minimum gap for column change
    
    // Additional check: current element should start a new logical section
    const currentText = (current.formattedData || current.data || '').trim()
    const isNewSection = this.isPersonNameTitle(currentText) || this.isBioSectionStart(currentText)
    
    return horizontalGap > 250 && isNewSection
  }

  /**
   * Detect question start patterns
   */
  private static isQuestionStart(text: string): boolean {
    return /^(Can you|How do|What|Where|When|Why|Would you|Tell us|Share|Describe|Explain)/i.test(text)
  }

  /**
   * Detect answer start patterns
   */
  private static isAnswerStart(text: string): boolean {
    return /^(My |I |Well,|Actually,|Yes,|No,|Of course)/i.test(text)
  }

  /**
   * Detect person name/title blocks
   */
  private static isPersonNameTitle(text: string): boolean {
    return /^(MR\.|MS\.|DR\.|MOHAMMAD|CHAIRMAN|CEO|DIRECTOR)/i.test(text) ||
           /^[A-Z\s]+(CHAIRMAN|CEO|DIRECTOR|COMMITTEE|COMPANY|LIMITED)$/i.test(text)
  }

  /**
   * Detect bio section starts
   */
  private static isBioSectionStart(text: string): boolean {
    return /^(With over \d+|He has|She has|.*expertise.*|.*experience.*)/i.test(text)
  }

  /**
   * Detect major content transitions
   */
  private static isContentTransition(currentText: string, previousText: string): boolean {
    // Transition from intro to Q&A
    if (previousText.includes('Journey') && this.isQuestionStart(currentText)) return true
    
    // Transition to bio section  
    if (this.isBioSectionStart(currentText)) return true
    
    return false
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
    
    // Short ALL CAPS text (likely titles/headers) - be more aggressive
    if (cleanText.length < 100 && /^[A-Z\s\-.,!]+$/.test(cleanText)) {
      return true
    }
    
    // Specific header patterns
    if (/^[A-Z\s]+UPDATE$/i.test(cleanText)) return true // "SHOPPING CENTRE UPDATE"
    if (/^[A-Z\s]+DREAMS$/i.test(cleanText)) return true // "SHAPING DREAMS"  
    if (/^(ABOUT|FEATURING|CHAPTER)$/i.test(cleanText)) return true
    
    // Pattern matching for common title formats
    const titlePatterns = [
      /^[A-Z\s]{10,50}$/,        // Medium length all caps
      /^P\d+$/,                  // Page numbers like "P12"
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

    // Other title indicators - but be more restrictive for paragraph content
    const isTitle = this.looksLikeTitle(text)
    
    // Don't treat long sentence fragments as titles
    if (text.length > 40 && text.includes('.') && !text.match(/^[A-Z\s]+$/)) {
      return false
    }
    
    return isTitle
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
      elements: elements.map(el => ({ ...el })) // Store original elements for debugging and validation
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

  /**
   * Analyze positioning patterns to detect if elements should be split based on layout discontinuities
   */
  private static shouldSplitMixedContent(elements: PdfElement[]): boolean {
    if (elements.length <= 3) return false // Too few elements to meaningfully analyze
    
    console.log(`🔍 Analyzing ${elements.length} elements for mixed content patterns`)
    
    // Analyze positioning patterns
    const positionAnalysis = this.analyzeElementPositions(elements)
    
    console.log(`📊 Position analysis: ${positionAnalysis.verticalGroups.length} groups, max gap: ${positionAnalysis.maxVerticalGap}px, fonts: ${positionAnalysis.uniqueFontSizes.join(',')}`)
    
    // Split if we detect multiple distinct groups with significant position gaps
    const hasPositionGroups = positionAnalysis.verticalGroups.length >= 2
    const hasSignificantGaps = positionAnalysis.maxVerticalGap > 20 // 20px gap indicates potential separation
    const hasFontVariation = positionAnalysis.uniqueFontSizes.length >= 2
    
    const shouldSplit = hasPositionGroups && hasSignificantGaps && hasFontVariation
    console.log(`🔧 Should split: ${shouldSplit} (groups: ${hasPositionGroups}, gaps: ${hasSignificantGaps}, fonts: ${hasFontVariation})`)
    
    return shouldSplit
  }

  /**
   * Analyze positioning patterns in elements to detect natural groupings
   */
  private static analyzeElementPositions(elements: PdfElement[]): {
    verticalGroups: PdfElement[][]
    maxVerticalGap: number
    uniqueFontSizes: number[]
  } {
    // Sort elements by vertical position
    const sortedElements = [...elements].sort((a, b) => {
      const aTop = a.boundingBox?.top || a.y || 0
      const bTop = b.boundingBox?.top || b.y || 0
      return aTop - bTop
    })
    
    // Group elements by vertical proximity (elements within 15px of each other)
    const verticalGroups: PdfElement[][] = []
    let currentGroup: PdfElement[] = []
    let maxVerticalGap = 0
    
    for (let i = 0; i < sortedElements.length; i++) {
      const current = sortedElements[i]
      const currentTop = current.boundingBox?.top || current.y || 0
      
      if (currentGroup.length === 0) {
        currentGroup.push(current)
      } else {
        // Calculate gap from previous element
        const previous = currentGroup[currentGroup.length - 1]
        const previousBottom = (previous.boundingBox?.top || previous.y || 0) + (previous.boundingBox?.height || 12)
        const gap = currentTop - previousBottom
        
        maxVerticalGap = Math.max(maxVerticalGap, gap)
        
        // If gap is significant (>15px), start new group
        if (gap > 15) {
          verticalGroups.push([...currentGroup])
          currentGroup = [current]
        } else {
          currentGroup.push(current)
        }
      }
    }
    
    if (currentGroup.length > 0) {
      verticalGroups.push(currentGroup)
    }
    
    // Get unique font sizes
    const uniqueFontSizes = [...new Set(elements.map(el => el.attributes?.fontSize || 12).filter(size => size > 0))]
    
    return {
      verticalGroups,
      maxVerticalGap,
      uniqueFontSizes
    }
  }

  /**
   * Split a mixed content paragraph into separate semantic parts based on positioning analysis
   */
  private static splitMixedContentParagraph(paragraph: PdfElement): PdfElement[] {
    // If the paragraph has the original elements stored, use them for intelligent splitting
    const originalElements = (paragraph as any).elements as PdfElement[] | undefined
    
    if (!originalElements || originalElements.length <= 1) {
      console.log('⚠️ Cannot split paragraph: no original elements available')
      return [paragraph] // Cannot split, return as-is
    }
    
    console.log(`🔍 Splitting paragraph with ${originalElements.length} original elements`)
    
    // Use positioning analysis to create natural groups
    const positionAnalysis = this.analyzeElementPositions(originalElements)
    
    if (positionAnalysis.verticalGroups.length <= 1) {
      console.log('⚠️ No natural position groups found, keeping as single paragraph')
      return [paragraph]
    }
    
    console.log(`📊 Split into ${positionAnalysis.verticalGroups.length} position-based groups`)
    
    // Convert each group back into a composed paragraph
    const splitParagraphs = positionAnalysis.verticalGroups
      .filter(group => group.length > 0) // Filter out empty groups
      .map(group => this.createComposedParagraph(group))
    
    return splitParagraphs
  }
}
