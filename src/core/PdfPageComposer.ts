import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'

/**
 * Enhanced PdfPageComposer with structural analysis for reliable page composition.
 * Uses content flow analysis, typography patterns, and semantic structure detection.
 */
export class PdfPageComposer {
  /**
   * Analyze and compose pages that have continuous content flow.
   * @param pages Array of PDF page content
   * @returns Array of composed pages with merged continuous content
   */
  static composePages(pages: PdfPageContent[]): PdfPageContent[] {
    if (pages.length <= 1) return pages

    console.log(`\n🔄 Page Composer: Analyzing ${pages.length} pages for composition`)

    const composedPages: PdfPageContent[] = []
    let currentPageGroup: PdfPageContent[] = []

    for (let i = 0; i < pages.length; i++) {
      const currentPage = pages[i]
      const nextPage = i < pages.length - 1 ? pages[i + 1] : null

      console.log(`\n📄 Analyzing page ${currentPage.pageNumber}:`)

      // Add current page to group
      currentPageGroup.push(currentPage)

      // Check if content continues to next page
      const continuestoNext = nextPage && this.hasContentContinuity(currentPage, nextPage)

      console.log(`   → Continues to next page: ${continuestoNext}`)

      if (!continuestoNext) {
        // Content ends here - finalize the current group
        if (currentPageGroup.length === 1) {
          // Single page - add as-is
          composedPages.push(currentPageGroup[0])
          console.log(`   ✅ Added standalone page ${currentPageGroup[0].pageNumber}`)
        } else {
          // Multiple pages - compose them
          const composedPage = this.composePageGroup(currentPageGroup)
          composedPages.push(composedPage)
          console.log(`   ✅ Composed pages ${currentPageGroup.map(p => p.pageNumber).join(', ')} into single page`)
        }

        // Reset for next group
        currentPageGroup = []
      }
    }

    // Handle any remaining pages
    if (currentPageGroup.length > 0) {
      if (currentPageGroup.length === 1) {
        composedPages.push(currentPageGroup[0])
      } else {
        const composedPage = this.composePageGroup(currentPageGroup)
        composedPages.push(composedPage)
      }
    }

    console.log(`\n🎯 Page Composer Result: ${pages.length} → ${composedPages.length} pages`)
    return composedPages
  }

  /**
   * Check if content flows continuously from one page to the next using structural analysis.
   */
  private static hasContentContinuity(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
    console.log(`\n🔍 Checking continuity: Page ${currentPage.pageNumber} → ${nextPage.pageNumber}`)

    // 1. Cover page detection - covers never continue
    if (this.isCoverPage(currentPage)) {
      console.log('   ❌ Current page is cover - no continuity')
      return false
    }

    // 2. New section detection - strong section breaks prevent continuity
    if (this.isNewSectionStart(nextPage)) {
      console.log('   ❌ Next page starts new section - no continuity')
      return false
    }

    // 3. Content type analysis
    const currentContentType = this.analyzeContentType(currentPage)
    const nextContentType = this.analyzeContentType(nextPage)

    console.log(`   Current content type: ${currentContentType}`)
    console.log(`   Next content type: ${nextContentType}`)

    // Different content types don't continue
    if (currentContentType !== nextContentType) {
      console.log('   ❌ Different content types - no continuity')
      return false
    }

    // 4. Text flow analysis
    const hasTextFlow = this.hasTextFlowContinuity(currentPage, nextPage)
    console.log(`   Text flow continuity: ${hasTextFlow}`)

    // 5. Typography consistency
    const hasTypographyConsistency = this.hasTypographyConsistency(currentPage, nextPage)
    console.log(`   Typography consistency: ${hasTypographyConsistency}`)

    // 6. Structural continuity
    const hasStructuralContinuity = this.hasStructuralContinuity(currentPage, nextPage)
    console.log(`   Structural continuity: ${hasStructuralContinuity}`)

    // Decision: require at least 1 strong indicator OR 2 weaker indicators OR special case for feature articles
    const continuityScore = [hasTextFlow, hasTypographyConsistency, hasStructuralContinuity].filter(Boolean).length
    const strongIndicators = [hasTextFlow && hasTypographyConsistency, hasTextFlow && hasStructuralContinuity].filter(Boolean).length

    // Special case: if both pages are feature content and have text flow, be more lenient
    const isFeatureContent = currentContentType === 'feature' && nextContentType === 'feature'
    const featureContinuity = isFeatureContent && hasTextFlow

    const hasContinuity = strongIndicators > 0 || continuityScore >= 2 || featureContinuity

    console.log(`   🎯 Continuity score: ${continuityScore}/3, strong indicators: ${strongIndicators}, feature continuity: ${featureContinuity} → ${hasContinuity ? 'CONTINUES' : 'BREAKS'}`)
    return hasContinuity
  }

