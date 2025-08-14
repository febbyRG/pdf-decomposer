import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { PdfImageExtractor } from './PdfImageExtractor.js'
import type { PdfDecomposerPageData, PdfDecomposerBoundingBox, PdfDecomposerTextAttributes } from '../types/decomposer.types.js'

export class PdfDecomposerPage {
  constructor(
    private decomposer: PdfDecomposerPageData,
    private pageIndex: number,
    private skipParser: boolean = false,
    private extractImages: boolean = false
  ) { }

  async decompose(): Promise<any> {
    const pdfPage = await this.decomposer.pdfDoc.getPage(this.pageIndex)
    const viewport = pdfPage.getViewport({ scale: 1 })
    const width = viewport.width
    const height = viewport.height
    const pageNumber = this.pageIndex
    const pageIndex = this.pageIndex - 1
    const title = `Page ${pageNumber}`

    // Determine output directory for embedded images
    let outputDir = '.'
    if (this.decomposer.pkg.pkgDir && typeof this.decomposer.pkg.pkgDir === 'object' && 'dir' in this.decomposer.pkg.pkgDir) {
      outputDir = (this.decomposer.pkg.pkgDir as any).dir || '.'
    }

    // Extract text and embedded images
    console.log(`📝 Extracting content for page ${pageNumber} (no page images)`)

    const elements: any[] = [
      ...await this.extractTextElements(pdfPage, pageIndex),
      // Extract embedded images if enabled
      ...(this.extractImages ? await this.extractImageElements(pdfPage, pageIndex, outputDir) : [])
    ]

    // Return page data
    const result = {
      pageIndex,
      pageNumber,
      width,
      height,
      title,
      elements
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
          const dataReference = img.data // Always use data URL for universal compatibility

          // In Node.js environment, optionally save to file but keep data URL for return value
          if (typeof process !== 'undefined' && process.versions && process.versions.node && outputDir) {
            try {
              // Convert base64 to buffer and save
              const base64Data = img.data.split(',')[1]
              if (base64Data) {
                const buffer = Buffer.from(base64Data, 'base64')
                const fileName = `${img.id}.png`
                const filePath = path.join(outputDir, fileName)
                fs.writeFileSync(filePath, buffer)
                // Keep dataReference as data URL for universal compatibility
                console.log(`    💾 Saved to file: ${fileName} (keeping data URL for compatibility)`)
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

      // Resolve readable font name from PDF internal ID
      const resolvedFontFamily = this.resolveFontFamily(item.fontName)

      const attributes = {
        fontFamily: resolvedFontFamily, // Use resolved font name instead of internal ID
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
  private getTextBoundingBox(item: any, pageHeight: number): PdfDecomposerBoundingBox {
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
   * Generate formatted HTML text based on font attributes
   */
  private generateFormattedText(text: string, attributes: PdfDecomposerTextAttributes): string {
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

    // Resolve readable font name from PDF internal ID
    const resolvedFontFamily = this.resolveFontFamily(fontFamily)

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
    if (resolvedFontFamily && resolvedFontFamily !== 'inherit') {
      styles.push(`font-family: ${resolvedFontFamily}`)
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

  /**
   * Resolve PDF internal font ID to readable font family name
   */
  private resolveFontFamily(pdfFontId: string): string {
    if (!pdfFontId) return 'inherit'

    // Map common PDF internal font IDs to readable names
    const fontMapping: { [key: string]: string } = {
      // Common PDF.js internal font patterns
      'g_d0_f1': 'Arial',
      'g_d0_f2': 'Georgia',
      'g_d0_f3': 'Times New Roman',
      'g_d0_f4': 'Helvetica',
      'g_d0_f5': 'Verdana',
      'g_d0_f6': 'Courier New',
      'g_d0_f7': 'Comic Sans MS',
      'g_d0_f8': 'Impact',
      'g_d0_f9': 'Trebuchet MS',
      'g_d0_f10': 'Arial Black',

      // Times family variations
      'TimesRoman': 'Times',
      'Times-Roman': 'Times',
      'Times-Bold': 'Times',
      'Times-Italic': 'Times',
      'Times-BoldItalic': 'Times',

      // Helvetica family variations
      'Helvetica': 'Helvetica',
      'Helvetica-Bold': 'Helvetica',
      'Helvetica-Oblique': 'Helvetica',
      'Helvetica-BoldOblique': 'Helvetica',

      // Arial family variations
      'Arial': 'Arial',
      'Arial-Bold': 'Arial',
      'Arial-Italic': 'Arial',
      'Arial-BoldItalic': 'Arial',

      // Courier family variations
      'Courier': 'Courier New',
      'Courier-Bold': 'Courier New',
      'Courier-Oblique': 'Courier New',
      'Courier-BoldOblique': 'Courier New',
    }

    // Direct mapping if available
    if (fontMapping[pdfFontId]) {
      return fontMapping[pdfFontId]
    }

    // Smart fallback based on patterns
    const lowerFontId = pdfFontId.toLowerCase()

    if (lowerFontId.includes('arial')) {
      return 'Arial'
    }
    if (lowerFontId.includes('helvetica')) {
      return 'Helvetica'
    }
    if (lowerFontId.includes('times')) {
      return 'Times New Roman'
    }
    if (lowerFontId.includes('georgia')) {
      return 'Georgia'
    }
    if (lowerFontId.includes('courier')) {
      return 'Courier New'
    }
    if (lowerFontId.includes('verdana')) {
      return 'Verdana'
    }
    if (lowerFontId.includes('comic')) {
      return 'Comic Sans MS'
    }
    if (lowerFontId.includes('impact')) {
      return 'Impact'
    }
    if (lowerFontId.includes('trebuchet')) {
      return 'Trebuchet MS'
    }

    // Generic fallbacks based on characteristics
    if (lowerFontId.includes('mono') || lowerFontId.includes('code')) {
      return 'Courier New'
    }
    if (lowerFontId.includes('serif') || lowerFontId.includes('roman')) {
      return 'Times New Roman'
    }
    if (lowerFontId.includes('sans') || lowerFontId.includes('gothic')) {
      return 'Arial'
    }
    if (lowerFontId.includes('script') || lowerFontId.includes('cursive')) {
      return 'Comic Sans MS'
    }

    // Default fallback for unrecognized fonts
    return 'Open Sans'
  }
}
