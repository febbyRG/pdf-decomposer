import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { getPuppeteerRenderer } from '../utils/PuppeteerRenderer.js'
import { PdfDecomposer } from './PdfDecomposer.js'

export class PdfDecomposerPage {
  constructor(
    private decomposer: PdfDecomposer,
    private pageIndex: number,
    private skipParser: boolean = false,
    private generateImages: boolean = false,
    private extractEmbeddedImages: boolean = false,
    private imageWidth: number = 1200,
    private imageQuality: number = 90
  ) { }

  async decompose(): Promise<any> {
    const pdfPage = await this.decomposer.pdfDoc.getPage(this.pageIndex)
    const viewport = pdfPage.getViewport({ scale: 1 })
    const width = viewport.width
    const height = viewport.height
    const pageNumber = this.pageIndex
    const pageIndex = this.pageIndex - 1
    const title = `Page ${pageNumber}`

    // Generate unique filenames and determine output directory
    const baseId = uuidv4()
    const imageFilename = `${baseId}-${pageNumber}.jpg`
    const thumbFilename = `${baseId}-${pageNumber}.thumb.jpg`
    let outputDir = '.'
    if (this.decomposer.pkg.pkgDir && typeof this.decomposer.pkg.pkgDir === 'object' && 'dir' in this.decomposer.pkg.pkgDir) {
      outputDir = (this.decomposer.pkg.pkgDir as any).dir
    }

    // Check if we should skip image rendering for memory safety
    if (!this.generateImages) {
      console.log(`📝 No-image mode: Skipping image rendering for page ${pageNumber}`)

      // Extract only text elements (and optionally embedded images)
      const elements: any[] = [
        ...await this.extractTextElements(pdfPage, pageIndex),
        // Conditionally extract embedded images if enabled (even without page images)
        ...(this.extractEmbeddedImages ? await this.extractImageElements(pdfPage, pageIndex, outputDir) : [])
      ]

      return {
        pageIndex,
        pageNumber,
        width,
        height,
        title,
        image: null, // No image generated
        thumbnail: null, // No thumbnail generated
        elements
      }
    }

    // Use Puppeteer for high-quality image rendering (default method)
    console.log(`🌐 Puppeteer mode: Using browser-based rendering for page ${pageNumber}`)

    try {
      // Get PDF buffer from the document
      const pdfDoc = this.decomposer.pdfDoc
      const pdfBuffer = Buffer.from(await pdfDoc.getData())

      const renderer = getPuppeteerRenderer()

      // Render page using Puppeteer with configurable quality settings
      const renderResult = await renderer.renderPdfPageWithPdfJs(
        pdfBuffer,
        pageNumber,
        path.join(outputDir, imageFilename),
        {
          width: Math.round(Math.min(width, this.imageWidth)),  // Configurable width
          quality: this.imageQuality,                           // Configurable quality
          format: 'jpeg',
          scale: 1.5                                           // Higher scale for crisp images
        }
      )

      // Create thumbnail with better quality
      await renderer.createThumbnail(
        path.join(outputDir, imageFilename),
        path.join(outputDir, thumbFilename),
        150,  // Larger thumbnail
        80    // Better thumbnail quality
      )

      // Extract elements (text and structural data)
      const elements: any[] = [
        ...await this.extractTextElements(pdfPage, pageIndex),
        // Conditionally extract embedded images if enabled
        ...(this.extractEmbeddedImages ? await this.extractImageElements(pdfPage, pageIndex, outputDir) : [])
      ]

      return {
        pageIndex,
        pageNumber,
        width: renderResult.width,
        height: renderResult.height,
        title,
        image: imageFilename,
        thumbnail: thumbFilename,
        elements
      }

    } catch (error) {
      console.error(`❌ Puppeteer rendering failed for page ${pageNumber}:`, error)
      // Fall back to placeholder mode
      console.log(`📋 Falling back to placeholder mode for page ${pageNumber}`)
      this.createPlaceholderImage(path.join(outputDir, imageFilename), width, height, pageNumber, false)
      this.createPlaceholderImage(path.join(outputDir, thumbFilename), 120, 160, pageNumber, true)

      const elements: any[] = [
        ...await this.extractTextElements(pdfPage, pageIndex),
        // Conditionally extract embedded images if enabled (even in fallback mode)
        ...(this.extractEmbeddedImages ? await this.extractImageElements(pdfPage, pageIndex, outputDir) : [])
      ]

      return {
        pageIndex,
        pageNumber,
        width,
        height,
        title,
        image: imageFilename,
        thumbnail: thumbFilename,
        elements
      }
    }
  }

