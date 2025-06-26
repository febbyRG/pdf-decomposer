// Use the local type for PDFDocumentProxy to avoid dependency on pdfjs-dist types
export type PDFDocumentProxy = any
import { PdfOperatorList } from './PdfOperatorList.js'
import { PdfPage } from './PdfPage.js'

export class PdfDocument {
  readonly pages: PdfPage[] = []

  constructor(private proxy: PDFDocumentProxy, private scale?: number) { }


  async process(onProgress?: (event: { loaded: number, total: number }) => void) {
    for (let pageNumber = 1; pageNumber <= this.proxy.numPages; pageNumber += 1) {
      const proxy = await this.proxy.getPage(pageNumber)
      const operators = await proxy.getOperatorList()
      const list = new PdfOperatorList(operators)
      const scale = this.scale ?? 1024 / (proxy.view[3] - proxy.view[1])
      const page = new PdfPage(this, proxy, list, scale)
      this.pages.push(page)
      if (onProgress) { onProgress({ loaded: pageNumber, total: this.proxy.numPages }) }
    }
  }

  getPage(pageNumber: number) { return this.pages[pageNumber - 1] }
  getOutline() { return this.proxy.getOutline() }
  getData() { return this.proxy.getData() }

  get fingerprint() { return this.proxy.fingerprint }
  get numPages() { return this.proxy.numPages }
}
