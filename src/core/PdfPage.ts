
// Improved PdfPage with proper types and error handling
import pkg from 'pdfjs-dist'
import type {
  BoundingBox,
  ImageData,
  PDFPageProxy,
  PdfProcessingError,
  RenderOptions,
  RenderParameters,
  ViewportParameters
} from '../types/pdf.types.js'
import { CanvasManager } from '../utils/CanvasManager.js'
import { ValidationUtils } from '../utils/ValidationUtils.js'
import { PdfDocument } from './PdfDocument.js'
import { PdfOperatorFilter } from './PdfOperator.js'
import { PdfOperatorList } from './PdfOperatorList.js'
import { PdfOperatorSelectionFn } from './PdfOperatorSelection.js'
import { Operators } from './PdfOperatorTransforms.js'
import { PdfTextEvaluator } from './PdfTextEvaluator.js'
import { transformImageToArray } from './PdfUtil.js'

const { Util } = pkg

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
    const [x1, y1, x2, y2] = angle === 0
      ? [left, top, left + width, top + height]
      : Util.getAxialAlignedBoundingBox([0, 0, width, height], [angleCos, angleSin, -angleSin, angleCos, left, top])
    return { top: y1, right: x2, bottom: y2, left: x1, width: x2 - x1, height: y2 - y1 }
  }

  async imageToBlob({ objectId, width, height }: { objectId: string; width: number; height: number }): Promise<Buffer> {
    ValidationUtils.validateObjectId(objectId)

    // Apply aggressive memory safety for large images
    const MAX_IMAGE_SIZE = 1024
    const scale = Math.min(MAX_IMAGE_SIZE / Math.max(width, height), 1)
    const safeWidth = Math.max(1, Math.floor(width * scale))
    const safeHeight = Math.max(1, Math.floor(height * scale))

    return CanvasManager.withCanvas(safeWidth, safeHeight, async (canvas, context) => {
      const image = this.getObject(objectId)
      if (!image) {
        throw new Error(`Image object not found: ${objectId}`)
      }

      try {
        const data = transformImageToArray(image)

        // For very large images, skip canvas operations and return a minimal placeholder
        if (width * height > 2000000) { // 2 megapixels
          console.warn(`⚠️  Skipping large image ${objectId} (${width}x${height}) to prevent OOM`)
          // Create a small placeholder image
          context.fillStyle = '#f0f0f0'
          context.fillRect(0, 0, safeWidth, safeHeight)
          context.fillStyle = '#999'
          context.font = '12px Arial'
          context.fillText('Large Image', 10, 20)
          return CanvasManager.canvasToBuffer(canvas, 'image/png', 30)
        }

        // Create image data with scaled dimensions
        const imageData = context.createImageData(safeWidth, safeHeight)

        // If we're scaling down, we need to sample the original data
        if (scale < 1) {
          const originalWidth = image.width

          for (let y = 0; y < safeHeight; y++) {
            for (let x = 0; x < safeWidth; x++) {
              const srcX = Math.floor(x / scale)
              const srcY = Math.floor(y / scale)
              const srcIndex = (srcY * originalWidth + srcX) * 4
              const destIndex = (y * safeWidth + x) * 4

              imageData.data[destIndex] = data[srcIndex] || 0
              imageData.data[destIndex + 1] = data[srcIndex + 1] || 0
              imageData.data[destIndex + 2] = data[srcIndex + 2] || 0
              imageData.data[destIndex + 3] = data[srcIndex + 3] || 255
            }
          }
        } else {
          // Use original data if no scaling needed
          imageData.data.set(data.slice(0, imageData.data.length))
        }

        context.putImageData(imageData, 0, 0)
        return CanvasManager.canvasToBuffer(canvas, 'image/png', 40) // Lower quality
      } catch (error) {
        console.warn(`⚠️  Failed to process image ${objectId}, creating placeholder:`, error)
        // Create error placeholder
        context.fillStyle = '#ffeeee'
        context.fillRect(0, 0, safeWidth, safeHeight)
        context.fillStyle = '#cc0000'
        context.font = '10px Arial'
        context.fillText('Error', 5, 15)
        return CanvasManager.canvasToBuffer(canvas, 'image/png', 30)
      }
    })
  }

  async renderBlob(options: RenderOptions = {}): Promise<Buffer> {
    ValidationUtils.validateRenderOptions(options)

    // Apply ultra-aggressive memory-safe defaults for large PDFs
    const baseWidth = Math.min(this.viewport.width, 500) // Further reduced from 800
    const safeOptions = {
      type: 'image/jpeg' as const,
      quality: 25, // Much lower quality
      width: baseWidth,
      ...options
    }

    // Further reduce size if we detect high memory pressure
    const { MemoryManager } = await import('../utils/MemoryManager.js')
    const stats = MemoryManager.getMemoryStats()
    if (stats.used > 80) { // Lower threshold at 80MB
      safeOptions.width = Math.min(safeOptions.width, 300)
      safeOptions.quality = Math.min(safeOptions.quality, 20)
      console.log(`⚡ Memory pressure detected (${stats.used}MB), using minimal rendering`)
    }

    const scale = safeOptions.width / this.view.width
    const viewport = this.getViewport({ scale })

    return CanvasManager.withCanvas(viewport.width, viewport.height, async (canvas, canvasContext) => {
      await this.render({ canvasContext, viewport })

      // Force cleanup of render context
      if (canvasContext && typeof canvasContext.reset === 'function') {
        canvasContext.reset()
      }

      return CanvasManager.canvasToBuffer(canvas, safeOptions.type, safeOptions.quality)
    })
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
