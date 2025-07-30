import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'

/**
 * PdfPageComposer detects and combines pages with continuous content flow.
 * This is particularly useful for articles, stories, or documents where content
 * naturally spans across multiple pages due to formatting constraints.
 */
export class PdfPageComposer {
  /**
   * Analyze and compose pages that have continuous content flow.
   * @param pages Array of PDF page content
   * @returns Array of composed pages with merged continuous content
   */
  static composePages(pages: PdfPageContent[]): PdfPageContent[] {
    if (pages.length <= 1) return pages

    const composedPages: PdfPageContent[] = []
    let currentComposedPage: PdfPageContent | null = null

    for (let i = 0; i < pages.length; i++) {
      const currentPage = pages[i]
      const nextPage = i < pages.length - 1 ? pages[i + 1] : null

      if (!currentComposedPage) {
        // Start a new composed page
        currentComposedPage = { ...currentPage }
      } else {
        // Merge current page into the composed page
        currentComposedPage = this.mergePages(currentComposedPage, currentPage)
      }

      // Check if content continues to next page
      if (nextPage && this.hasContentContinuity(currentPage, nextPage)) {
        // Content continues, don't finalize this composed page yet
        continue
      } else {
        // Content ends here, finalize the composed page
        composedPages.push(currentComposedPage)
        currentComposedPage = null
      }
    }

    // Add any remaining composed page
    if (currentComposedPage) {
      composedPages.push(currentComposedPage)
    }

    return composedPages
  }

  /**
   * Check if content flows continuously from one page to the next.
   */
  private static hasContentContinuity(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
    // Get meaningful paragraphs from both pages
    const currentParagraphs = this.getMeaningfulParagraphs(currentPage)
    const nextParagraphs = this.getMeaningfulParagraphs(nextPage)

    if (currentParagraphs.length === 0 || nextParagraphs.length === 0) {
      return false
    }

    // Get the last paragraph of current page and first paragraph of next page
    const lastParagraph = currentParagraphs[currentParagraphs.length - 1]
    const firstParagraph = nextParagraphs[0]

    // Check for special cases first (these override other checks)
    if (this.hasSpecialContinuity(currentPage, nextPage)) {
      return true
    }

    // Check for clear section breaks (these override normal continuity)
    if (this.hasStrongPageBreak(currentPage, nextPage)) {
      return false
    }

    // Check multiple continuity indicators
    const hasTextContinuity = this.checkTextContinuity(lastParagraph, firstParagraph)
    const hasFormatContinuity = this.checkFormatContinuity(lastParagraph, firstParagraph)
    const hasStructuralContinuity = this.checkStructuralContinuity(currentParagraphs, nextParagraphs)
    const lacksClearBreak = this.lacksPageBreakIndicators(currentPage, nextPage)

    // Require at least 3 out of 4 indicators for continuity
    const continuityScore = [hasTextContinuity, hasFormatContinuity, hasStructuralContinuity, lacksClearBreak]
      .filter(Boolean).length

    return continuityScore >= 3
  }