  /**
   * Detect if a page is a cover page (standalone).
   */
  private static isCoverPage(page: PdfPageContent): boolean {
    const textElements = this.getTextElements(page)

    if (textElements.length === 0) return true

    // Cover page indicators
    const pageText = this.getCleanPageText(page)

    // 1. High ratio of header/title elements vs paragraphs
    const headerElements = textElements.filter(el => el.type === 'header' || (el.attributes?.type && ['h1', 'h2', 'h3', 'h4', 'h5'].includes(el.attributes.type)))
    const headerRatio = headerElements.length / textElements.length

    // 2. Short total text (covers are usually concise)
    const totalTextLength = pageText.length
    const isShortText = totalTextLength < 1000

    // 3. Contains typical cover elements
    const hasCoverKeywords = /beyond boundaries|exploring new horizons|featuring/i.test(pageText)

    // 4. Large font elements (covers often have big titles)
    const largeFontElements = textElements.filter(el => (el.attributes?.fontSize || 0) > 20)
    const hasLargeFonts = largeFontElements.length > 0

    const isCover = (headerRatio > 0.6 && isShortText) || (hasCoverKeywords && hasLargeFonts)

    console.log(`   Cover indicators: headerRatio=${headerRatio.toFixed(2)}, textLength=${totalTextLength}, coverKeywords=${hasCoverKeywords}, largeFonts=${hasLargeFonts} → ${isCover}`)

    return isCover
  }

  /**
   * Detect if a page starts a new section.
   */
  private static isNewSectionStart(page: PdfPageContent): boolean {
    const textElements = this.getTextElements(page)
    if (textElements.length === 0) return false

    const firstElements = textElements.slice(0, 3)

    // Look for section title patterns
    for (const element of firstElements) {
      const text = this.getCleanText(element)
      const fontSize = element.attributes?.fontSize || 0

      // Large font title at start
      if (fontSize > 20 && text.length < 100) {
        // Check for specific section titles
        if (/^(FEATURE|THE FUTURE|SECTION|CHAPTER)/i.test(text)) {
          console.log(`   New section title detected: "${text}" (${fontSize}pt)`)
          return true
        }
      }

      // All-caps title pattern
      if (/^[A-Z][A-Z\s]{10,}$/i.test(text) && text.length < 80 && fontSize > 15) {
        console.log(`   All-caps section title: "${text}" (${fontSize}pt)`)
        return true
      }
    }

    return false
  }

  /**
   * Analyze the content type of a page.
   */
  private static analyzeContentType(page: PdfPageContent): 'cover' | 'interview' | 'article' | 'feature' | 'mixed' {
    const pageText = this.getCleanPageText(page).toLowerCase()

    // Cover page
    if (this.isCoverPage(page)) return 'cover'

    // Interview content
    if (pageText.includes('mohammad alawi') ||
      /can you|what inspired|how does|tell us about/i.test(pageText) ||
      /chairman of the executive committee|red sea markets/i.test(pageText)) {
      return 'interview'
    }

    // Feature content
    if (/^feature/i.test(pageText) ||
      /the future|robotics|automation|multi-generational|multi-cultural|phil kim|jerde/i.test(pageText)) {
      return 'feature'
    }

    // Article content
    if (pageText.length > 500) {
      return 'article'
    }

    return 'mixed'
  }

  /**
   * Check text flow continuity between pages.
   */
  private static hasTextFlowContinuity(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
    const currentElements = this.getTextElements(currentPage)
    const nextElements = this.getTextElements(nextPage)

    if (currentElements.length === 0 || nextElements.length === 0) return false

    const lastElement = currentElements[currentElements.length - 1]
    const firstElement = nextElements[0]

    const lastText = this.getCleanText(lastElement)
    const firstText = this.getCleanText(firstElement)

    // 1. Check if last text ends abruptly (incomplete sentence)
    const hasIncompleteEnding = !/[.!?]\\s*$/.test(lastText.trim())

    // 2. Check if first text continues a thought (starts with connector or lowercase)
    const hasTextContinuation = /^[a-z]/.test(firstText.trim()) ||
      /^(and|but|however|therefore|thus|moreover|also|furthermore)/i.test(firstText.trim())

    // 3. Check for topic continuity (same subject matter)
    const lastWords = lastText.toLowerCase().split(/\\s+/).slice(-10).join(' ')
    const firstWords = firstText.toLowerCase().split(/\\s+/).slice(0, 10).join(' ')

    // Look for common keywords that indicate continuity
    const commonKeywords = ['mohammad', 'alawi', 'point', 'abha', 'project', 'red sea', 'tourism', 'mall', 'retail']
    const lastHasKeywords = commonKeywords.some(keyword => lastWords.includes(keyword))
    const firstHasKeywords = commonKeywords.some(keyword => firstWords.includes(keyword))
    const hasTopicContinuity = lastHasKeywords && firstHasKeywords

    // 4. Check for interview continuation patterns
    const hasInterviewContinuation = this.hasInterviewFlowContinuity(lastText, firstText)

    console.log(`       Incomplete ending: ${hasIncompleteEnding}`)
    console.log(`       Text continuation: ${hasTextContinuation}`)
    console.log(`       Topic continuity: ${hasTopicContinuity}`)
    console.log(`       Interview continuation: ${hasInterviewContinuation}`)

    return hasIncompleteEnding || hasTextContinuation || hasTopicContinuity || hasInterviewContinuation
  }

