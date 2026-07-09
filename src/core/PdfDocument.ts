// Use the local type for PDFDocumentProxy to avoid dependency on pdfjs-dist types
export type PDFDocumentProxy = any
import { PdfOperatorList } from './PdfOperatorList.js'
import { PdfPage } from './PdfPage.js'
import { logger } from '../utils/Logger.js'

/**
 * Wraps a PDF.js document. Pages are built lazily on first access and can be
 * released individually (via releasePage) or all at once (via releaseAll).
 *
 * Releasing a page calls pdf.js's PDFPageProxy.cleanup() to drop worker-side
 * state, then evicts the wrapper. The same page can be re-requested afterwards
 * and will be rebuilt on demand.
 */
export class PdfDocument {
  private pageCache: Map<number, PdfPage> = new Map()
  private destroyed = false

  constructor(private proxy: PDFDocumentProxy, private scale?: number) { }

  /**
   * Kept for backwards compatibility. Previously eagerly loaded every page's
   * operator list at initialize time, which cost ~3-4 MB RSS per page. Now a
   * no-op besides progress reporting — pages are built lazily by getPage().
   */
  async process(onProgress?: (event: { loaded: number, total: number }) => void) {
    if (onProgress) {
      const total = this.proxy.numPages
      onProgress({ loaded: total, total })
    }
  }

  async getPage(pageNumber: number): Promise<PdfPage> {
    if (this.destroyed) {
      throw new Error('PdfDocument has been destroyed')
    }
    const cached = this.pageCache.get(pageNumber)
    if (cached) return cached

    const proxy = await this.proxy.getPage(pageNumber)
    const operators = await proxy.getOperatorList()
    const list = new PdfOperatorList(operators)
    const scale = this.scale ?? 1024 / (proxy.view[3] - proxy.view[1])
    const page = new PdfPage(this, proxy, list, scale)
    this.pageCache.set(pageNumber, page)
    return page
  }

  /**
   * Release pdf.js worker-side state for a page and evict the wrapper from
   * the cache. Safe to call repeatedly; rebuild happens on next getPage(n).
   */
  async releasePage(pageNumber: number): Promise<void> {
    const cached = this.pageCache.get(pageNumber)
    if (!cached) return
    this.pageCache.delete(pageNumber)
    try {
      await cached.cleanup()
    } catch (error) {
      logger.warn(`Failed to cleanup page ${pageNumber}:`, error)
    }
  }

  /**
   * Release every cached page. Subsequent getPage() calls rebuild as needed.
   * Also asks pdf.js to drop its document-level caches (fonts, color spaces,
   * image dictionaries) which accumulate across pages and aren't reached by
   * per-page cleanup alone.
   */
  async releaseAll(): Promise<void> {
    const pages = Array.from(this.pageCache.values())
    this.pageCache.clear()
    for (const page of pages) {
      try {
        await page.cleanup()
      } catch (error) {
        logger.warn('Failed to cleanup page during releaseAll:', error)
      }
    }
    await this.cleanupCaches()
  }

  /**
   * Drop pdf.js's document-level caches without destroying the document.
   * Safe to call between page batches in a long-running loop.
   */
  async cleanupCaches(): Promise<void> {
    if (this.destroyed) return
    try {
      await this.proxy.cleanup?.()
    } catch (error) {
      logger.warn('Failed to cleanup pdf.js document caches:', error)
    }
  }

  /**
   * Terminate the underlying PDF.js document. After destroy(), the instance
   * is unusable. Call this in a dispose() path.
   */
  async destroy(): Promise<void> {
    if (this.destroyed) return
    this.destroyed = true
    await this.releaseAll()
    try {
      await this.proxy.destroy?.()
    } catch (error) {
      logger.warn('Failed to destroy PDF.js document:', error)
    }
  }

  async getRawPage(pageNumber: number) {
    if (this.destroyed) throw new Error('PdfDocument has been destroyed')
    return await this.proxy.getPage(pageNumber)
  }

  getOutline() { return this.proxy.getOutline() }
  getData() { return this.proxy.getData() }

  get fingerprint() { return this.proxy.fingerprint }
  get numPages() { return this.proxy.numPages }
  get isDestroyed() { return this.destroyed }

  // Expose raw PDF.js proxy for screenshot functionality
  get rawProxy() { return this.proxy }

  // Legacy compatibility: a list-like view of currently-cached pages.
  // Most callers should use getPage(n) directly instead of touching this.
  get pages(): PdfPage[] {
    return Array.from(this.pageCache.values())
  }
}