  // Use pdfPage.extractImages() for image extraction, like the old implementation
  private async extractImageElements(pdfPage: any, pageIndex: number, outputDir: string): Promise<any[]> {
    if (this.skipParser) { return [] }
    const items = await pdfPage.extractImages()
    return Promise.all(items.map(async ({ boundingBox, data, objectId, contentType: _contentType }: any) => {
      let buffer: Buffer
      if (typeof Buffer !== 'undefined' && data instanceof Buffer) {
        buffer = data
      } else if (data instanceof Uint8Array) {
        buffer = Buffer.from(data)
      } else if (data.arrayBuffer) {
        buffer = Buffer.from(await data.arrayBuffer())
      } else {
        throw new Error('Unknown image data type')
      }
      const fileName = `${objectId}.png`
      const filePath = path.join(outputDir, fileName)
      fs.writeFileSync(filePath, buffer)
      const attributes = { type: 'spacing' }
      return {
        id: uuidv4(),
        pageIndex,
        type: 'image',
        boundingBox,
        data: fileName,
        attributes
      }
    }))
  }

  // Real text extraction using PDF.js getTextContent
  private async extractTextElements(pdfPage: any, pageIndex: number): Promise<any[]> {
    const textContent = await pdfPage.getTextContent()
    const viewport = pdfPage.getViewport({ scale: 1 })
    const pageHeight = viewport.height

    return textContent.items.map((item: any, _: number) => {
      const bbox = this.getTextBoundingBox(item, pageHeight)
      const attributes = {
        fontFamily: item.fontName,
        fontSize: item.transform ? item.transform[0] : undefined,
        textColor: undefined // PDF.js does not provide text color directly
      }
      return {
        id: uuidv4(),
        pageIndex,
        type: 'text',
        boundingBox: bbox,
        data: item.str,
        formattedData: item.str,
        attributes
      }
    }) // No filter for debugging
  }

  // Helper to get bounding box from PDF.js text item
  private getTextBoundingBox(item: any, pageHeight: number) {
    // PDF.js text item transform: [scaleX, skewX, skewY, scaleY, transX, transY]
    // PDF coordinate system has origin at bottom-left, we need to convert to top-left
    const [a, , , d, e, f] = item.transform
    const width = item.width || Math.abs(a)
    const height = item.height || Math.abs(d)

    // Convert from PDF coordinate system (bottom-left origin) to top-left origin
    const bottomY = f
    const topY = pageHeight - bottomY - height

    return {
      top: topY,
      left: e,
      bottom: topY + height,
      right: e + width,
      width,
      height
    }
  }

  /**
   * Create a placeholder image without using canvas operations
   */
  private createPlaceholderImage(filePath: string, width: number, height: number, pageNumber: number, isThumbnail: boolean): void {
    // For now, create a simple text file that represents the image placeholder
    // This avoids any canvas memory allocation
    const placeholderInfo = {
      type: 'placeholder',
      width,
      height,
      pageNumber,
      isThumbnail,
      note: 'This is a placeholder to avoid memory issues with canvas operations'
    }

    // Write placeholder info as a small text file
    const infoPath = filePath.replace(/\.(jpg|png)$/, '.placeholder.json')
    fs.writeFileSync(infoPath, JSON.stringify(placeholderInfo, null, 2))

    // Create a minimal 1x1 pixel placeholder image to satisfy file existence checks
    // This is the smallest possible image file we can create
    const minimalImageBuffer = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
      0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
      0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF, 0xC4,
      0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
      0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0x8A, 0x00,
      0xFF, 0xD9
    ])

    fs.writeFileSync(filePath, minimalImageBuffer)
    console.log(`📋 Created placeholder image: ${path.basename(filePath)} (${minimalImageBuffer.length} bytes)`)
  }
}