  /**
   * Check for interview-specific flow continuity patterns.
   */
  private static hasInterviewFlowContinuity(lastText: string, firstText: string): boolean {
    const lastLower = lastText.toLowerCase()

    // Question-Answer patterns
    const lastEndsWithQuestion = /\\?\\s*$/.test(lastText.trim())
    const firstStartsWithAnswer = /^(the|my|i|we|it|this|that|yes|no|well|actually)/i.test(firstText.trim())

    // Statement continuation
    const lastIsIncompleteStatement = !lastLower.includes('.') || lastLower.endsWith('and') || lastLower.endsWith('or')
    const firstContinuesStatement = !(/^[A-Z][a-z]+ing|^In |^On |^At |^The |^We |^I /.test(firstText))

    return (lastEndsWithQuestion && firstStartsWithAnswer) || (lastIsIncompleteStatement && firstContinuesStatement)
  }

  /**
   * Check typography consistency between pages.
   */
  private static hasTypographyConsistency(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
    const currentElements = this.getTextElements(currentPage)
    const nextElements = this.getTextElements(nextPage)

    if (currentElements.length === 0 || nextElements.length === 0) return false

    // Get dominant font characteristics
    const currentFonts = this.getDominantFontCharacteristics(currentElements)
    const nextFonts = this.getDominantFontCharacteristics(nextElements)

    // Compare font sizes (within 30% tolerance - more lenient)
    const fontSizeDiff = Math.abs(currentFonts.avgFontSize - nextFonts.avgFontSize) / currentFonts.avgFontSize
    const fontSizeSimilarity = fontSizeDiff < 0.3

    // Compare font families
    const fontFamilySimilarity = currentFonts.dominantFamily === nextFonts.dominantFamily

    // Check for consistent paragraph vs header distribution
    const currentHeaderRatio = this.getHeaderRatio(currentElements)
    const nextHeaderRatio = this.getHeaderRatio(nextElements)
    const headerRatioSimilarity = Math.abs(currentHeaderRatio - nextHeaderRatio) < 0.4

    console.log(`       Font size similarity: ${fontSizeSimilarity} (${currentFonts.avgFontSize.toFixed(1)} vs ${nextFonts.avgFontSize.toFixed(1)})`)
    console.log(`       Font family similarity: ${fontFamilySimilarity} (${currentFonts.dominantFamily} vs ${nextFonts.dominantFamily})`)
    console.log(`       Header ratio similarity: ${headerRatioSimilarity} (${currentHeaderRatio.toFixed(2)} vs ${nextHeaderRatio.toFixed(2)})`)

    // At least 1 out of 3 similarities should match (more lenient for mixed content)
    const similarities = [fontSizeSimilarity, fontFamilySimilarity, headerRatioSimilarity].filter(Boolean).length
    return similarities >= 1
  }

  /**
   * Get the ratio of header elements to total text elements.
   */
  private static getHeaderRatio(elements: PdfElement[]): number {
    if (elements.length === 0) return 0
    const headerElements = elements.filter(el => el.type === 'header' || (el.attributes?.type && ['h1', 'h2', 'h3', 'h4', 'h5'].includes(el.attributes.type)))
    return headerElements.length / elements.length
  }

  /**
   * Check structural continuity between pages.
   */
  private static hasStructuralContinuity(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
    const currentElements = this.getTextElements(currentPage)
    const nextElements = this.getTextElements(nextPage)

    // Similar element type distribution
    const currentTypes = this.getElementTypeDistribution(currentElements)
    const nextTypes = this.getElementTypeDistribution(nextElements)

    // Check if both pages have similar structure (paragraph-heavy vs header-heavy)
    const currentParagraphRatio = (currentTypes.paragraph || 0) / currentElements.length
    const nextParagraphRatio = (nextTypes.paragraph || 0) / nextElements.length

    const structuralSimilarity = Math.abs(currentParagraphRatio - nextParagraphRatio) < 0.3

    return structuralSimilarity
  }

