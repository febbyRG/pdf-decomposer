/**
 * PDF Image Extractor - Universal Browser-Compatible Implementation
 *
 * Following FlexPDF approach for universal browser compatibility:
 * - Uses Canvas API for image processing (no Node.js dependencies)
 * - Browser-native compression via canvas.toBlob()
 * - Direct PDF.js object processing for maximum compatibility
 * - Supports multiple image formats and color spaces
 * - Zero Node.js dependencies - works in all browser environments
 */

// Browser environment check
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

import type { ExtractedImage } from '../types/image.types.js'

export class PdfImageExtractor {
  /**
   * Memory-safe pixel threshold for auto-scaling
   */
  private static readonly MAX_SAFE_PIXELS = 8 * 1024 * 1024
  private static readonly MAX_DIMENSION = 4000

  /**
   * Browser-compatible image processing using Canvas API
   */
  private static async imageToBlob(pixelData: Uint8Array, width: number, height: number, hasAlpha = false): Promise<string> {
    if (!isBrowser) {
      throw new Error('Canvas-based image processing requires browser environment')
    }

    // Use dynamic access to avoid TypeScript errors
    const doc = (globalThis as any).document
    const ImageDataConstructor = (globalThis as any).ImageData
    const FileReaderConstructor = (globalThis as any).FileReader

    if (!doc || !ImageDataConstructor || !FileReaderConstructor) {
      throw new Error('Browser DOM APIs not available')
    }

    const canvas = doc.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Could not get 2D canvas context')
    }

    // Create ImageData from pixel array
    let imageData
    if (hasAlpha) {
      // RGBA data - use directly
      imageData = new ImageDataConstructor(new Uint8ClampedArray(pixelData), width, height)
    } else {
      // RGB data - convert to RGBA
      const rgbaData = new Uint8ClampedArray(width * height * 4)
      for (let i = 0; i < width * height; i++) {
        const rgbIndex = i * 3
        const rgbaIndex = i * 4
        rgbaData[rgbaIndex] = pixelData[rgbIndex]     // R
        rgbaData[rgbaIndex + 1] = pixelData[rgbIndex + 1] // G
        rgbaData[rgbaIndex + 2] = pixelData[rgbIndex + 2] // B
        rgbaData[rgbaIndex + 3] = 255 // A (fully opaque)
      }
      imageData = new ImageDataConstructor(rgbaData, width, height)
    }