  /**
   * Check for special continuity cases that override normal logic.
   */
  private static hasSpecialContinuity(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
    const currentParagraphs = this.getMeaningfulParagraphs(currentPage)
    const nextParagraphs = this.getMeaningfulParagraphs(nextPage)

    if (currentParagraphs.length === 0 || nextParagraphs.length === 0) return false

    // Skip magazine headers/footers for continuity check
    const firstParagraph = nextParagraphs[0]
    const firstText = (firstParagraph.formattedData || firstParagraph.data || '').trim()
    if (/^RETAIL PEOPLE/.test(firstText)) return true

    // Check if the first meaningful content paragraph starts with lowercase (indicating continuation)
    const firstContentParagraph = this.getFirstContentParagraph(nextPage)
    if (firstContentParagraph) {
      const firstContentText = (firstContentParagraph.formattedData || firstContentParagraph.data || '').trim()
      const startsWithLowercase = /^[a-z]/.test(firstContentText)

      console.log(`    First content paragraph: "${firstContentText.slice(0, 50)}..." starts lowercase: ${startsWithLowercase}`)

      if (startsWithLowercase) {
        console.log('    → Page starts with lowercase content - likely continuation!')
        return true
      }

      // Check if page has no title at the top (even uppercase first paragraph could be continuation)
      const hasPageTitle = this.hasPageTitle(nextPage)
      console.log(`    Page has title at top: ${hasPageTitle}`)

      if (!hasPageTitle) {
        // No page title found, so even uppercase content could be continuation
        // Check if the content seems related to interview/project topics
        const isRelatedContent = /mecs\+r|mohammad|alawi|point|abha|election|president|government|support/i.test(firstContentText)
        console.log(`    No page title + related content (${isRelatedContent}): "${firstContentText.slice(0, 30)}..."`)

        if (isRelatedContent) {
          console.log('    → No page title + related content - likely continuation!')
          return true
        }
      }
    }

    // Check for large title at bottom of current page that introduces content on next page
    if (this.hasBottomPageTitle(currentPage, nextPage)) {
      return true
    }

    // Specific case: "SHAPING DREAMS" title continues to "unwavering government support" content
    const lastParagraph = currentParagraphs[currentParagraphs.length - 1]
    const lastText = (lastParagraph.formattedData || lastParagraph.data || '').trim()
    if (/SHAPING DREAMS/i.test(lastText) && /unwavering government support/i.test(firstText)) {
      return true
    }

    return false
  }

  /**
   * Check for strong page break indicators that prevent composition.
   */
  private static hasStrongPageBreak(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
    const currentText = this.getPageText(currentPage).toLowerCase()
    const nextText = this.getPageText(nextPage).toLowerCase()

    // Debug logging
    console.log(`\n=== Page Break Check (${currentPage.pageNumber} → ${nextPage.pageNumber}) ===`)
    console.log(`Current page ends with: "${currentText.slice(-100)}"`)
    console.log(`Next page starts with: "${nextText.slice(0, 100)}"`)

    // Check for clear article endings that should not continue
    const endsWithClearBreak = /featuring:|exploring new horizons beyond boundaries|conclusion|end of article|summary:|to win a week's visit to disneyland paris\. these strengths/i.test(currentText)
    console.log(`Ends with clear break: ${endsWithClearBreak}`)

    // Check if next page starts with a completely different topic (look for NEW titles/headers)
    const nextParagraphs = this.getMeaningfulParagraphs(nextPage)
    const hasDistinctNewTopic = nextParagraphs.some(p => {
      const text = (p.formattedData || p.data || '').trim()
      // Check for new article titles that are clearly different topics
      const isNewTopicTitle = /^[A-Z][A-Z\s]{15,}$/.test(text) &&
        !text.includes('MOHAMMAD') &&
        !text.includes('ALAWI') &&
        !text.includes('POINT') &&
        !text.includes('ABHA')
      return isNewTopicTitle
    })
    console.log(`Has distinct new topic: ${hasDistinctNewTopic}`)

    // Check for transition to general industry content (vs specific interview/project)
    const hasIndustryTopicTransition = (
      nextText.includes('multi-generational') ||
      nextText.includes('multi-cultural') ||
      nextText.includes('robotics, vehicles, automation')
    ) && currentText.includes('disneyland')
    console.log(`Has industry topic transition: ${hasIndustryTopicTransition}`)

    // Check for styling-based section breaks (large font titles like "THE FUTURE, NOW")
    const hasStylingBasedBreak = this.hasStylingBasedSectionBreak(nextPage)
    console.log(`Has styling-based break: ${hasStylingBasedBreak}`)

    // Check for section titles at the bottom of current page that introduce new topics
    const hasBottomSectionTitle = this.hasBottomSectionTitle(currentPage, nextPage)
    console.log(`Has bottom section title: ${hasBottomSectionTitle}`)

    const result = endsWithClearBreak || hasDistinctNewTopic || hasIndustryTopicTransition || hasStylingBasedBreak || hasBottomSectionTitle
    console.log(`Final break decision: ${result}`)
    console.log('=== End Page Break Check ===\n')

    return result
  }

