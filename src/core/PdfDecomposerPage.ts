import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { PdfImageExtractor } from './PdfImageExtractor.js'
import type { 
  PdfDecomposerPageData, 
  PdfDecomposerBoundingBox, 
  PdfDecomposerTextAttributes,
  PdfDecomposerExtractedElement,
  PdfDecomposerExtractedTextElement,
  PdfDecomposerExtractedImageElement,
  PdfDecomposerExtractedLinkElement,
  PdfDecomposerColorAwareElement
} from '../types/decomposer.types.js'

export class PdfDecomposerPage {
  constructor(
    private decomposer: PdfDecomposerPageData,
    private pageIndex: number,
    private skipParser: boolean = false,
    private extractImages: boolean = false,
    private outputDir?: string,  // Add outputDir parameter
    private extractLinks: boolean = false  // Add extractLinks parameter
  ) { }

  async decompose(): Promise<any> {
    try {
      const pdfPage = await this.decomposer.pdfDoc.getPage(this.pageIndex)
      const viewport = pdfPage.getViewport({ scale: 1 })
      const width = viewport.width
      const height = viewport.height
      const pageNumber = this.pageIndex  // this.pageIndex is actually the pageNumber (1-based)
      const pageIndex = this.pageIndex - 1  // convert to 0-based pageIndex
      const title = `Page ${pageNumber}`

      // Use provided outputDir, fallback to pkg dir, or undefined for base64 mode
      const outputDir = this.outputDir

      // Extract text, embedded images, and links
      const elements: PdfDecomposerExtractedElement[] = []
      
      try {
        elements.push(...await this.extractTextElements(pdfPage, pageIndex))
      } catch (textError) {
        console.error(`Error extracting text elements from page ${pageNumber}:`, textError)
      }
      
      if (this.extractImages) {
        try {
          elements.push(...await this.extractImageElements(pdfPage, pageIndex, outputDir))
        } catch (imageError) {
          console.error(`Error extracting image elements from page ${pageNumber}:`, imageError)
        }
      }
      
      if (this.extractLinks) {
        try {
          elements.push(...await this.extractLinkElements(pdfPage, pageIndex))
        } catch (linkError) {
          console.error(`Error extracting link elements from page ${pageNumber}:`, linkError)
        }
      }

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
    } catch (error) {
      console.error(`Critical error processing page ${this.pageIndex}:`, error)
      // Return minimal page structure with empty elements on critical error
      return {
        pageIndex: this.pageIndex - 1,
        pageNumber: this.pageIndex,
        width: 0,
        height: 0,
        title: `Page ${this.pageIndex}`,
        elements: []
      }
    }
  }

