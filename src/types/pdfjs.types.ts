/**
 * Minimal STRUCTURAL types for the pdf.js objects this library touches.
 *
 * Deliberately local instead of importing pdfjs-dist's own types: the core has
 * always kept pdfjs-dist out of its published type surface (see the local
 * PDFDocumentProxy in core/PdfDocument.ts), and these interfaces only declare
 * the members our seams actually use, so a pdfjs-dist upgrade that keeps these
 * members type-checks unchanged.
 */

/** The subset of pdf.js PageViewport the library reads. */
export interface PdfJsViewport {
  width: number
  height: number
  // Transform matrix and scale exist on the real object; kept open for callers
  // that pass the viewport straight back into pdf.js APIs.
  [key: string]: unknown
}

/** One text run from pdf.js getTextContent(). */
export interface PdfJsTextItem {
  str?: string
  dir?: string
  // [scaleX, skewY, skewX, scaleY, translateX, translateY]
  transform: number[]
  width?: number
  height?: number
  fontName?: string
  hasEOL?: boolean
}

/** The subset of pdf.js PDFPageProxy the library calls. */
export interface PdfJsPage {
  getViewport(options: { scale: number }): PdfJsViewport
  getTextContent(options?: Record<string, unknown>): Promise<{ items: PdfJsTextItem[], styles?: Record<string, unknown> }>
  getAnnotations(options?: Record<string, unknown>): Promise<Array<Record<string, unknown>>>
  // Operator args are heterogeneous per opcode; callers destructure by op.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getOperatorList(): Promise<{ fnArray: number[], argsArray: any[][] }>
  render(options: Record<string, unknown>): { promise: Promise<void> }
  objs: { get(objectId: string, callback?: (obj: unknown) => void): unknown, has(objectId: string): boolean }
  commonObjs: { get(objectId: string, callback?: (obj: unknown) => void): unknown, has(objectId: string): boolean }
  cleanup?(): void
  // pdf.js internal 0-based index, read for page numbering in the extractor.
  _pageIndex?: number
  [key: string]: unknown
}