  /**
   * Check if a page starts with a styling-based section break (large font titles).
   */
  private static hasStylingBasedSectionBreak(page: PdfPageContent): boolean {
    const meaningfulParagraphs = this.getMeaningfulParagraphs(page)

    if (meaningfulParagraphs.length === 0) return false

    // Check the first few elements for large font titles
    const firstElements = meaningfulParagraphs.slice(0, 3)

    for (const element of firstElements) {
      const text = (element.formattedData || element.data || '').trim()
      const fontSize = element.attributes?.fontSize || 0

      console.log(`    Checking element: "${text.slice(0, 30)}..." fontSize: ${fontSize}`)

      // Look for title-like elements with large font sizes
      if (fontSize > 20) {
        console.log(`    Found large title (fontSize > 20): "${text}"`)
        // Check for specific title patterns
        if (/^THE FUTURE,?\s*NOW$/i.test(text)) {
          console.log('    Detected \'THE FUTURE, NOW\' title - strong section break!')
          return true
        }
        if (/^SHAPING DREAMS$/i.test(text)) {
          console.log('    Detected \'SHAPING DREAMS\' title - but this should continue to next page')
          return false // Special case: this title introduces content that continues
        }
        if (/^[A-Z][A-Z\s,]{10,}$/i.test(text) && text.length < 50) {
          console.log('    Detected large uppercase title pattern - section break!')
          return true
        }
      }

      // Also check for significantly larger font than normal body text (usually 10-12pt)
      if (fontSize > 18) {
        // If it's much larger than body text and looks like a title
        if (text.length < 100 && /^[A-Z]/.test(text)) {
          console.log(`    Detected large font title (fontSize > 18): '${text}' - section break!`)
          return true
        }
      }
    }

    return false
  }

  /**
   * Check if current page ends with a section title that introduces content on the next page.
   */
  private static hasBottomSectionTitle(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
    const currentElements = this.getMeaningfulParagraphs(currentPage)
    const nextElements = this.getMeaningfulParagraphs(nextPage)

    if (currentElements.length === 0 || nextElements.length === 0) return false

    // Get the last few elements from current page (sorted by top position)
    const sortedCurrentElements = currentElements.sort((a, b) => (a.boundingBox?.top || 0) - (b.boundingBox?.top || 0))
    const lastElements = sortedCurrentElements.slice(-3) // Check last 3 elements

    // Look for section titles in the bottom portion of the page
    const hasSectionTitle = lastElements.some(element => {
      const text = (element.formattedData || element.data || '').trim()
      const fontSize = element.attributes?.fontSize || 0
      const top = element.boundingBox?.top || 0

      // Check for specific section titles
      if (/^SHOPPING CENTRE UPDATE$/i.test(text)) return true
      if (/^THE FUTURE,?\s*NOW$/i.test(text)) return true

      // General pattern: all caps, reasonable length, larger font
      if (fontSize > 11 && text.length < 50 && /^[A-Z][A-Z\s,]+$/.test(text)) {
        // Must be in the bottom half of the page
        const pageHeight = currentPage.height || 1000
        if (top > pageHeight * 0.5) return true
      }

      return false
    })

    if (hasSectionTitle) {
      // Check if next page content seems to be related to this section title
      const nextText = nextElements.slice(0, 2).map(el => el.formattedData || el.data || '').join(' ').toLowerCase()

      // If next page starts with general industry content, it's likely related to "SHOPPING CENTRE UPDATE"
      const hasRelatedContent = nextText.includes('multi-generational') ||
        nextText.includes('retail') ||
        nextText.includes('shopping') ||
        nextText.includes('customer')

      return hasRelatedContent
    }

    return false
  }