  // Use universal image extraction (works in both Node.js and Browser)
  private async extractImageElements(pdfPage: any, pageIndex: number, outputDir?: string): Promise<PdfDecomposerExtractedImageElement[]> {
    if (this.skipParser) { return [] }

    try {
      const extractor = new PdfImageExtractor()
      const universalImages = await extractor.extractImagesFromPage(pdfPage)

      // Save extracted images to files (Node.js) or keep as data URLs (Browser)
      const imageElements: PdfDecomposerExtractedImageElement[] = []
      for (const img of universalImages) {
        try {
          let dataReference = img.data // Default to data URL

          // In Node.js environment, save to file and use filename if outputDir exists
          if (typeof process !== 'undefined' && process.versions && process.versions.node && outputDir) {
            try {
              // Convert base64 to buffer and save
              const base64Data = img.data.split(',')[1]
              if (base64Data) {
                const buffer = Buffer.from(base64Data, 'base64')
                const fileName = `${img.id}.png`
                const filePath = path.join(outputDir, fileName)
                fs.writeFileSync(filePath, buffer)
                
                // Use filename instead of data URL when outputDir is provided
                dataReference = fileName
              }
            } catch (saveError) {
              console.warn(`Failed to save image ${img.id} to file, keeping as data URL:`, saveError)
              // Keep as data URL if file save fails
              dataReference = img.data
            }
          } else {
            // Using base64 data URL (no outputDir specified)
          }

          // Calculate proper bounding box from position and size
          let boundingBox: any
          
          if (img.x !== undefined && img.y !== undefined) {
            // Use actual position from PDF transform
            const left = img.x || 0
            const top = img.y || 0
            const width = img.width
            const height = img.height
            
            // Always use full object format - minify happens centrally in PdfDecompose.ts
            boundingBox = {
              top: top,
              left: left,
              bottom: top + height,
              right: left + width,
              width: width,
              height: height
            }
          } else {
            // Fallback to default position if no transform available
            // Always use full object format - minify happens centrally in PdfDecompose.ts
            boundingBox = {
              top: 0,
              left: 0,
              bottom: img.height,
              right: img.width,
              width: img.width,
              height: img.height
            }
          }

          imageElements.push({
            id: img.id,
            pageIndex,
            type: 'image',
            boundingBox: boundingBox,
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
            
            if (outputDir) {
              const filePath = path.join(outputDir, fileName)
              fs.writeFileSync(filePath, buffer)
            }
            
            const attributes = { type: 'legacy' }
            
            // Always use original boundingBox format - minify happens centrally in PdfDecompose.ts
            const formattedBoundingBox = boundingBox
            
            return {
              id: uuidv4(),
              pageIndex,
              type: 'image',
              boundingBox: formattedBoundingBox,
              data: outputDir ? fileName : `data:image/png;base64,${buffer.toString('base64')}`,
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

  // Extract links and annotations from PDF content
  private async extractLinkElements(pdfPage: any, pageIndex: number): Promise<PdfDecomposerExtractedLinkElement[]> {
    if (this.skipParser) { return [] }

    const linkElements: PdfDecomposerExtractedLinkElement[] = []
    const pageHeight = pdfPage.getViewport({ scale: 1 }).height

    try {
      // 1. Extract PDF annotations (interactive links)
      const annotations = await pdfPage.getAnnotations()
      
      for (const annotation of annotations) {
        if (annotation.subtype === 'Link' && (annotation.url || annotation.dest)) {
          const boundingBox = this.convertRectToBoundingBox(annotation.rect, pageHeight)
          
          linkElements.push({
            id: uuidv4(),
            pageIndex,
            type: 'link',
            boundingBox,
            data: annotation.url || JSON.stringify(annotation.dest),
            attributes: {
              linkType: annotation.url ? 'url' : 'internal',
              annotationId: annotation.id,
              dest: annotation.dest,
              text: annotation.contents || undefined
            }
          })
        }
      }

      // 2. Extract URL patterns from text content
      const textContent = await pdfPage.getTextContent()
      
      // URL regex patterns to detect various types of URLs
      const urlPattern = /(?:https?:\/\/[^\s<>"'()[\]{}]+|[a-zA-Z0-9.-]+\.(?:com|org|edu|net|gov|co|io|ly)(?:\/[^\s<>"'()[\]{}]*)?)/gi
      const emailPattern = /[\w._%+-]+@[\w.-]+\.[A-Z]{2,}/gi
      
      for (const item of textContent.items) {
        const text = item.str || ''
        
        // Check for URLs
        const urlMatches = text.match(urlPattern)
        if (urlMatches) {
          const boundingBox = this.getTextBoundingBox(item, pageHeight)
          
          for (const url of urlMatches) {
            linkElements.push({
              id: uuidv4(),
              pageIndex,
              type: 'link',
              boundingBox,
              data: url.startsWith('http') ? url : `http://${url}`,
              attributes: {
                linkType: 'url',
                text: text,
                extraction: 'text-pattern'
              }
            })
          }
        }
        
        // Check for email addresses
        const emailMatches = text.match(emailPattern)
        if (emailMatches) {
          const boundingBox = this.getTextBoundingBox(item, pageHeight)
          
          for (const email of emailMatches) {
            linkElements.push({
              id: uuidv4(),
              pageIndex,
              type: 'link',
              boundingBox,
              data: `mailto:${email}`,
              attributes: {
                linkType: 'email',
                text: text,
                extraction: 'text-pattern'
              }
            })
          }
        }
      }

    } catch (error) {
      console.warn(`Failed to extract links from page ${pageIndex + 1}:`, error)
    }

    return linkElements
  }



  // Convert PDF rect to bounding box
  private convertRectToBoundingBox(rect: number[], pageHeight: number): PdfDecomposerBoundingBox {
    const [x1, y1, x2, y2] = rect
    const left = Math.min(x1, x2)
    const right = Math.max(x1, x2)
    const bottom = pageHeight - Math.max(y1, y2) // Convert PDF coordinates to screen coordinates
    const top = pageHeight - Math.min(y1, y2)
    
    return {
      top,
      left,
      bottom,
      right,
      width: right - left,
      height: bottom - top
    }
  }

  // Real text extraction using PDF.js getTextContent with color-aware enhancement
  private async extractTextElements(pdfPage: any, pageIndex: number): Promise<PdfDecomposerExtractedTextElement[]> {
    try {
      const textContent = await pdfPage.getTextContent()
      const viewport = pdfPage.getViewport({ scale: 1 })
      const pageHeight = viewport.height

      // Extract color-aware text elements using PdfTextEvaluator
      // This provides real font names extracted via getCommonObject(font.objectId).name
      // instead of relying on PDF internal IDs from getTextContent()
      let colorAwareElements: PdfDecomposerColorAwareElement[] = []
      try {
        colorAwareElements = await pdfPage.extractText()
      } catch (fontExtractionError) {
        console.warn(`Font extraction failed for page ${pageIndex}:`, fontExtractionError)
        // Continue with empty array - will fallback to PDF internal ID resolution
      }

    // URL and email patterns to identify text that should be treated as links
    const urlPattern = /(?:https?:\/\/[^\s<>"'()[\]{}]+|[a-zA-Z0-9.-]+\.(?:com|org|edu|net|gov|co|io|ly)(?:\/[^\s<>"'()[\]{}]*)?)/gi
    const emailPattern = /[\w._%+-]+@[\w.-]+\.[A-Z]{2,}/gi

    return textContent.items.map((item: any, _: number) => {
      const text = item.str || ''
      
      // Skip text elements that contain URLs or emails - they'll be handled as link elements
      if (text.match(urlPattern) || text.match(emailPattern)) {
        return null
      }
      const bbox = this.getTextBoundingBox(item, pageHeight)

      // Find matching color-aware element based on text content and position
      const matchingColorElement = this.findMatchingColorElement(item, bbox, colorAwareElements)

      // Use font information from PdfTextEvaluator (real font names) if available,
      // otherwise fall back to PDF internal ID resolution
      let fontFamily: string
      let fontWeight: string | undefined
      let fontStyle: string | undefined
      let fallbackToMapping = false

      if (matchingColorElement?.fontFamily) {
        // Use real font name from PdfTextEvaluator (extracted via font.name)
        fontFamily = matchingColorElement.fontFamily
        fontWeight = matchingColorElement.fontWeight
        fontStyle = matchingColorElement.fontStyle
      } else {
        // Fallback to PDF internal ID resolution
        const resolvedFontInfo = this.resolveFontFamily(item.fontName)
        fontFamily = resolvedFontInfo.fontFamily
        fallbackToMapping = !resolvedFontInfo.isMapping
      }

      const attributes: any = {
        fontFamily: fontFamily, // Use real font name when available
        fontWeight: fontWeight,
        fontStyle: fontStyle,
        fontSize: item.transform ? item.transform[0] : undefined,
        textColor: matchingColorElement?.textColor // Now includes actual color information when available
      }

      // Only include originalFont if we had to fall back to PDF internal ID mapping
      if (fallbackToMapping) {
        attributes.originalFont = item.fontName
      }

      // Generate formatted HTML version based on font attributes
      const formattedData = this.generateFormattedText(item.str, attributes)

      // Always use original boundingBox format - minify happens centrally in PdfDecompose.ts
      const boundingBox = bbox

      return {
        id: uuidv4(),
        pageIndex,
        type: 'text',
        boundingBox: boundingBox,
        data: item.str, // Plain text
        formattedData: formattedData, // HTML formatted text
        attributes
      }
    }).filter((item: any) => item !== null) // Filter out null items (URLs/emails handled as links)
    } catch (error) {
      console.error(`Error extracting text elements from page ${pageIndex}:`, error)
      return [] // Return empty array on error
    }
  }

  // Helper method to find matching color-aware element for a text item
  private findMatchingColorElement(item: any, bbox: PdfDecomposerBoundingBox, colorAwareElements: PdfDecomposerColorAwareElement[]): PdfDecomposerColorAwareElement | null {
    const itemText = item.str?.trim() || ''
    
    // Skip empty or very short text fragments (likely spacing)
    if (itemText.length < 2) {
      return null
    }

    // First try to match by exact text content
    const exactTextMatch = colorAwareElements.find(element => 
      element.text === itemText && (element.textColor || element.fontFamily)
    )
    if (exactTextMatch) {
      return exactTextMatch
    }

    // Try partial text matching - check if item text is contained in any element
    const partialTextMatch = colorAwareElements.find(element => {
      return element.text && element.text.includes(itemText) && 
             (element.textColor || element.fontFamily)
    })
    if (partialTextMatch) {
      return partialTextMatch
    }

    // Try reverse - check if any element text is contained in item text
    const reversePartialMatch = colorAwareElements.find(element => {
      return element.text && itemText.includes(element.text) && 
             (element.textColor || element.fontFamily)
    })
    if (reversePartialMatch) {
      return reversePartialMatch
    }

    // Fall back to positional matching with larger tolerance to handle text fragmentation
    const positionTolerance = 15 // Increased tolerance for fragmented text
    const positionMatch = colorAwareElements.find(element => {
      if (!element.boundingBox) return false
      
      const leftDiff = Math.abs(element.boundingBox.left - bbox.left)
      const topDiff = Math.abs(element.boundingBox.top - bbox.top)
      
      // Also check if bounding boxes overlap
      const overlap = !(bbox.right < element.boundingBox.left || 
                       element.boundingBox.right < bbox.left || 
                       bbox.bottom < element.boundingBox.top || 
                       element.boundingBox.bottom < bbox.top)
      
      const closePosition = leftDiff <= positionTolerance && topDiff <= positionTolerance
      
      return (closePosition || overlap) && (element.textColor || element.fontFamily)
    })
    
    return positionMatch || null
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
    try {
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

      // Detect bold text based on font name patterns (use original fontFamily for detection)
      if (this.isBoldFont(fontFamily)) {
        html = `<strong>${html}</strong>`
      }

      // Detect italic text based on font name patterns (use original fontFamily for detection)
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
    if (fontFamily && fontFamily !== 'inherit') {
      styles.push(`font-family: ${fontFamily}`)
    }
    if (attributes.textColor) {
      styles.push(`color: ${attributes.textColor}`)
    }

      if (styles.length > 0) {
        html = `<span style="${styles.join('; ')}">${html}</span>`
      }

      return html
    } catch (error) {
      console.warn('Error generating formatted text:', error)
      return text // Return original text on error
    }
  }

  /**
   * Check if font name indicates bold styling
   */
  private isBoldFont(fontName: string): boolean {
    if (!fontName) return false
    const lowerName = fontName.toLowerCase()
    
    // Handle "Black" fonts specially - they are font families, not bold variants
    // e.g., "Arial Black", "Helvetica Black" are separate typefaces, not bold Arial/Helvetica
    if (lowerName.includes('black')) {
      return false // "Black" fonts are separate typefaces, not bold text
    }
    
    return lowerName.includes('bold') ||
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
  private resolveFontFamily(pdfFontId: string): { fontFamily: string; isMapping: boolean } {
    try {
      if (!pdfFontId) return { fontFamily: 'inherit', isMapping: false }

    // Map known PDF font names to readable names (no random g_d0_f assumptions)
    const fontMapping: { [key: string]: string } = {
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

      // System Public Fonts - MagLoft font library
      'AbrilFatface': 'Abril Fatface',
      'Abril-Fatface': 'Abril Fatface',
      'ArchivoNarrow': 'Archivo Narrow',
      'Archivo-Narrow': 'Archivo Narrow',
      'Arial-Narrow': 'Arial Narrow',
      'ArialNarrow': 'Arial Narrow',
      'Arimo': 'Arimo',
      'Arvo': 'Arvo',
      'BigJohn': 'Big John',
      'Big-John': 'Big John',
      'Bitter': 'Bitter',
      'CaviarDreams': 'Caviar Dreams',
      'Caviar-Dreams': 'Caviar Dreams',
      'Coluna': 'Coluna',
      'ColunaRounded': 'Coluna Rounded',
      'Coluna-Rounded': 'Coluna Rounded',
      'CourierNew': 'Courier New',
      'Courier-New': 'Courier New',
      'Dosis': 'Dosis',
      'DroidSans': 'Droid Sans',
      'Droid-Sans': 'Droid Sans',
      'DroidSerif': 'Droid Serif',
      'Droid-Serif': 'Droid Serif',
      'FranklinGothic': 'Franklin Gothic',
      'Franklin-Gothic': 'Franklin Gothic',
      'FrederickatheGreat': 'Fredericka the Great',
      'Fredericka-the-Great': 'Fredericka the Great',
      'Georgia': 'Georgia',
      'Gotham': 'Gotham',
      'GravitasOne': 'Gravitas One',
      'Gravitas-One': 'Gravitas One',
      'Helvetica-Condensed': 'Helvetica Condensed',
      'HelveticaCondensed': 'Helvetica Condensed',
      'Helvetica-Neue': 'Helvetica Neue',
      'HelveticaNeue': 'Helvetica Neue',
      'Lato': 'Lato',
      'Literata': 'Literata',
      'Lobster': 'Lobster',
      'Lora': 'Lora',
      'MarketDeco': 'Market Deco',
      'Market-Deco': 'Market Deco',
      'Merriweather': 'Merriweather',
      'MissionScript': 'Mission Script',
      'Mission-Script': 'Mission Script',
      'Montserrat': 'Montserrat',
      'MovaviGrotesqueBlack': 'Movavi Grotesque Black',
      'Movavi-Grotesque-Black': 'Movavi Grotesque Black',
      'MrBlaketon': 'Mr Blaketon',
      'Mr-Blaketon': 'Mr Blaketon',
      'NotoSans': 'Noto Sans',
      'Noto-Sans': 'Noto Sans',
      'OpenSans': 'Open Sans',
      'Open-Sans': 'Open Sans',
      'OpenSansCondensed': 'Open Sans Condensed',
      'Open-Sans-Condensed': 'Open Sans Condensed',
      'Oswald': 'Oswald',
      'Oxygen': 'Oxygen',
      'PlayfairDisplay': 'Playfair Display',
      'Playfair-Display': 'Playfair Display',
      'PtSans': 'Pt Sans',
      'Pt-Sans': 'Pt Sans',
      'PT-Sans': 'Pt Sans',
      'PtSansNarrow': 'Pt Sans Narrow',
      'Pt-Sans-Narrow': 'Pt Sans Narrow',
      'PT-Sans-Narrow': 'Pt Sans Narrow',
      'PtSerif': 'Pt Serif',
      'Pt-Serif': 'Pt Serif',
      'PT-Serif': 'Pt Serif',
      'Raleway': 'Raleway',
      'Roboto': 'Roboto',
      'RobotoCondensed': 'Roboto Condensed',
      'Roboto-Condensed': 'Roboto Condensed',
      'RobotoSlab': 'Roboto Slab',
      'Roboto-Slab': 'Roboto Slab',
      'Rothman': 'Rothman',
      'ShadowsintoLight': 'Shadows into Light',
      'Shadows-into-Light': 'Shadows into Light',
      'SlimJoe': 'Slim Joe',
      'Slim-Joe': 'Slim Joe',
      'SourceSansPro': 'Source Sans Pro',
      'Source-Sans-Pro': 'Source Sans Pro',
      'TimesNewRoman': 'Times New Roman',
      'Times-New-Roman': 'Times New Roman',
      'TitilliumWeb': 'Titillium Web',
      'Titillium-Web': 'Titillium Web',
      'Ubuntu': 'Ubuntu',
      'Verdana': 'Verdana',
      'YanoneKaffeesatz': 'Yanone Kaffeesatz',
      'Yanone-Kaffeesatz': 'Yanone Kaffeesatz'
    }

    // Direct mapping if available
    if (fontMapping[pdfFontId]) {
      return { fontFamily: fontMapping[pdfFontId], isMapping: true }
    }

    // Handle PDF.js internal font IDs - fallback to generic fonts instead of random mapping
    if (pdfFontId.startsWith('g_d0_f')) {
      // PDF.js internal font IDs are dynamic, don't make assumptions about content
      // Fallback to a neutral, widely available font
      return { fontFamily: 'Open Sans', isMapping: false }
    }

    // Smart fallback based on patterns
    const lowerFontId = pdfFontId.toLowerCase()

    if (lowerFontId.includes('arial')) {
      return { fontFamily: 'Arial', isMapping: true }
    }
    if (lowerFontId.includes('helvetica')) {
      return { fontFamily: 'Helvetica', isMapping: true }
    }
    if (lowerFontId.includes('times')) {
      return { fontFamily: 'Times New Roman', isMapping: true }
    }
    if (lowerFontId.includes('georgia')) {
      return { fontFamily: 'Georgia', isMapping: true }
    }
    if (lowerFontId.includes('courier')) {
      return { fontFamily: 'Courier New', isMapping: true }
    }
    if (lowerFontId.includes('verdana')) {
      return { fontFamily: 'Verdana', isMapping: true }
    }
    if (lowerFontId.includes('comic')) {
      return { fontFamily: 'Comic Sans MS', isMapping: true }
    }
    if (lowerFontId.includes('impact')) {
      return { fontFamily: 'Impact', isMapping: true }
    }
    if (lowerFontId.includes('trebuchet')) {
      return { fontFamily: 'Trebuchet MS', isMapping: true }
    }

    // Generic fallbacks based on characteristics
    if (lowerFontId.includes('mono') || lowerFontId.includes('code')) {
      return { fontFamily: 'Courier New', isMapping: true }
    }
    if (lowerFontId.includes('serif') || lowerFontId.includes('roman')) {
      return { fontFamily: 'Times New Roman', isMapping: true }
    }
    if (lowerFontId.includes('sans') || lowerFontId.includes('gothic')) {
      return { fontFamily: 'Arial', isMapping: true }
    }
    if (lowerFontId.includes('script') || lowerFontId.includes('cursive')) {
      return { fontFamily: 'Comic Sans MS', isMapping: true }
    }

      // Default fallback for unrecognized fonts - mark as not mapped
      return { fontFamily: 'Open Sans', isMapping: false }
    } catch (error) {
      console.warn('Error resolving font family:', error)
      return { fontFamily: 'Open Sans', isMapping: false }
    }
  }

  /**
   * Map extracted font name to clean, readable font family name
   */
  private mapExtractedFontName(extractedFont: string): string {
    try {
      if (!extractedFont) return 'Open Sans'

      // Remove common prefixes and normalize
      const cleanName = extractedFont
        .replace(/^[A-Z]{6}\+/, '') // Remove subset prefix like "ABCDEF+"
        .replace(/MT$/, '') // Remove "MT" suffix
        .replace(/-/g, ' ') // Replace hyphens with spaces
        .trim()

      // Map to standard font names
      const lowerName = cleanName.toLowerCase()
      
      if (lowerName.includes('times')) return 'Times New Roman'
      if (lowerName.includes('arial')) return 'Arial'
      if (lowerName.includes('helvetica')) return 'Helvetica'
      if (lowerName.includes('georgia')) return 'Georgia'
      if (lowerName.includes('verdana')) return 'Verdana'
      if (lowerName.includes('courier')) return 'Courier New'
      if (lowerName.includes('calibri')) return 'Calibri'
      if (lowerName.includes('tahoma')) return 'Tahoma'
      if (lowerName.includes('segoe')) return 'Segoe UI'
      
      // Return cleaned name if no specific mapping found
      return cleanName || 'Open Sans'
    } catch (error) {
      console.warn('Error mapping extracted font name:', error)
      return 'Open Sans'
    }
  }
}
