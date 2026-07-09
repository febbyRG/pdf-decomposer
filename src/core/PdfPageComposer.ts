import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'
import { hasContentContinuity, runningHeadTokens } from './heuristics/pageContinuity.js'

// A running-head token is continuity evidence only while it is RARE across the
// document: an article's subject kicker ("stable fly") spans 2-4 pages, while a
// section label ("BUSINESS", "minews") or the publication masthead spans many.
// Sharing a frequent token must not glue two different articles of one section.
const RUNNING_HEAD_MAX_PAGE_FREQUENCY = 4

/**
 * Composes consecutive PDF pages that belong to the same article into a single
 * page. The continuity decision (document-agnostic, ad-aware) lives in
 * ./heuristics/pageContinuity; this class only handles grouping and merging.
 */
export class PdfPageComposer {
  /**
   * Analyze and compose pages that have continuous content flow.
   * @param pages Array of PDF page content
   * @returns Array of composed pages with merged continuous content
   */
  static composePages(pages: PdfPageContent[]): PdfPageContent[] {
    if (pages.length <= 1) return pages

    // Document-wide running-head token frequency (pages containing each token).
    const pageTokens = pages.map(page => runningHeadTokens(page))
    const tokenPageFrequency = new Map<string, number>()
    for (const tokens of pageTokens) {
      for (const token of tokens) {
        tokenPageFrequency.set(token, (tokenPageFrequency.get(token) || 0) + 1)
      }
    }

    const composedPages: PdfPageContent[] = []
    let currentPageGroup: PdfPageContent[] = []

    for (let i = 0; i < pages.length; i++) {
      const currentPage = pages[i]
      const nextPage = i < pages.length - 1 ? pages[i + 1] : null

      // Add current page to group
      currentPageGroup.push(currentPage)

      // Check if content continues to next page
      const sharedRunningHead = nextPage !== null
        && this.hasSharedRareRunningHead(pageTokens[i], pageTokens[i + 1], tokenPageFrequency)
      const continuesToNext = nextPage && hasContentContinuity(currentPage, nextPage, sharedRunningHead)

      if (!continuesToNext) {
        // Content ends here - finalize the current group
        if (currentPageGroup.length === 1) {
          composedPages.push(currentPageGroup[0])
        } else {
          composedPages.push(this.composePageGroup(currentPageGroup))
        }
        currentPageGroup = []
      }
    }

    // Handle any remaining pages
    if (currentPageGroup.length > 0) {
      if (currentPageGroup.length === 1) {
        composedPages.push(currentPageGroup[0])
      } else {
        composedPages.push(this.composePageGroup(currentPageGroup))
      }
    }

    return composedPages
  }

  /**
   * Both pages carry the IDENTICAL running-head token set, the set names a
   * subject (2+ tokens), and at least one token is rare document-wide.
   *
   * All three conditions are load-bearing. An article's kicker repeats
   * verbatim on its pages ("BUSINESS stable fly" / "stable fly BUSINESS" =
   * the same set), while two adjacent articles of one section differ ("CEO
   * report UPFRONT" vs "UPFRONT CEO"). The 2-token minimum drops bare section
   * labels ("minews", "BEEINFORMED") that facing pages of DIFFERENT articles
   * share verbatim. The rarity bound drops long-running section kickers.
   */
  private static hasSharedRareRunningHead(
    currentTokens: string[],
    nextTokens: string[],
    tokenPageFrequency: Map<string, number>
  ): boolean {
    if (currentTokens.length < 2 || currentTokens.length !== nextTokens.length) return false
    const nextSet = new Set(nextTokens)
    if (!currentTokens.every(token => nextSet.has(token))) return false
    return currentTokens.some(token => (tokenPageFrequency.get(token) || 0) <= RUNNING_HEAD_MAX_PAGE_FREQUENCY)
  }

  /**
   * Compose multiple pages into a single page with proper element ordering.
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

    // Preserve reading order established by PdfElementComposer; only ensure pages
    // are concatenated in the correct sequence.
    const orderedElements = this.orderElementsSpatially(allElements)

    const totalOriginalHeight = pages.reduce((sum, page) => sum + page.height, 0)

    // Collect page indexes for metadata (0-based for consistency)
    const composedFromPages = pages.map(page => page.pageIndex)

    return {
      ...firstPage,
      title: `${firstPage.title} - ${lastPage.title}`,
      elements: orderedElements,
      pageNumber: firstPage.pageNumber,
      pageIndex: firstPage.pageIndex,
      metadata: {
        composedFromPages,
        originalHeight: totalOriginalHeight,
        isComposed: true,
        ...(firstPage.metadata || {}) // Preserve any existing metadata
      }
    }
  }

  /**
   * Concatenate elements page by page, preserving the per-page reading order
   * already established by PdfElementComposer.
   */
  private static orderElementsSpatially(elements: PdfElement[]): PdfElement[] {
    const elementsByPage = new Map<number, PdfElement[]>()

    elements.forEach(element => {
      const pageIndex = element.pageIndex || 0
      if (!elementsByPage.has(pageIndex)) {
        elementsByPage.set(pageIndex, [])
      }
      elementsByPage.get(pageIndex)?.push(element)
    })

    const orderedElements: PdfElement[] = []
    const sortedPageIndexes = Array.from(elementsByPage.keys()).sort((a, b) => a - b)

    for (const pageIndex of sortedPageIndexes) {
      const pageElements = elementsByPage.get(pageIndex)
      if (pageElements) {
        orderedElements.push(...pageElements)
      }
    }

    return orderedElements
  }
}