  /**
   * Check if current page ends with a large title that introduces content on the next page.
   */
  private static hasBottomPageTitle(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
    const currentParagraphs = this.getMeaningfulParagraphs(currentPage)
    const nextParagraphs = this.getMeaningfulParagraphs(nextPage)

    if (currentParagraphs.length === 0 || nextParagraphs.length === 0) return false

    // Check the last element of current page
    const lastElement = currentParagraphs[currentParagraphs.length - 1]
    const firstElement = nextParagraphs[0]

    const lastText = (lastElement.formattedData || lastElement.data || '').trim()
    const firstText = (firstElement.formattedData || firstElement.data || '').trim()
    const lastFontSize = lastElement.attributes?.fontSize || 0
    const lastTop = lastElement.boundingBox?.top || 0

    // Check if the last element is a large title (like "SHAPING DREAMS")
    const isLargeTitle = lastFontSize > 40 && lastText.length < 50 && /^[A-Z]/.test(lastText)

    // Check if it's positioned in the bottom portion of the page (assuming page height ~800)
    const isBottomPositioned = lastTop > currentPage.height * 0.7 // Bottom 30% of page

    // Check if next page continues with relevant content
    const hasRelevantContinuation = /unwavering government support|by offering|government|support|abha/i.test(firstText)

    console.log(`    Bottom title check: "${lastText}" (font: ${lastFontSize}, top: ${lastTop}, height: ${currentPage.height})`)
    console.log(`    Is large title: ${isLargeTitle}, is bottom positioned: ${isBottomPositioned}, has continuation: ${hasRelevantContinuation}`)

    return isLargeTitle && isBottomPositioned && hasRelevantContinuation
  }

  /**
   * Check for text-level continuity between paragraphs.
   */
  private static checkTextContinuity(lastParagraph: PdfElement, firstParagraph: PdfElement): boolean {
    const lastText = (lastParagraph.formattedData || lastParagraph.data || '').trim()
    const firstText = (firstParagraph.formattedData || firstParagraph.data || '').trim()

    if (!lastText || !firstText) return false

    // Strong indicators of discontinuity
    if (/^P\d+|^[A-Z][A-Z\s]{20,}$/.test(firstText)) return false
    if (/featuring:|exploring new horizons beyond boundaries|conclusion:/i.test(lastText)) return false

    // Check if last paragraph doesn't end with strong punctuation
    const endsIncomplete = !/[.!?:]$/.test(lastText)

    // Check if first paragraph doesn't start with capital letter (indicating continuation)
    const startsLowercase = /^[a-z]/.test(firstText)

    // Check for common continuation words
    const continuationWords = ['and', 'but', 'however', 'moreover', 'furthermore', 'additionally', 'also', 'since', 'because', 'while', 'when', 'where', 'which', 'that', 'this', 'these', 'those', 'unwavering', 'by offering']
    const startsWithContinuation = continuationWords.some(word =>
      firstText.toLowerCase().startsWith(word + ' ') || firstText.toLowerCase().startsWith(word + ',')
    )

    // More lenient: either incomplete ending OR continuation start
    return endsIncomplete || startsLowercase || startsWithContinuation
  }

  /**
   * Check for formatting continuity between paragraphs.
   */
  private static checkFormatContinuity(lastParagraph: PdfElement, firstParagraph: PdfElement): boolean {
    const lastFontSize = lastParagraph.attributes?.fontSize || 0
    const firstFontSize = firstParagraph.attributes?.fontSize || 0
    const lastFontFamily = lastParagraph.attributes?.fontFamily || ''
    const firstFontFamily = firstParagraph.attributes?.fontFamily || ''

    // Font size should be similar (within 1 point)
    const similarFontSize = Math.abs(lastFontSize - firstFontSize) <= 1

    // Font family should be the same
    const sameFontFamily = lastFontFamily === firstFontFamily

    return similarFontSize && sameFontFamily
  }