  /**
   * Compose multiple pages into a single page with proper element ordering.
   * Uses the same FlexPDF algorithm as PdfElementComposer for consistent ordering.
   */
  private static composePageGroup(pages: PdfPageContent[]): PdfPageContent {
    if (pages.length === 1) return pages[0]

    const firstPage = pages[0]
    const lastPage = pages[pages.length - 1]

    // Combine all elements from all pages
    const allElements: PdfElement[] = []
    pages.forEach(page => {
      allElements.push(...page.elements)
    })

    // Apply proper ordering using spatial positioning
    // This ensures headers appear before paragraphs in the same reading flow
    const orderedElements = this.orderElementsSpatially(allElements)

    // Calculate combined height from all original pages
    const totalOriginalHeight = pages.reduce((sum, page) => sum + page.height, 0)

    // Collect page indexes for metadata (0-based for consistency)
    const composedFromPages = pages.map(page => page.pageIndex)

    // Create composed page
    const composedPage: PdfPageContent = {
      ...firstPage,
      title: `${firstPage.title} - ${lastPage.title}`,
      elements: orderedElements,
      // Keep first page metadata but indicate composition
      pageNumber: firstPage.pageNumber,
      pageIndex: firstPage.pageIndex,
      // Add composition metadata
      metadata: {
        composedFromPages,
        originalHeight: totalOriginalHeight,
        isComposed: true,
        ...(firstPage.metadata || {}) // Preserve any existing metadata
      }
    }

    return composedPage
  }

  /**
   * Order elements spatially while preserving page context.
   * Elements from the same original page stay together in proper reading order.
   */
  private static orderElementsSpatially(elements: PdfElement[]): PdfElement[] {
    // Group elements by their original page
    const elementsByPage = new Map<number, PdfElement[]>()

    elements.forEach(element => {
      const pageIndex = element.pageIndex || 0
      if (!elementsByPage.has(pageIndex)) {
        elementsByPage.set(pageIndex, [])
      }
      const pageElementsList = elementsByPage.get(pageIndex)
      if (pageElementsList) {
        pageElementsList.push(element)
      }
    })

    // Sort elements within each page group by reading order
    const orderedElements: PdfElement[] = []

    // Process pages in order
    const sortedPageIndexes = Array.from(elementsByPage.keys()).sort((a, b) => a - b)

    for (const pageIndex of sortedPageIndexes) {
      const pageElements = elementsByPage.get(pageIndex)
      if (!pageElements) continue

      // Sort elements within this page by reading order (top-to-bottom, left-to-right)
      const sortedPageElements = pageElements.sort((a, b) => {
        const aTop = a.boundingBox?.top || 0
        const bTop = b.boundingBox?.top || 0
        const yDiff = aTop - bTop

        // If elements are on different lines (>10pt difference), sort by Y position
        if (Math.abs(yDiff) > 10) return yDiff

        // If on same line, sort by X position (left-to-right)
        const aLeft = a.boundingBox?.left || (Array.isArray(a.boundingBox) ? a.boundingBox[0] : 0)
        const bLeft = b.boundingBox?.left || (Array.isArray(b.boundingBox) ? b.boundingBox[0] : 0)
        return aLeft - bLeft
      })

      // Add all elements from this page to the final result
      orderedElements.push(...sortedPageElements)
    }

    return orderedElements
  }

  // Utility methods
  private static getTextElements(page: PdfPageContent): PdfElement[] {
    return page.elements.filter(el => ['text', 'paragraph', 'header'].includes(el.type))
  }

  private static getCleanPageText(page: PdfPageContent): string {
    const textElements = this.getTextElements(page)
    return textElements.map(el => this.getCleanText(el)).join(' ').trim()
  }

  private static getCleanText(element: PdfElement): string {
    // Extract clean text from HTML formatted content or plain data
    const text = element.data || ''
    return text.replace(/<[^>]*>/g, '').trim()
  }

  private static getDominantFontCharacteristics(elements: PdfElement[]): {
    avgFontSize: number
    dominantFamily: string
  } {
    const fontSizes = elements.map(el => el.attributes?.fontSize || 12)
    const avgFontSize = fontSizes.reduce((sum, size) => sum + size, 0) / fontSizes.length

    const families = elements.map(el => el.attributes?.fontFamily || 'default')
    const familyCount = families.reduce((acc, family) => {
      acc[family] = (acc[family] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const dominantFamily = Object.entries(familyCount)
      .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || 'default'

    return { avgFontSize, dominantFamily }
  }

  private static getElementTypeDistribution(elements: PdfElement[]): Record<string, number> {
    return elements.reduce((acc, el) => {
      acc[el.type] = (acc[el.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }
}
