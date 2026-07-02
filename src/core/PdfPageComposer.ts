import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'
import { hasContentContinuity } from './heuristics/pageContinuity.js'

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

    const composedPages: PdfPageContent[] = []
    let currentPageGroup: PdfPageContent[] = []

    for (let i = 0; i < pages.length; i++) {
      const currentPage = pages[i]
      const nextPage = i < pages.length - 1 ? pages[i + 1] : null

      // Add current page to group
      currentPageGroup.push(currentPage)

      // Check if content continues to next page
      const continuesToNext = nextPage && hasContentContinuity(currentPage, nextPage)

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