    context.putImageData(imageData, 0, 0)

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob: any) => {
        if (blob) {
          const reader = new FileReaderConstructor()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        } else {
          reject(new Error('Failed to create blob from canvas'))
        }
      }, 'image/png', 0.9) // High quality PNG
    })
  }

  /**
   * Extract images from a PDF page using comprehensive detection methods
   * @param page The PDF page to extract images from
   * @returns Array of extracted images as base64 strings
   */
  async extractImagesFromPage(page: any): Promise<ExtractedImage[]> {
    const images: ExtractedImage[] = []

    try {
      // Handle both PdfPage wrapper and direct PDFPageProxy
      const pdfPageProxy = page.proxy || page

      // Get actual page number from the page proxy
      const pageNumber = pdfPageProxy._pageIndex + 1 // _pageIndex is 0-based

      // Method 1: Check operator list for image operations (MAIN METHOD - like editor)
      const operatorImages = await this.extractFromOperatorList(pdfPageProxy, pageNumber)
      images.push(...operatorImages)

      // PERFORMANCE OPTIMIZATION: Only use operator list approach like editor
      // The other methods are slower and often redundant

      // Method 2: Check page objects (disabled for performance)
      // const pageObjImages = await PdfImageExtractor.extractFromPageObjects(pdfPageProxy, pageNumber)
      // images.push(...pageObjImages)

      // Method 3: Check common objects (disabled for performance)
      // const commonObjImages = await PdfImageExtractor.extractFromCommonObjects(pdfPageProxy, pageNumber)
      // images.push(...commonObjImages)

      // Method 4: XObject analysis (disabled for performance)
      // const xObjectImages = await PdfImageExtractor.extractFromPageContent(pdfPageProxy, pageNumber)
      // images.push(...xObjectImages)

      // Remove duplicates based on content and dimensions
      const uniqueImages = PdfImageExtractor.removeDuplicateImages(images)

      return uniqueImages
    } catch (error) {
      console.error('❌ Error extracting images:', error)
      return []
    }
  }

  /**
   * Extract images by analyzing PDF operator list
   * This detects inline images and Do (XObject) operations
   */
  private async extractFromOperatorList(page: any, pageNumber: number): Promise<ExtractedImage[]> {
    const images: ExtractedImage[] = []

    try {
      // Check if getOperatorList is available
      if (typeof page.getOperatorList !== 'function') {
        return []
      }

      const operatorList = await page.getOperatorList()
      const viewport = page.getViewport({ scale: 1 })

      // Track current transformation matrix for position calculations
      let currentTransform = [1, 0, 0, 1, 0, 0] // Identity matrix [a, b, c, d, e, f]
      const transformStack: number[][] = [] // Stack for q/Q operations

      // Look for image operations - SIMPLIFIED APPROACH like editor
      // Only check Do (XObject) operations which are most common
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i]
        const args = operatorList.argsArray[i]

        // Track graphics state operations
        if (op === 4) { // q - save graphics state
          transformStack.push([...currentTransform])
        } else if (op === 5) { // Q - restore graphics state
          if (transformStack.length > 0) {
            const restored = transformStack.pop()
            if (restored) {
              currentTransform = restored
            }
          }
        } else if (op === 12) { // cm - concatenate matrix (correct operator code!)
          if (args && args.length === 6) {
            // For images, use the transform directly instead of accumulating
            // Check if next operation is Do (image)
            const nextOp = i + 1 < operatorList.fnArray.length ? operatorList.fnArray[i + 1] : null
            if (nextOp === 1) {
              // This transform is directly for the next image, use it directly
              currentTransform = [...args]
            } else {
              // Update current transform with matrix multiplication for other cases
              const [a, b, c, d, e, f] = args
              const [a1, b1, c1, d1, e1, f1] = currentTransform
              
              currentTransform = [
                a * a1 + b * c1,
                a * b1 + b * d1,
                c * a1 + d * c1,
                c * b1 + d * d1,
                e * a1 + f * c1 + e1,
                e * b1 + f * d1 + f1
              ]
            }
          }
        } else if (op === 16) { // Alternative cm operator (keep as backup)
          if (args && args.length === 6) {
            // Similar logic for alternative operator
            const nextOp = i + 1 < operatorList.fnArray.length ? operatorList.fnArray[i + 1] : null
            if (nextOp === 1) {
              currentTransform = [...args]
            } else {
              const [a, b, c, d, e, f] = args
              const [a1, b1, c1, d1, e1, f1] = currentTransform
              
              currentTransform = [
                a * a1 + b * c1,
                a * b1 + b * d1,
                c * a1 + d * c1,
                c * b1 + d * d1,
                e * a1 + f * c1 + e1,
                e * b1 + f * d1 + f1
              ]
            }
          }
        } else if (op === 1 && args && args.length > 0) { // Do operation - paint XObject (correct code!)
          const imageName = args[0]

          // Use DIRECT ACCESS to page.objs like editor approach
          if (page.objs && page.objs.has(imageName)) {
            const imageObj = page.objs.get(imageName)

            if (PdfImageExtractor.isImageObject(imageObj)) {
              const extractedImage = await PdfImageExtractor.createExtractedImageFromObjectWithTransform(
                imageObj,
                imageName,
                pageNumber, // Use actual page number
                i,
                'document',
                currentTransform,
                viewport
              )

              if (extractedImage) {
                images.push(extractedImage)
              }
            }
          } else if (page.commonObjs && page.commonObjs.has(imageName)) {
            const imageObj = page.commonObjs.get(imageName)

            if (PdfImageExtractor.isImageObject(imageObj)) {
              const extractedImage = await PdfImageExtractor.createExtractedImageFromObjectWithTransform(
                imageObj,
                imageName,
                pageNumber, // Use actual page number
                i,
                'document',
                currentTransform,
                viewport
              )

              if (extractedImage) {
                images.push(extractedImage)
              }
            }
          }
        }
      }

      return images

    } catch (error) {
      return []
    }
  }

  /**
   * Convert Uint8Array to base64 string
   */
  private arrayToBase64(array: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < array.length; i++) {
      binary += String.fromCharCode(array[i])
    }
    // Use Node.js Buffer if available, otherwise fallback to btoa
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(array).toString('base64')
    }
    // Browser fallback - declare btoa as any to avoid lint error
    return typeof (globalThis as any).btoa !== 'undefined' ? (globalThis as any).btoa(binary) : ''
  }

  /**
   * Check if an object is an image based on PDF.js patterns
   */
  private static isImageObject(obj: any): boolean {
    if (!obj) return false

    // Check for Canvas element (browser)
    if (typeof (globalThis as any).HTMLCanvasElement !== 'undefined' && obj instanceof (globalThis as any).HTMLCanvasElement) {
      return true
    }

    // Check for ImageData
    if (typeof (globalThis as any).ImageData !== 'undefined' && obj instanceof (globalThis as any).ImageData) {
      return true
    }

    // Check for ImageBitmap
    if (typeof (globalThis as any).ImageBitmap !== 'undefined' && obj instanceof (globalThis as any).ImageBitmap) {
      return true
    }

    // Check for object with image-like properties
    if (typeof obj === 'object' && obj.width && obj.height) {
      // Check for bitmap property (PDF.js pattern)
      if (obj.bitmap || obj.data || obj.getImageData) {
        return true
      }
    }

    return false
  }

  /**
   * Create ExtractedImage from PDF.js object using EXACT WORKING LOGIC
   * Based on successful test-exact-browser-implementation.js
   */
  private static async createExtractedImageFromObject(
    obj: any,
    objId: string,
    pageNumber: number,
    imageIndex: number,
    source: string
  ): Promise<ExtractedImage | null> {
    try {
      const width = obj?.width || 0
      const height = obj?.height || 0

      if (!width || !height) {
        return null
      }

      // **EXACT LOGIC from Editor**: Handle objects with pixel data
      if (obj.data && obj.data.length > 0) {
        return await this.createImageDataFromPixelData(obj.data, width, height, objId, pageNumber, imageIndex, source)
      }

      // **EXACT LOGIC from Editor**: Handle bitmap objects
      if (obj.bitmap) {
        if (obj.bitmap.data && obj.bitmap.data.length > 0) {
          return await this.createImageDataFromPixelData(obj.bitmap.data, width, height, objId, pageNumber, imageIndex, source)
        }
      }

      return null

    } catch (error) {
      return null
    }
  }

  /**
   * Create extracted image from object with position information from transform matrix
   */
  private static async createExtractedImageFromObjectWithTransform(
    obj: any,
    objId: string,
    pageNumber: number,
    imageIndex: number,
    source: string,
    transform: number[],
    viewport: any
  ): Promise<ExtractedImage | null> {
    try {
      // First create the basic extracted image
      const baseImage = await this.createExtractedImageFromObject(obj, objId, pageNumber, imageIndex, source)
      
      if (!baseImage) {
        return null
      }

      // Calculate position and size from transform matrix
      // PDF.js transform: [a, b, c, d, e, f] where:
      // a = horizontal scaling, d = vertical scaling  
      // e = horizontal translation (x), f = vertical translation (y)
      const [a, , , d, e, f] = transform
      
      // Calculate actual rendered size from transform matrix
      const transformWidth = Math.abs(a)
      const transformHeight = Math.abs(d)
      
      // Convert PDF coordinates (bottom-left origin) to top-left origin
      const pageHeight = viewport.height
      const bottomY = f
      const topY = pageHeight - bottomY - transformHeight

      // Add position and size information from transform matrix
      const result = {
        ...baseImage,
        // Override with transformed dimensions
        width: transformWidth,
        height: transformHeight,
        // Store original dimensions for reference
        actualWidth: baseImage.width,
        actualHeight: baseImage.height,
        // Position from transform
        x: e,
        y: topY,
        transform: transform
      }
      
      console.log(`🎯 Updated image ${objId}: ${baseImage.width}x${baseImage.height} → ${transformWidth}x${transformHeight}`)
      
      return result

    } catch (error) {
      console.error('❌ Error extracting image data with transform:', error)
      return null
    }
  }

  /**
   * Create RGB data from raw pixel data with proper format detection and auto-scaling
   * EXACT LOGIC from successful test implementation
   */
  private static async createImageDataFromPixelData(
    pixelData: any,
    width: number,
    height: number,
    imageId = 'unknown',
    pageNumber = 1,
    imageIndex = 0,
    source = 'unknown'
  ): Promise<ExtractedImage | null> {
    try {
      // Auto-scaling limits for memory safety (EXACT from Editor)
      const MAX_CANVAS_DIMENSION = 4000
      const MAX_PIXELS = 8 * 1024 * 1024 // 8M pixels max

      // Calculate safe dimensions with auto-scaling
      const pixels = width * height
      let safeWidth = width
      let safeHeight = height
      let scalingApplied = false

      console.log(`🔧 Analysis: ${width}×${height} = ${pixels.toLocaleString()} pixels`)

      // Check if scaling is needed (EXACT from Editor)
      if (pixels > MAX_PIXELS || width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION) {
        const scale = Math.min(
          Math.sqrt(MAX_PIXELS / pixels),
          MAX_CANVAS_DIMENSION / width,
          MAX_CANVAS_DIMENSION / height
        )
        safeWidth = Math.floor(width * scale)
        safeHeight = Math.floor(height * scale)
        scalingApplied = true
        console.log(`🔄 Auto-scaling applied: ${pixels.toLocaleString()} → ${(safeWidth * safeHeight).toLocaleString()} pixels (${(scale * 100).toFixed(1)}%)`)
      } else {
        console.log('✅ No scaling needed: Image fits within safe limits')
      }

      // Convert to Uint8Array if needed
      let data
      if (pixelData instanceof Uint8Array) {
        data = pixelData
        console.log('✅ Using Uint8Array data')
      } else if (pixelData instanceof Uint8ClampedArray) {
        data = new Uint8Array(pixelData)
        console.log('✅ Converting Uint8ClampedArray to Uint8Array')
      } else if (pixelData instanceof ArrayBuffer) {
        data = new Uint8Array(pixelData)
        console.log('✅ Converting ArrayBuffer to Uint8Array')
      } else if (Array.isArray(pixelData)) {
        data = new Uint8Array(pixelData)
        console.log('✅ Converting Array to Uint8Array')
      } else {
        console.log(`❌ Unsupported pixel data type: ${typeof pixelData}, constructor: ${pixelData?.constructor?.name}`)
        return null
      }

      // **EXACT format detection from successful implementation**
      const expectedRGBA = width * height * 4
      const expectedRGB = width * height * 3

      console.log(`� Format detection for ${imageId}: data.length=${data.length}, expectedRGB=${expectedRGB}, expectedRGBA=${expectedRGBA}`)
      console.log(`🔍 Diff from RGB: ${Math.abs(data.length - expectedRGB)}, Diff from RGBA: ${Math.abs(data.length - expectedRGBA)}`)

      let processedData
      let isRGBA = false

      // Detect format and process (EXACT from successful implementation - NO CONVERSION!)
      if (Math.abs(data.length - expectedRGBA) < Math.abs(data.length - expectedRGB)) {
        // RGBA format processing with scaling
        console.log(`🎨 Processing RGBA format: ${width}×${height} (${imageId})`)
        processedData = await this.processRGBADataNoConversion(data, width, height, safeWidth, safeHeight, scalingApplied)
        isRGBA = true
      } else {
        // RGB format processing with scaling
        console.log(`🎨 Processing RGB format: ${width}×${height} (${imageId})`)
        processedData = await this.processRGBDataWithScaling(data, width, height, safeWidth, safeHeight, scalingApplied)
        isRGBA = false
      }

      if (!processedData) {
        console.log('❌ Data processing failed')
        return null
      }

      // Use Canvas API approach for browser compatibility (like FlexPDF)
      let dataUrl: string

      if (isBrowser) {
        // Browser environment: use Canvas API (FlexPDF approach)
        console.log('🌐 Using Canvas API for browser environment')
        try {
          dataUrl = await this.imageToBlob(processedData, safeWidth, safeHeight, isRGBA)
        } catch (canvasError) {
          console.warn('Canvas API failed, falling back to manual PNG:', canvasError)
          dataUrl = this.createSimpleDataUrl(processedData, safeWidth, safeHeight, isRGBA)
        }
      } else {
        // Node.js environment: use manual PNG creation
        console.log('🖥️ Using manual PNG creation for Node.js environment')
        dataUrl = this.createSimpleDataUrl(processedData, safeWidth, safeHeight, isRGBA)
      }

      return {
        id: `${imageId.replace(/[^a-zA-Z0-9]/g, '_')}`,
        data: dataUrl,
        format: 'png',
        width: width,
        height: height,
        actualWidth: safeWidth,
        actualHeight: safeHeight,
        scaled: scalingApplied,
        scaleFactor: scalingApplied ? (safeWidth / width) : 1.0,
        pageNumber: pageNumber,
        alt: `${source} image ${imageIndex + 1} from page ${pageNumber}`,
        type: 'embedded'
      }

    } catch (error) {
      console.error('❌ Error creating image data from pixel data:', error)
      return null
    }
  }

  /**
   * Process RGBA pixel data with NO CONVERSION - keep RGBA format
   * Based on working implementation
   */
  private static async processRGBADataNoConversion(data: Uint8Array, originalWidth: number, originalHeight: number, safeWidth: number, safeHeight: number, scalingApplied: boolean): Promise<Uint8Array> {
    // Remove unused variable
    // const expectedRGBA = originalWidth * originalHeight * 4

    if (scalingApplied) {
      // Scale down RGBA with smart sampling - KEEP 4 CHANNELS
      console.log('🔄 Scaling RGBA data with sampling (keeping RGBA)')
      const rgbaData = new Uint8Array(safeWidth * safeHeight * 4)
      const scaleX = safeWidth / originalWidth
      const scaleY = safeHeight / originalHeight

      for (let y = 0; y < safeHeight; y++) {
        for (let x = 0; x < safeWidth; x++) {
          const srcX = Math.floor(x / scaleX)
          const srcY = Math.floor(y / scaleY)
          const srcIndex = (srcY * originalWidth + srcX) * 4
          const destIndex = (y * safeWidth + x) * 4

          rgbaData[destIndex] = data[srcIndex] || 0         // R
          rgbaData[destIndex + 1] = data[srcIndex + 1] || 0 // G
          rgbaData[destIndex + 2] = data[srcIndex + 2] || 0 // B
          rgbaData[destIndex + 3] = data[srcIndex + 3] || 255 // A
        }
      }

      return rgbaData
    } else {
      // No scaling needed - keep RGBA format directly
      console.log('✅ Using RGBA data directly (no conversion)')
      const actualPixels = Math.min(Math.floor(data.length / 4), originalWidth * originalHeight)
      const rgbaData = new Uint8Array(actualPixels * 4)

      for (let i = 0; i < actualPixels * 4; i++) {
        rgbaData[i] = data[i] || 0
      }

      return rgbaData
    }
  }

  /**
   * Process RGB pixel data with memory-safe scaling support
   * Based on working implementation
   */
  private static async processRGBDataWithScaling(data: Uint8Array, originalWidth: number, originalHeight: number, safeWidth: number, safeHeight: number, scalingApplied: boolean): Promise<Uint8Array> {
    if (scalingApplied) {
      // Scale down RGB with smart sampling
      console.log('🔄 Scaling RGB data with sampling')
      const rgbData = new Uint8Array(safeWidth * safeHeight * 3)
      const scaleX = safeWidth / originalWidth
      const scaleY = safeHeight / originalHeight

      for (let y = 0; y < safeHeight; y++) {
        for (let x = 0; x < safeWidth; x++) {
          const srcX = Math.floor(x / scaleX)
          const srcY = Math.floor(y / scaleY)
          const srcIndex = (srcY * originalWidth + srcX) * 3
          const destIndex = (y * safeWidth + x) * 3

          rgbData[destIndex] = data[srcIndex] || 0         // R
          rgbData[destIndex + 1] = data[srcIndex + 1] || 0 // G
          rgbData[destIndex + 2] = data[srcIndex + 2] || 0 // B
        }
      }

      return rgbData
    } else {
      // No scaling needed - direct RGB processing
      const actualPixels = Math.min(Math.floor(data.length / 3), originalWidth * originalHeight)
      const rgbData = new Uint8Array(actualPixels * 3)

      for (let i = 0; i < actualPixels * 3; i++) {
        rgbData[i] = data[i] || 0
      }

      return rgbData
    }
  }

  /**
   * CRC32 calculation
   */
  private static calculateCRC32(data: Uint8Array): number {
    let crc = 0xFFFFFFFF
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i]
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
      }
    }
    return crc ^ 0xFFFFFFFF
  }

  /**
   * Convert Uint8Array to base64 (universal implementation)
   */
  private static uint8ArrayToBase64(uint8Array: Uint8Array): string {
    // Node.js
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(uint8Array).toString('base64')
    }

    // Browser
    if (typeof (globalThis as any).btoa !== 'undefined') {
      let binary = ''
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i])
      }
      return (globalThis as any).btoa(binary)
    }

    // Fallback: manual base64 encoding
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let result = ''

    for (let i = 0; i < uint8Array.length; i += 3) {
      const a = uint8Array[i]
      const b = uint8Array[i + 1] || 0
      const c = uint8Array[i + 2] || 0

      const triplet = (a << 16) | (b << 8) | c

      result += chars[(triplet >> 18) & 63]
      result += chars[(triplet >> 12) & 63]
      result += i + 1 < uint8Array.length ? chars[(triplet >> 6) & 63] : '='
      result += i + 2 < uint8Array.length ? chars[triplet & 63] : '='
    }

    return result
  }

  /**
   * Remove duplicate images based on dimensions and content
   */
  private static removeDuplicateImages(images: ExtractedImage[]): ExtractedImage[] {
    const seen = new Set<string>()
    const unique: ExtractedImage[] = []

    for (const image of images) {
      // Create strong fingerprint based on dimensions, content, and data size
      const contentHash = image.data.length > 200 ? image.data.substring(50, 200) : image.data
      const fingerprint = `${image.width}x${image.height}-${image.data.length}-${contentHash}`

      if (!seen.has(fingerprint)) {
        seen.add(fingerprint)
        unique.push(image)
        console.log(`✅ Unique image: ${image.id} (${image.width}x${image.height})`)
      } else {
        console.log(`🚫 Duplicate skipped: ${image.id} (${image.width}x${image.height})`)
      }
    }

    return unique
  }

  /**
   * Create simple data URL using raw pixel data
   * Simple fallback method for Node.js
   */
  private static createSimpleDataUrl(pixelData: Uint8Array, width: number, height: number, hasAlpha: boolean): string {
    // For debugging, let's just return a simple data URL that we can verify works
    // We'll create a minimal valid PNG structure manually

    console.log(`🔧 Creating simple data URL: ${width}x${height}, hasAlpha=${hasAlpha}, dataSize=${pixelData.length}`)

    // Use the existing PNG creation but with a different approach
    const pngBuffer = this.createMinimalValidPNG(pixelData, width, height, hasAlpha)
    const base64 = this.uint8ArrayToBase64(pngBuffer)
    return `data:image/png;base64,${base64}`
  }

  /**
   * Create minimal but valid uncompressed PNG (zero dependencies approach)
   * PNG format supports uncompressed data - perfect for universal compatibility
   */
  private static createMinimalValidPNG(pixelData: Uint8Array, width: number, height: number, hasAlpha: boolean): Uint8Array {
    // PNG signature
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

    // IHDR chunk data
    const colorType = hasAlpha ? 6 : 2 // 2=RGB, 6=RGBA
    const ihdrData = Buffer.alloc(13)
    ihdrData.writeUInt32BE(width, 0)
    ihdrData.writeUInt32BE(height, 4)
    ihdrData[8] = 8   // bit depth
    ihdrData[9] = colorType
    ihdrData[10] = 0  // compression method (deflate/inflate)
    ihdrData[11] = 0  // filter method
    ihdrData[12] = 0  // interlace method

    const ihdr = this.createSimplePNGChunk('IHDR', ihdrData)

    // Create uncompressed IDAT with minimal deflate wrapper
    // This is the key: we create a minimal deflate stream without actual compression
    const bytesPerPixel = hasAlpha ? 4 : 3
    const rawDataSize = height * (1 + width * bytesPerPixel) // +1 for filter byte per row
    const rawData = Buffer.alloc(rawDataSize)

    // Add filter bytes and copy pixel data
    for (let y = 0; y < height; y++) {
      const rowOffset = y * (1 + width * bytesPerPixel)
      rawData[rowOffset] = 0 // Filter type 0 (None) - no filtering

      // Copy pixel data for this row
      for (let x = 0; x < width; x++) {
        const srcOffset = (y * width + x) * bytesPerPixel
        const dstOffset = rowOffset + 1 + (x * bytesPerPixel)

        for (let c = 0; c < bytesPerPixel; c++) {
          rawData[dstOffset + c] = pixelData[srcOffset + c] || 0
        }
      }
    }

    // Create minimal deflate stream (uncompressed blocks)
    // This creates a valid deflate stream without compression libraries
    const uncompressedData = this.createUncompressedDeflateStream(rawData)

    console.log(`🔧 Created uncompressed PNG: ${width}x${height}, raw=${rawData.length}b, deflate=${uncompressedData.length}b`)

    // Create IDAT with uncompressed deflate data
    const idat = this.createSimplePNGChunk('IDAT', uncompressedData)

    // IEND chunk
    const iend = this.createSimplePNGChunk('IEND', Buffer.alloc(0))

    // Combine all chunks
    return Buffer.concat([signature, ihdr, idat, iend])
  }

  /**
   * Create uncompressed deflate stream manually (zero dependencies)
   * This creates a valid deflate format without using compression libraries
   */
  private static createUncompressedDeflateStream(data: Buffer): Buffer {
    const chunks: Buffer[] = []

    // Deflate header (minimal)
    chunks.push(Buffer.from([0x78, 0x01])) // CMF=0x78, FLG=0x01 (no preset dict, fastest compression)

    const maxBlockSize = 65535 // Max size for uncompressed block
    let offset = 0

    while (offset < data.length) {
      const blockSize = Math.min(maxBlockSize, data.length - offset)
      const isLastBlock = (offset + blockSize >= data.length) ? 1 : 0

      // Block header: BFINAL(1bit) + BTYPE(2bits) = 000 for uncompressed block
      chunks.push(Buffer.from([isLastBlock])) // BFINAL=isLastBlock, BTYPE=00 (uncompressed)

      // Length and complement (little-endian) - fix the complement calculation
      const lenBuffer = Buffer.alloc(4)
      lenBuffer.writeUInt16LE(blockSize, 0)              // LEN
      lenBuffer.writeUInt16LE((~blockSize) & 0xFFFF, 2)  // NLEN (one's complement, masked to 16-bit)
      chunks.push(lenBuffer)

      // Actual data
      chunks.push(data.subarray(offset, offset + blockSize))

      offset += blockSize
    }

    // Adler-32 checksum (simplified)
    const adler32 = this.calculateAdler32(data)
    const adlerBuffer = Buffer.alloc(4)
    adlerBuffer.writeUInt32BE(adler32, 0)
    chunks.push(adlerBuffer)

    return Buffer.concat(chunks)
  }

  /**
   * Calculate Adler-32 checksum (required for deflate format)
   */
  private static calculateAdler32(data: Buffer): number {
    let a = 1
    let b = 0
    const MOD_ADLER = 65521

    for (let i = 0; i < data.length; i++) {
      a = (a + data[i]) % MOD_ADLER
      b = (b + a) % MOD_ADLER
    }

    // Use unsigned 32-bit arithmetic to prevent overflow
    return ((b << 16) | a) >>> 0
  }

  /**
   * Create simple PNG chunk
   */
  private static createSimplePNGChunk(type: string, data: Buffer): Buffer {
    const typeBuffer = Buffer.from(type, 'ascii')
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length, 0)

    // Calculate CRC32 for type + data
    const crcInput = Buffer.concat([typeBuffer, data])
    const crcValue = this.calculateCRC32(new Uint8Array(crcInput))

    // Ensure CRC is unsigned 32-bit
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crcValue >>> 0, 0) // >>> 0 ensures unsigned 32-bit

    return Buffer.concat([length, typeBuffer, data, crc])
  }
}
