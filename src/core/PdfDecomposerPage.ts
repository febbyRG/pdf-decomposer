import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { PdfDecomposer } from './PdfDecomposer.js'

export class PdfDecomposerPage {
  constructor(
    private decomposer: PdfDecomposer,
    private pageIndex: number,
    private skipParser: boolean = false
  ) { }

  async decompose(): Promise<any> {
    const pdfPage = await this.decomposer.pdfDoc.getPage(this.pageIndex)
    const viewport = pdfPage.getViewport({ scale: 1 })
    const width = viewport.width
    const height = viewport.height
    const pageNumber = this.pageIndex
    const pageIndex = this.pageIndex - 1
    const title = `Page ${pageNumber}`

    // Generate unique filenames
    const baseId = uuidv4()
    const imageFilename = `${baseId}-${pageNumber}.jpg`
    const thumbFilename = `${baseId}-${pageNumber}.thumb.jpg`
    // Determine output directory
    let outputDir = '.'
    if (this.decomposer.pkg.pkgDir && typeof this.decomposer.pkg.pkgDir === 'object' && 'dir' in this.decomposer.pkg.pkgDir) {
      outputDir = (this.decomposer.pkg.pkgDir as any).dir
    }

    // Render full image using PdfPage.renderBlob (node-canvas compatible)
    const imageBuffer = await pdfPage.renderBlob({ width })
    fs.writeFileSync(path.join(outputDir, imageFilename), imageBuffer)

    // Render thumbnail using PdfPage.renderBlob (node-canvas compatible)
    const thumbWidth = Math.round(width * 0.2)
    const thumbBuffer = await pdfPage.renderBlob({ width: thumbWidth })
    fs.writeFileSync(path.join(outputDir, thumbFilename), thumbBuffer)

    // Extract elements
    const elements: any[] = [
      ...await this.extractImageElements(pdfPage, pageIndex, outputDir),
      ...await this.extractTextElements(pdfPage, pageIndex)
    ]

    return {
      pageIndex,
      pageNumber,
      width,
      height,
      title,
      image: imageFilename,
      elements
    }
  }

  // Use pdfPage.extractImages() for image extraction, like the old implementation
  private async extractImageElements(pdfPage: any, pageIndex: number, outputDir: string): Promise<any[]> {
    if (this.skipParser) { return [] }
    const items = await pdfPage.extractImages()
    return Promise.all(items.map(async ({ boundingBox, data, objectId, contentType }: any) => {
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
    return textContent.items.map((item: any, _: number) => {
      const bbox = this.getTextBoundingBox(item)
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
  private getTextBoundingBox(item: any) {
    // PDF.js text item transform: [scaleX, skewX, skewY, scaleY, transX, transY]
    // width/height are not directly available, so estimate
    const [a, , , d, e, f] = item.transform
    const width = item.width || Math.abs(a)
    const height = item.height || Math.abs(d)
    return {
      top: f,
      left: e,
      bottom: f + height,
      right: e + width,
      width,
      height
    }
  }
}
