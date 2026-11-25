import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'
import { hasArticleTitle, hasContentContinuity, isScreenshotPage, runningHeadTokens } from './heuristics/pageContinuity.js'

// A running-head token is continuity evidence only while it is RARE across the
// document: an article's subject kicker ("stable fly") spans 2-4 pages, while a
// section label ("BUSINESS", "minews") or the publication masthead spans many.
// Sharing a frequent token must not glue two different articles of one section.
const RUNNING_HEAD_MAX_PAGE_FREQUENCY = 4

// An article interrupted by advertising continues after it: the composer looks
// past this many standalone pages (ads, full-page images) for the page the
// article goes on with. Two covers a double-page ad, which in a split spread
// document is two logical pages; beyond that the pages are more likely to
// belong to different articles than to one.
const MAX_INTERLEAVED_STANDALONE_PAGES = 2

/** Where an article goes on after `fromIndex`, and the standalone pages passed over to get there. */
interface ArticleContinuation {
  nextIndex: number
  passedOver: number[]
}

/**
 * Composes PDF pages that belong to the same article into a single page. The
 * continuity decision (document-agnostic, ad-aware) lives in
 * ./heuristics/pageContinuity; this class only handles grouping and merging.
 *
 * The pages of an article are usually consecutive. When an ad or a full-page
 * image stands between two of them, the article is still composed as one page
 * and the standalone page follows it in the result, so the result is no longer
 * strictly in page order: a composed page's `metadata.composedFromPages` lists
 * its members, which then are not neighbours (e.g. [3, 5] with page 4 after).
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
    let index = 0

    while (index < pages.length) {
      const group: PdfPageContent[] = [pages[index]]
      // Standalone pages the article runs past, emitted after it.
      const passedOver: PdfPageContent[] = []
      let articleHasTitle = hasArticleTitle(pages[index])
      let lastIndex = index

      for (;;) {
        const continuation = this.findContinuation(pages, lastIndex, pageTokens, tokenPageFrequency, articleHasTitle)
        if (!continuation) break
        passedOver.push(...continuation.passedOver.map(passedIndex => pages[passedIndex]))
        group.push(pages[continuation.nextIndex])
        articleHasTitle = articleHasTitle || hasArticleTitle(pages[continuation.nextIndex])
        lastIndex = continuation.nextIndex
      }

      composedPages.push(group.length === 1 ? group[0] : this.composePageGroup(group))
      composedPages.push(...passedOver)
      index = lastIndex + 1
    }

    return composedPages
  }

  /**
   * The page the article of `pages[fromIndex]` goes on with: the page right
   * after it, or the page after one or two standalone pages (an ad between two
   * pages of one article). Null when the article ends at `fromIndex`.
   */
  private static findContinuation(
    pages: PdfPageContent[],
    fromIndex: number,
    pageTokens: string[][],
    tokenPageFrequency: Map<string, number>,
    articleHasTitle: boolean
  ): ArticleContinuation | null {
    const current = pages[fromIndex]
    const continuesWith = (candidateIndex: number): boolean => {
      const sharedRunningHead = this.hasSharedRareRunningHead(pageTokens[fromIndex], pageTokens[candidateIndex], tokenPageFrequency)
      return hasContentContinuity(current, pages[candidateIndex], sharedRunningHead, articleHasTitle)
    }

    const nextIndex = fromIndex + 1
    if (nextIndex >= pages.length) return null
    if (continuesWith(nextIndex)) return { nextIndex, passedOver: [] }

    // A standalone page itself never continues, and is never continued.
    if (isScreenshotPage(current)) return null

    const passedOver: number[] = []
    let candidateIndex = nextIndex
    while (
      candidateIndex < pages.length
      && passedOver.length < MAX_INTERLEAVED_STANDALONE_PAGES
      && isScreenshotPage(pages[candidateIndex])
    ) {
      passedOver.push(candidateIndex)
      candidateIndex++
    }
    if (passedOver.length === 0 || candidateIndex >= pages.length) return null
    return continuesWith(candidateIndex) ? { nextIndex: candidateIndex, passedOver } : null
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

    // Preserve each member's physical spread identity (aligned with
    // composedFromPages). Spreading firstPage.metadata below would otherwise
    // keep only the FIRST half's identity, and consumers rendering per-page
    // screenshots need the source page + half of every absorbed member.
    const composedFromSpreads = pages.map(page => (page.metadata as Record<string, unknown> | undefined)?.spread ?? null)

    // The running heads and feet of every member (the clean composer's
    // runningHeadText / runningFootText). The metadata spread below keeps the
    // FIRST page's only, and a consumer that has to tell page furniture from
    // content needs the folio of every page the article was printed on.
    const furnitureTexts = this.collectFurnitureTexts(pages)

    return {
      ...firstPage,
      title: `${firstPage.title} - ${lastPage.title}`,
      elements: orderedElements,
      pageNumber: firstPage.pageNumber,
      pageIndex: firstPage.pageIndex,
      metadata: {
        composedFromPages,
        ...(composedFromSpreads.some(spread => spread !== null) ? { composedFromSpreads } : {}),
        ...(furnitureTexts.length > 0 ? { furnitureTexts } : {}),
        originalHeight: totalOriginalHeight,
        isComposed: true,
        ...(firstPage.metadata || {}) // Preserve any existing metadata
      }
    }
  }

  /** The distinct running heads and feet of the pages, in page order. */
  private static collectFurnitureTexts(pages: PdfPageContent[]): string[] {
    const texts: string[] = []
    for (const page of pages) {
      const metadata = page.metadata as Record<string, unknown> | undefined
      for (const key of ['runningHeadText', 'runningFootText']) {
        const text = String(metadata?.[key] || '').trim()
        if (text && !texts.includes(text)) texts.push(text)
      }
    }
    return texts
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