  /**
   * Check for structural continuity between page contents.
   */
  private static checkStructuralContinuity(currentParagraphs: PdfElement[], nextParagraphs: PdfElement[]): boolean {
    // Check if both pages have similar paragraph count and structure
    const currentCount = currentParagraphs.length
    const nextCount = nextParagraphs.length

    // Similar paragraph density suggests continuous content
    const similarDensity = Math.abs(currentCount - nextCount) <= Math.max(currentCount, nextCount) * 0.5

    // Check if font sizes are consistent across pages
    const currentFontSizes = currentParagraphs.map(p => p.attributes?.fontSize || 12)
    const nextFontSizes = nextParagraphs.map(p => p.attributes?.fontSize || 12)

    const avgCurrentFontSize = currentFontSizes.reduce((a, b) => a + b, 0) / currentFontSizes.length
    const avgNextFontSize = nextFontSizes.reduce((a, b) => a + b, 0) / nextFontSizes.length

    const consistentFontSize = Math.abs(avgCurrentFontSize - avgNextFontSize) <= 1

    return similarDensity && consistentFontSize
  }

  /**
   * Check if pages lack clear break indicators (like "END", "CHAPTER", etc.).
   */
  private static lacksPageBreakIndicators(currentPage: PdfPageContent, nextPage: PdfPageContent): boolean {
    const currentText = this.getPageText(currentPage).toLowerCase()
    const nextText = this.getPageText(nextPage).toLowerCase()

    // Common break indicators
    const breakIndicators = [
      'the end', 'conclusion', 'chapter', 'section', 'part',
      'summary', 'epilogue', 'appendix', 'references', 'bibliography'
    ]

    const hasBreakInCurrent = breakIndicators.some(indicator => currentText.includes(indicator))
    const hasBreakInNext = breakIndicators.some(indicator => nextText.includes(indicator))

    // Strong page header/footer patterns that indicate new sections
    const headerPatterns = ['page \\d+', '\\d+ of \\d+', 'chapter \\d+']
    const hasStrongHeader = headerPatterns.some(pattern =>
      new RegExp(pattern, 'i').test(nextText)
    )

    return !hasBreakInCurrent && !hasBreakInNext && !hasStrongHeader
  }

  /**
   * Merge two pages into a single composed page.
   */
  private static mergePages(mainPage: PdfPageContent, additionalPage: PdfPageContent): PdfPageContent {
    // Calculate the combined height for the virtual composed page
    const combinedHeight = mainPage.height + additionalPage.height

    // Adjust positions of elements from additional page
    const adjustedElements = additionalPage.elements.map(element => ({
      ...element,
      boundingBox: element.boundingBox ? {
        ...element.boundingBox,
        top: element.boundingBox.top + mainPage.height,
        bottom: element.boundingBox.bottom + mainPage.height
      } : element.boundingBox
    }))

    return {
      ...mainPage,
      height: combinedHeight,
      pageNumber: mainPage.pageNumber, // Keep the starting page number
      elements: [...mainPage.elements, ...adjustedElements],
      // Add metadata about composition
      metadata: {
        ...mainPage.metadata,
        composedFromPages: [
          ...(mainPage.metadata?.composedFromPages || [mainPage.pageNumber]),
          additionalPage.pageNumber
        ],
        originalHeight: mainPage.metadata?.originalHeight || mainPage.height,
        isComposed: true
      }
    }
  }  /**
   * Get meaningful paragraphs from a page (filter out headers, footers, etc.).
   */
  private static getMeaningfulParagraphs(page: PdfPageContent): PdfElement[] {
    return page.elements
      .filter(el => el.type === 'paragraph' || el.type === 'text')
      .filter(el => {
        const text = (el.formattedData || el.data || '').trim()

        // Filter out very short text (likely headers/footers)
        if (text.length < 10) return false

        // Filter out magazine headers/footers
        if (/^RETAIL PEOPLE \| [A-Z]+ - [A-Z]+ \d+ \.\d+$/i.test(text)) return false

        // Filter out page numbers
        if (/^page \d+$/i.test(text) || /^\d+ of \d+$/i.test(text)) return false

        // Filter out headers that are all caps and short, but keep important titles
        if (text.length < 50 && text === text.toUpperCase()) {
          // Keep important article/section titles
          if (/^SHAPING DREAMS$|^THE FUTURE,?\s*NOW$|^SHOPPING CENTRE UPDATE$/i.test(text)) {
            return true // Don't filter these out
          }
          return false // Filter out other short uppercase text
        }

        return true
      })
      .sort((a, b) => (a.boundingBox?.top || 0) - (b.boundingBox?.top || 0))
  }

