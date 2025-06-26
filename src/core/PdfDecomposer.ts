
import { PdfDocument } from "./PdfDocument.js"

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
  private observable: Array<(state: PdfDecomposeState) => void> = [];
  private currentProgress = 0;
  public decomposeError: Array<(error: DecomposeError) => void> = [];

  constructor(public pdfDoc: PdfDocument, public pkg: Package, private skipDecompose = false) { }

  async decompose(limit: number = Infinity) {
    this.notify({ progress: 0, message: 'Loading ...', processing: true })
    this.currentProgress = 0
    this.update('Preparing your PDF...', 0)
    this.pkg.fingerprint = this.pdfDoc.fingerprint
    await this.pkg.pkgDir.create()
    const total = Math.min(this.pdfDoc.numPages, limit)
    this.update('Loading document', 0, 10)
    this.pkg.pages = []
    await Promise.all(
      Array.from(Array(total).keys()).map(async (pageIndex: number) => {
        const page = new (globalThis as any).PdfDecomposerPage(this, pageIndex + 1, this.skipDecompose)
        this.pkg.pages[pageIndex] = await page.decompose().catch(({ message }: Error) => {
          this.notifyDecomposeError({ message, pageIndex: pageIndex + 1 })
          return null
        })
        if (pageIndex === 0 && this.pkg.pages[0]) {
          this.pkg.thumbnail = this.pkg.pages[0].thumbnail
        }
        const loaded = this.pkg.pages.length
        this.update(`Processed ${loaded} pages out of ${total}`, 10, 80, { loaded, total })
      })
    )
    this.update('Saving your Package', 85)
    this.pkg.pages = this.pkg.pages.filter((page) => page != null)
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
