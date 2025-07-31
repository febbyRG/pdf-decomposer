
// Improved PdfPage with proper types and error handling
import * as pdfjs from 'pdfjs-dist'
import type {
  BoundingBox,
  ImageData,
  PDFPageProxy,
  PdfProcessingError,
  RenderOptions,
  RenderParameters,
  ViewportParameters
} from '../types/pdf.types.js'
import { ValidationUtils } from '../utils/ValidationUtils.js'
import { PdfDocument } from './PdfDocument.js'
import { PdfOperatorFilter } from './PdfOperator.js'
import { PdfOperatorList } from './PdfOperatorList.js'
import { PdfOperatorSelectionFn } from './PdfOperatorSelection.js'
import { Operators } from './PdfOperatorTransforms.js'
import { PdfTextEvaluator } from './PdfTextEvaluator.js'

const { Util } = (pdfjs as any)

// Legacy export for backwards compatibility
export type PdfRenderOptions = RenderOptions

// Re-export for backwards compatibility
export type { BoundingBox } from '../types/pdf.types.js'


export class PdfPage {
  public viewport: any


  constructor(public document: PdfDocument, private proxy: PDFPageProxy, public operatorList: PdfOperatorList, scale: number) {
    this.viewport = proxy.getViewport({ scale })
  }

  /**
   * Public method to get annotations for this page (calls PDF.js proxy).
   */
  public async getAnnotations() {
    try {
      if (this.proxy && typeof this.proxy.getAnnotations === 'function') {
        return await this.proxy.getAnnotations()
      }
      return []
    } catch (error) {
      console.warn('Failed to get annotations:', error)
      return []
    }
  }

  getViewport(params: ViewportParameters) {
    return this.proxy.getViewport(params)
  }

  async render(params: RenderParameters) {
    const _objs = this.proxy.objs._objs
    const result = await this.proxy.render(params).promise
    this.proxy.objs._objs = _objs
    return result
  }

  selectAll(filter?: string | string[] | PdfOperatorFilter, fn?: PdfOperatorSelectionFn) {
    return this.operatorList.selectAll(filter, fn)
  }

  extractAll<T extends object>(filter?: string | string[] | PdfOperatorFilter, fn?: PdfOperatorSelectionFn): T[] {
    return this.selectAll(filter, fn).map((selection) => selection.extract<T>())
  }

  async extractImages(): Promise<ImageData[]> {
    try {
      const items = this.extractAll<Operators>(['paintImageXObject', 'paintJpegXObject'], (selection) => {
        selection.before('transform').after('setGState')
      })
        .filter(({ paintImageXObject, paintJpegXObject }) =>
          this.hasObject((paintImageXObject ?? paintJpegXObject).objectId)
        )
        .filter(({ setGState }) =>
          !setGState || setGState.fillAlpha == null ||
          (setGState.globalCompositeOperation === 'multiply' ? false : setGState.fillAlpha === 1 && setGState.strokeAlpha === 1)
        )
        .map(({ transform, paintImageXObject, paintJpegXObject }) => ({
          transform,
          paintXObject: paintImageXObject ?? paintJpegXObject,
          contentType: paintImageXObject ? 'image/png' as const : 'image/jpeg' as const
        }))

      return await Promise.all(items.map(async ({ transform, paintXObject, contentType }) => {
        const boundingBox = this.transformToBoundingBox(transform)
        const data = await this.imageToBlob(paintXObject)
        const { objectId } = paintXObject
        return { boundingBox, data, objectId, contentType }
      }))
    } catch (error) {
      const processingError = error as PdfProcessingError
      console.error('Failed to extract images:', processingError.message)
      return []
    }
  }

  /**
   * Safely get object from PDF with validation
   */
  getObject(objectId: string) {
    ValidationUtils.validateObjectId(objectId)
    return this.proxy.objs.get(objectId)
  }

  hasObject(objectId: string): boolean {
    try {
      ValidationUtils.validateObjectId(objectId)
      return this.proxy.objs.has(objectId)
    } catch {
      return false
    }
  }

  /**
   * Safely get common object from PDF with validation
   */
  getCommonObject(objectId: string) {
    ValidationUtils.validateObjectId(objectId)
    return this.proxy.commonObjs.get(objectId)
  }

  hasCommonObject(objectId: string): boolean {
    try {
      ValidationUtils.validateObjectId(objectId)
      return this.proxy.commonObjs.has(objectId)
    } catch {
      return false
    }
  }

  transformToBoundingBox(transform: number[]): BoundingBox {
    const tx = Util.transform(this.viewport.transform, transform)
    const angle = Math.atan2(tx[1], tx[0])
    const height = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3])
    const width = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1])
    const angleCos = angle === 0 ? 1 : Math.cos(angle)
    const angleSin = angle === 0 ? 0 : Math.sin(angle)
    const left = tx[4] + height * angleSin
    const top = tx[5] - height * angleCos

    let bbox: number[]
    if (angle === 0) {
      bbox = [left, top, left + width, top + height]
    } else {
      bbox = []
      Util.axialAlignedBoundingBox([0, 0, width, height], [angleCos, angleSin, -angleSin, angleCos, left, top], bbox)
    }

    const [x1, y1, x2, y2] = bbox
    return { top: y1, right: x2, bottom: y2, left: x1, width: x2 - x1, height: y2 - y1 }
  }

  async imageToBlob({ objectId, width: _width, height: _height }: { objectId: string; width: number; height: number }): Promise<Buffer> {
    ValidationUtils.validateObjectId(objectId)

    // Canvas-free implementation: return empty buffer with warning
    console.warn(`⚠️ imageToBlob method disabled in Canvas-free mode (objectId: ${objectId})`)
    return Buffer.alloc(0)
  }

  async renderBlob(options: RenderOptions = {}): Promise<Buffer> {
    ValidationUtils.validateRenderOptions(options)

    // Canvas-free implementation: return empty buffer with warning
    console.warn('⚠️ renderBlob method disabled in Canvas-free mode')
    return Buffer.alloc(0)
  }

  async extractText() {
    const evaluator = new PdfTextEvaluator(this)
    this.selectAll('beginText', (selector) => { selector.after('endText').fill() }).forEach((selection) => { evaluator.process(selection) })
    return evaluator.elements
  }

  getTextContent() {
    // Fix for pdfjs-dist@2.6.347: getTextContent() needs options parameter
    // Use type assertion to handle runtime vs compile-time API differences
    return (this.proxy as any).getTextContent({ normalizeWhitespace: false })
  }

  get title() { return `Page ${this.proxy.pageNumber}` }
  get pageNumber() { return this.proxy.pageNumber }
  get pageIndex() { return this.proxy._pageIndex }
  get width() { return this.viewport.width }
  get height() { return this.viewport.height }
  get fingerprint() { return this.operatorList.fingerprint }
  get view(): BoundingBox {
    const [left, bottom, right, top] = this.proxy.view
    return { left, right, bottom, top, width: right - left, height: top - bottom }
  }
}
