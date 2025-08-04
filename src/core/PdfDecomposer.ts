
import { MemoryManager } from '../utils/MemoryManager.js'
import { PdfDecomposerPage } from './PdfDecomposerPage.js'
import { PdfDocument } from './PdfDocument.js'
import { PdfElementComposer } from './PdfElementComposer.js'
import { PdfPageComposer } from './PdfPageComposer.js'

export interface DecomposeError {
  message: string
  pageIndex: number
}

export interface PdfDecomposeState {
  progress: number
  message: string
  processing: boolean
}

export interface Package {
  state?: PdfDecomposeState
  fingerprint?: string
  pkgDir: { create(): Promise<void> }
  pages: any[]
  thumbnail?: any
}

export class PdfDecomposer {
  private observable: Array<(state: PdfDecomposeState) => void> = []
  private currentProgress = 0
  public decomposeError: Array<(error: DecomposeError) => void> = []

  constructor(
    public pdfDoc: PdfDocument,
    public pkg: Package,
    private skipDecompose = false,
    private extractImages = false,
    private elementComposer = false,
    private pageComposer = false
  ) { }

  async decompose(startPage = 1, endPage = Infinity) {
    this.notify({ progress: 0, message: 'Loading ...', processing: true })
    this.currentProgress = 0
    this.update('Preparing your PDF...', 0)
    this.pkg.fingerprint = this.pdfDoc.fingerprint
    await this.pkg.pkgDir.create()

    // Calculate actual page range
    const totalPages = this.pdfDoc.numPages
    const actualStartPage = Math.max(1, startPage)
    const actualEndPage = Math.min(totalPages, endPage === Infinity ? totalPages : endPage)
    const total = actualEndPage - actualStartPage + 1

    this.update('Loading document', 0, 10)
    this.pkg.pages = []

    // Log initial memory usage
    const initialMemory = MemoryManager.getMemoryStats()
    console.log(`🧠 Starting decomposition with ${initialMemory.used}MB used`)
    console.log(`🚀 Processing pages ${actualStartPage}-${actualEndPage} (${total} pages) sequentially`)

    // Process pages sequentially (single-threaded)
    for (let pageIndex = 0; pageIndex < total; pageIndex++) {
      const actualPageNumber = actualStartPage + pageIndex

      try {
        // Monitor memory before page processing
        await MemoryManager.withMemoryMonitoring(async () => {
          const page = new PdfDecomposerPage(this, actualPageNumber, this.skipDecompose, this.extractImages)
          this.pkg.pages[pageIndex] = await page.decompose()

          if (pageIndex === 0 && this.pkg.pages[0]) {
            this.pkg.thumbnail = this.pkg.pages[0].thumbnail
          }
        }, {
          maxMemoryMB: 300,
          gcThresholdMB: 150,
          aggressiveCleanup: true
        })

        const loaded = pageIndex + 1
        this.update(`Processed ${loaded} pages out of ${total}`, 10, 80, { loaded, total })        // Periodic memory cleanup every 5 pages to prevent accumulation
        if ((pageIndex + 1) % 5 === 0 && pageIndex + 1 < total) {
          console.log(`🧹 Page ${actualPageNumber} complete, cleaning up memory...`)
          await MemoryManager.cleanupMemory()

          const memoryAfterCleanup = MemoryManager.getMemoryStats()
          console.log(`🧠 Memory after cleanup: ${memoryAfterCleanup.used}MB`)
        }

      } catch (error) {
        this.notifyDecomposeError({
          message: (error as Error).message,
          pageIndex: actualPageNumber
        })
        this.pkg.pages[pageIndex] = null

        // Emergency cleanup on error
        await MemoryManager.cleanupMemory()
      }
    } this.update('Saving your Package', 85)
    this.pkg.pages = this.pkg.pages.filter((page) => page != null)

    // Apply element composition if requested
    if (this.elementComposer) {
      this.update('Composing elements into paragraphs', 88)
      this.pkg.pages = PdfElementComposer.composeElements(this.pkg.pages)
    }

    // Apply page composition if requested
    if (this.pageComposer) {
      this.update('Composing pages with continuous content', 92)
      this.pkg.pages = PdfPageComposer.composePages(this.pkg.pages)
    }

    this.update('Finalizing your PDF', 95)
    this.notify({ progress: 100, message: 'Completed', processing: false })
    return this
  }

  private update(message: string, startProgress = this.currentProgress, endProgress = startProgress, event?: any) {
    const progressDelta = endProgress - startProgress
    const progress =
      startProgress + (event ? (event.loaded / event.total) * progressDelta : progressDelta)
    if (progress < this.currentProgress) {
      return
    }
    this.currentProgress = progress
    this.notify({ progress, message, processing: true })
  }

  subscribe(fn: (state: PdfDecomposeState) => void) {
    this.observable.push(fn)
  }

  private notify(state: PdfDecomposeState) {
    for (const fn of this.observable) fn(state)
    this.pkg.state = state
  }

  private notifyDecomposeError(error: DecomposeError) {
    for (const fn of this.decomposeError) fn(error)
  }

  async getFingerprints() {
    const pdfHash = this.pdfDoc.fingerprint
    const total = this.pdfDoc.numPages
    const pageHashes: string[] = []
    for (let index = 0; index < total; index++) {
      const page = this.pdfDoc.getPage(index + 1)
      if (page) {
        pageHashes.push(page.fingerprint)
      }
    }
    return { pdfHash, pageHashes, total }
  }
}
