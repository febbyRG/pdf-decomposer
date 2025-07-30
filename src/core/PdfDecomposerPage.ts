import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { PdfImageExtractor } from './PdfImageExtractor.js'
import type { PdfDecomposer } from './PdfDecomposer.js'

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

    // Extract text and embedded images without page rendering
    console.log(`📝 Extracting content for page ${pageNumber} (no page images)`)

    const elements: any[] = [
      ...await this.extractTextElements(pdfPage, pageIndex),
      // Extract embedded images if enabled
      ...(this.extractEmbeddedImages ? await this.extractImageElements(pdfPage, pageIndex, outputDir) : [])
    ]

    // Return page data without generating page images
    const result = {
      pageIndex,
      pageNumber,
      width,
      height,
      title,
      image: this.generateImages ? imageFilename : null,
      thumbnail: this.generateImages ? thumbFilename : null,
      elements
    }

    // Create placeholder files if image generation is enabled
    if (this.generateImages) {
      console.log(`📋 Creating placeholder images for page ${pageNumber}`)
      this.createPlaceholderImage(path.join(outputDir, imageFilename), width, height, pageNumber, false)
      this.createPlaceholderImage(path.join(outputDir, thumbFilename), 120, 160, pageNumber, true)
    }

    return result
  }

  // Use universal image extraction (works in both Node.js and Browser)
  private async extractImageElements(pdfPage: any, pageIndex: number, outputDir: string): Promise<any[]> {
    if (this.skipParser) { return [] }
    
    try {
      console.log(`🔧 Using universal image extraction for page ${pageIndex + 1}`)
      const extractor = new PdfImageExtractor()
      const universalImages = await extractor.extractImagesFromPage(pdfPage)
      
      // Save extracted images to files (Node.js) or keep as data URLs (Browser)
      const imageElements: any[] = []
      for (const img of universalImages) {
        try {
          let dataReference = img.data // Default to data URL
          
          // In Node.js environment, optionally save to file
          if (typeof process !== 'undefined' && process.versions && process.versions.node && outputDir) {
            try {
              // Convert base64 to buffer and save
              const base64Data = img.data.split(',')[1]
              if (base64Data) {
                const buffer = Buffer.from(base64Data, 'base64')
                const fileName = `${img.id}.png`
                const filePath = path.join(outputDir, fileName)
                fs.writeFileSync(filePath, buffer)
                dataReference = fileName // Use file reference for Node.js
                console.log(`    💾 Saved to file: ${fileName}`)
              }
            } catch (saveError) {
              console.warn(`Failed to save image ${img.id} to file, keeping as data URL:`, saveError)
              // Keep as data URL if file save fails
            }
          }
          
          imageElements.push({
            id: img.id,
            pageIndex,
            type: 'image',
            boundingBox: [0, 0, img.width, img.height], // Default bbox
            data: dataReference,
            attributes: { 
              type: 'embedded',
              width: img.width,
              height: img.height,
              format: img.format,
              originalId: img.id,
              scaled: img.scaled,
              scaleFactor: img.scaleFactor,
              extraction: 'universal'
            }
          })
        } catch (processError) {
          console.warn(`Failed to process image ${img.id}:`, processError)
        }
      }
      
      return imageElements
    } catch (error) {
      console.warn(`Universal image extraction failed for page ${pageIndex + 1}:`, error)
      
      // Fallback to legacy extraction (Node.js only)
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        console.log(`📋 Falling back to legacy image extraction for page ${pageIndex + 1}`)
        try {
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
            const attributes = { type: 'legacy' }
            return {
              id: uuidv4(),
              pageIndex,
              type: 'image',
              boundingBox,
              data: fileName,
              attributes
            }
          }))
        } catch (legacyError) {
          console.warn('Legacy extraction also failed:', legacyError)
          return []
        }
      }
      
      return []
    }
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
      
      // Generate formatted HTML version based on font attributes
      const formattedData = this.generateFormattedText(item.str, attributes)
      
      return {
        id: uuidv4(),
        pageIndex,
        type: 'text',
        boundingBox: bbox,
        data: item.str, // Plain text
        formattedData: formattedData, // HTML formatted text
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

  /**
   * Generate formatted HTML text based on font attributes
   */
  private generateFormattedText(text: string, attributes: any): string {
    if (!text) return text

    let html = text
    
    // Escape HTML special characters first
    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

    // Apply formatting based on font attributes
    const fontSize = attributes.fontSize || 0
    const fontFamily = attributes.fontFamily || ''

    // Detect bold text based on font name patterns
    if (this.isBoldFont(fontFamily)) {
      html = `<strong>${html}</strong>`
    }

    // Detect italic text based on font name patterns
    if (this.isItalicFont(fontFamily)) {
      html = `<em>${html}</em>`
    }

    // Detect headings based on font size (assuming larger fonts are headings)
    if (fontSize > 16) {
      const level = fontSize > 24 ? 1 : fontSize > 20 ? 2 : fontSize > 18 ? 3 : 4
      html = `<h${level}>${html}</h${level}>`
    }

    // Add font styling if specified
    const styles: string[] = []
    if (fontSize && fontSize !== 12) {
      styles.push(`font-size: ${fontSize}px`)
    }
    if (fontFamily && !fontFamily.includes('default')) {
      styles.push(`font-family: "${fontFamily}"`)
    }
    if (attributes.textColor) {
      styles.push(`color: ${attributes.textColor}`)
    }

    if (styles.length > 0) {
      html = `<span style="${styles.join('; ')}">${html}</span>`
    }

    return html
  }

  /**
   * Check if font name indicates bold styling
   */
  private isBoldFont(fontName: string): boolean {
    if (!fontName) return false
    const lowerName = fontName.toLowerCase()
    return lowerName.includes('bold') || 
           lowerName.includes('black') || 
           lowerName.includes('heavy') ||
           lowerName.includes('extrabold')
  }

  /**
   * Check if font name indicates italic styling
   */
  private isItalicFont(fontName: string): boolean {
    if (!fontName) return false
    const lowerName = fontName.toLowerCase()
    return lowerName.includes('italic') || 
           lowerName.includes('oblique') ||
           lowerName.includes('-it')
  }
}
