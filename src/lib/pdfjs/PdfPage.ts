
// Fix for CommonJS import of Util from pdfjs-dist
import { createCanvas } from 'canvas'
import pkg from 'pdfjs-dist'
import { PdfDocument } from './PdfDocument.js'
import { PdfOperatorFilter } from './PdfOperator.js'
import { PdfOperatorList } from './PdfOperatorList.js'
import { PdfOperatorSelectionFn } from './PdfOperatorSelection.js'
import { Operators } from './PdfOperatorTransforms.js'
import { PdfTextEvaluator } from './PdfTextEvaluator.js'
import { transformImageToArray } from './PdfUtil.js'
const { Util } = pkg


export interface BoundingBox {
  left: number
  right: number
  bottom: number
  top: number
  width: number
  height: number
}

export interface PdfRenderOptions {
  width?: number
  type?: string
  quality?: number
}

// const PDF_RENDER_DEFAULTS = { type: 'image/jpeg', quality: 75 }

type GetViewportParameters = any
type PDFPageProxy = any
type RenderParameters = any
// type PageViewport = any


export class PdfPage {
  public viewport: any


  constructor(public document: PdfDocument, private proxy: PDFPageProxy, public operatorList: PdfOperatorList, scale: number) {
    this.viewport = proxy.getViewport({ scale })
  }

  /**
   * Public method to get annotations for this page (calls PDF.js proxy).
   */
  public async getAnnotations() {
    if (this.proxy && typeof this.proxy.getAnnotations === 'function') {
      return await this.proxy.getAnnotations()
    }
    return []
  }

  getViewport(params: GetViewportParameters) {
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

  extractImages() {
    const items = this.extractAll<Operators>(['paintImageXObject', 'paintJpegXObject'], (selection) => { selection.before('transform').after('setGState') })
      .filter(({ paintImageXObject, paintJpegXObject }) => this.hasObject((paintImageXObject ?? paintJpegXObject).objectId))
      .filter(({ setGState }) =>
        !setGState || setGState.fillAlpha == null ||
        (setGState.globalCompositeOperation === 'multiply' ? false : setGState.fillAlpha === 1 && setGState.strokeAlpha === 1)
      ).map(({ transform, paintImageXObject, paintJpegXObject }) => ({
        transform,
        paintXObject: paintImageXObject ?? paintJpegXObject,
        contentType: paintImageXObject ? 'image/png' : 'image/jpeg'
      } as Pick<Operators, 'paintXObject' | 'transform'> & { contentType: string }))

    return Promise.all(items.map(async ({ transform, paintXObject, contentType }) => {
      const boundingBox = this.transformToBoundingBox(transform)
      const data = await this.imageToBlob(paintXObject)
      const { objectId } = paintXObject
      return { boundingBox, data, objectId, contentType }
    }))
  }

  getCommonObject(objectId: string) {
    return this.proxy.commonObjs.get(objectId)
  }

  hasCommonObject(objectId: string) {
    return this.proxy.commonObjs.has(objectId)
  }

  getObject(objectId: string) {
    return this.proxy.objs.get(objectId)
  }

  hasObject(objectId: string) {
    return this.proxy.objs.has(objectId)
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
    const [x1, y1, x2, y2] = angle === 0
      ? [left, top, left + width, top + height]
      : Util.getAxialAlignedBoundingBox([0, 0, width, height], [angleCos, angleSin, -angleSin, angleCos, left, top])
    return { top: y1, right: x2, bottom: y2, left: x1, width: x2 - x1, height: y2 - y1 }
  }

  imageToBlob({ objectId, width, height }: any): Promise<Buffer> {
    // Use node-canvas for server-side rendering
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    const image = this.getObject(objectId)
    const data = transformImageToArray(image)
    const imageData = context.createImageData(image.width, image.height)
    imageData.data.set(data)
    context.putImageData(imageData, 0, 0)
    // Return a PNG buffer
    return Promise.resolve(canvas.toBuffer('image/png'))
  }

  async renderBlob(options: any = {}): Promise<Buffer> {
    // Use node-canvas for server-side rendering
    const { width, type, quality } = { type: 'image/jpeg', quality: 75, width: this.viewport.width, ...options }
    const scale = width / this.view.width
    const viewport = this.getViewport({ scale })
    const canvas = createCanvas(viewport.width, viewport.height)
    const canvasContext = canvas.getContext('2d')
    await this.render({ canvasContext, viewport })
    // Return a buffer in the requested format
    return Promise.resolve(canvas.toBuffer(type, { quality }))
  }

  async extractText() {
    const evaluator = new PdfTextEvaluator(this)
    this.selectAll('beginText', (selector) => { selector.after('endText').fill() }).forEach((selection) => { evaluator.process(selection) })
    return evaluator.elements
  }

  getTextContent() {
    return this.proxy.getTextContent()
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
