// Type definitions for PDF.js and internal interfaces

/** PDF.js related types */
export interface PDFDocumentProxy {
  numPages: number
  fingerprint: string
  getPage(pageNumber: number): Promise<PDFPageProxy>
  getOutline(): Promise<any>
  getData(): Promise<Uint8Array>
}

export interface PDFPageProxy {
  pageNumber: number
  _pageIndex: number
  view: [number, number, number, number]
  commonObjs: {
    get(objectId: string): any
    has(objectId: string): boolean
  }
  objs: {
    get(objectId: string): any
    has(objectId: string): boolean
    _objs: any
  }
  getViewport(params: ViewportParameters): PageViewport
  getAnnotations(): Promise<Annotation[]>
  getTextContent(): Promise<TextContent>
  render(params: RenderParameters): { promise: Promise<void> }
}

export interface ViewportParameters {
  scale: number
  rotation?: number
}

export interface PageViewport {
  width: number
  height: number
  transform: number[]
  convertToViewportRectangle(rect: number[]): number[]
}

export interface RenderParameters {
  canvasContext: any // Canvas 2D context from node-canvas
  viewport: PageViewport
}

export interface TextContent {
  items: TextItem[]
}

export interface TextItem {
  str: string
  fontName: string
  width: number
  height: number
  transform: number[]
}

export interface Annotation {
  id: string
  type: string
  rect: number[]
  [key: string]: any
}

/** Application-specific types */
export interface ImageData {
  boundingBox: BoundingBox
  data: Buffer
  objectId: string
  contentType: 'image/png' | 'image/jpeg'
}

export interface BoundingBox {
  readonly left: number
  readonly right: number
  readonly bottom: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface RenderOptions {
  readonly width?: number
  readonly type?: 'image/jpeg' | 'image/png'
  readonly quality?: number
}

export interface FontInfo {
  readonly raw: string
  readonly identifier: string
  readonly fontFamily: string
  readonly fontWeight: 'normal' | 'bold'
  readonly fontStyle: 'normal' | 'italic'
}

/** Canvas cleanup interface */
export interface CanvasLike {
  width: number
  height: number
  toBuffer(type: string, options?: { quality: number }): Buffer
}

/** Error types */
export class PdfProcessingError extends Error {
  constructor(
    message: string,
    public readonly pageIndex?: number,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'PdfProcessingError'
  }
}

export class MemoryError extends PdfProcessingError {
  constructor(message: string, pageIndex?: number) {
    super(`Memory error: ${message}`, pageIndex)
    this.name = 'MemoryError'
  }
}

export class InvalidPdfError extends PdfProcessingError {
  constructor(message: string) {
    super(`Invalid PDF: ${message}`)
    this.name = 'InvalidPdfError'
  }
}