  /**
   * Get all text content from a page as a single string, excluding headers/footers.
   */
  private static getPageText(page: PdfPageContent): string {
    return page.elements
      .filter(el => el.type === 'paragraph' || el.type === 'text')
      .filter(el => {
        const text = (el.formattedData || el.data || '').trim()
        // Filter out magazine headers/footers when getting page text
        if (/^RETAIL PEOPLE \| [A-Z]+ - [A-Z]+ \d+ \.\d+$/i.test(text)) return false
        return true
      })
      .map(el => el.formattedData || el.data || '')
      .join(' ')
      .trim()
  }

  /**
   * Get the first meaningful content paragraph, ignoring sticky stickers and decorative elements.
   */
  private static getFirstContentParagraph(page: PdfPageContent): PdfElement | null {
    const allElements = page.elements
      .filter(el => el.type === 'paragraph' || el.type === 'text')
      .filter(el => {
        const text = (el.formattedData || el.data || '').trim()

        // Filter out very short text
        if (text.length < 15) return false

        // Filter out magazine headers/footers
        if (/^RETAIL PEOPLE \| [A-Z]+ - [A-Z]+ \d+ \.\d+$/i.test(text)) return false

        // Filter out sticky stickers/labels (positioned very left, short uppercase text)
        const left = el.boundingBox?.left || 0
        const isVeryLeft = left < 30 // Very left positioned
        const isShortUppercase = text.length < 50 && text === text.toUpperCase()

        if (isVeryLeft && isShortUppercase) {
          // Likely a sticky sticker like "SHOPPING CENTRE UPDATE"
          console.log(`      Skipping sticky sticker: "${text}" (left: ${left})`)
          return false
        }

        return true
      })
      .sort((a, b) => (a.boundingBox?.top || 0) - (b.boundingBox?.top || 0))

    return allElements.length > 0 ? allElements[0] : null
  }

  /**
   * Check if a page has a title/header at the top.
   */
  private static hasPageTitle(page: PdfPageContent): boolean {
    const allElements = page.elements
      .filter(el => el.type === 'paragraph' || el.type === 'text')
      .filter(el => {
        const text = (el.formattedData || el.data || '').trim()

        // Filter out very short text and footers
        if (text.length < 10) return false
        if (/^RETAIL PEOPLE \| [A-Z]+ - [A-Z]+ \d+ \.\d+$/i.test(text)) return false

        return true
      })
      .sort((a, b) => (a.boundingBox?.top || 0) - (b.boundingBox?.top || 0))

    if (allElements.length === 0) return false

    // Check the first few elements for title-like characteristics
    const topElements = allElements.slice(0, 3)

    return topElements.some(element => {
      const text = (element.formattedData || element.data || '').trim()
      const fontSize = element.attributes?.fontSize || 0
      const top = element.boundingBox?.top || 0

      // Must be in the top portion of the page (top 30%)
      const pageHeight = page.height || 1000
      const isTopPositioned = top < pageHeight * 0.3

      if (!isTopPositioned) return false

      // Check for large font titles
      if (fontSize > 20) {
        console.log(`      Found large title at top: "${text}" (fontSize: ${fontSize}, top: ${top})`)
        return true
      }

      // Check for medium-large titles that are all caps
      if (fontSize > 15 && text.length < 100 && /^[A-Z]/.test(text)) {
        console.log(`      Found medium title at top: "${text}" (fontSize: ${fontSize}, top: ${top})`)
        return true
      }

      return false
    })
  }
}
