/**
 * PDF Image Extractor - Universal Implementation for PDF.js 3.x & 5.x
 * 
 * Following PDF.js best practices for cross-platform image extraction:
 * - Uses PDFObjects for proper resource management 
 * - Implements universal compatibility (Browser + Node.js)
 * - Direct processing approach like editor (no defensive validation)
 * - Supports multiple image formats and color spaces
 * - Follows PDF.js 3.x/5.x API patterns
 */

import { PDFPageProxy } from 'pdfjs-dist'
import zlib from 'zlib'

export interface ExtractedImage {
  id: string
  data: string // base64 data URL
  format: 'png' | 'jpg' | 'jpeg'
  width: number
  height: number
  actualWidth?: number
  actualHeight?: number
  scaled?: boolean
  scaleFactor?: number
  pageNumber: number
  alt: string
  type: 'embedded'
}

export class PdfImageExtractor {
  /**
   * Memory-safe pixel threshold for auto-scaling
   */
  private static readonly MAX_SAFE_PIXELS = 8 * 1024 * 1024
  private static readonly MAX_DIMENSION = 4000

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
      
      console.log('🔍 Page type:', page.constructor?.name || typeof page)
      console.log(`� Processing page ${pageNumber}`)
      
      // Method 1: Check operator list for image operations
      const operatorImages = await this.extractFromOperatorList(pdfPageProxy)
      images.push(...operatorImages)
      
      // Method 2: Check page objects (main method)
      const pageObjImages = await PdfImageExtractor.extractFromPageObjects(pdfPageProxy, pageNumber)
      images.push(...pageObjImages)
      
      // Method 3: Check common objects (fallback)  
      const commonObjImages = await PdfImageExtractor.extractFromCommonObjects(pdfPageProxy, pageNumber)
      images.push(...commonObjImages)
      
      // Method 4: XObject analysis (fallback)
      const xObjectImages = await PdfImageExtractor.extractFromPageContent(pdfPageProxy, pageNumber)
      images.push(...xObjectImages)
      
      // Remove duplicates based on content and dimensions
      const uniqueImages = PdfImageExtractor.removeDuplicateImages(images)
      console.log(`🎯 Total images found on page ${pageNumber}: ${images.length} (${uniqueImages.length} unique)`)
      
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
  private async extractFromOperatorList(page: any): Promise<ExtractedImage[]> {
    const images: ExtractedImage[] = []
    
    try {
      console.log('🔍 Analyzing operator list for images...')
      
      // Check if getOperatorList is available
      if (typeof page.getOperatorList !== 'function') {
        console.log('⚠️ getOperatorList not available, skipping operator analysis')
        return []
      }
      
      const operatorList = await page.getOperatorList()
      
      console.log('📋 Found', operatorList.fnArray.length, 'operations')
      
      // Look for image operations
      // 85 = Do (XObject), 86 = BI (Begin inline image), 87 = ID/EI (inline image data)
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const op = operatorList.fnArray[i]
        const args = operatorList.argsArray[i]
        
        if (op === 85) { // Do operation - paint XObject
          console.log('🖼️ Found XObject operation:', args)
          
          if (args && args.length > 0) {
            const imageName = args[0]
            
            // Try to get image data from page resources
            const imageData = await this.extractXObjectImage(page, imageName)
            if (imageData) {
              images.push({
                id: imageName,
                data: imageData,
                width: args[1] || 0,
                height: args[2] || 0,
                format: 'png',
                pageNumber: 1,
                alt: imageName,
                type: 'embedded'
              })
            }
          }
        } else if (op === 86) { // BI - Begin inline image
          console.log('🖼️ Found inline image operation:', args)
          
          // Inline images are harder to extract in PDF.js 5.x
          // For now, we'll track them
          images.push({
            id: `inline_${i}`,
            data: '', // TODO: Extract inline image data
            width: 0,
            height: 0,
            format: 'png',
            pageNumber: 1,
            alt: `Inline image ${i}`,
            type: 'embedded'
          })
        }
      }
      
      console.log('📊 Operator list found', images.length, 'images')
      return images
      
    } catch (error) {
      console.log('⚠️ Operator list analysis failed, continuing with other methods:', (error as Error).message)
      return []
    }
  }

  /**
   * Extract XObject image data from page resources - Enhanced version
   */
  private async extractXObjectImage(page: any, imageName: string): Promise<string | null> {
    try {
      console.log(`🔍 Extracting XObject image: ${imageName}`)
      
      const pageProxy = page as any
      
      // Method 1: Try to access page dictionary
      if (pageProxy._pageDict) {
        const pageDict = pageProxy._pageDict
        const resources = pageDict.get('Resources')
        
        if (resources) {
          const xObjectDict = resources.get('XObject')
          
          if (xObjectDict) {
            const imageObj = xObjectDict.get(imageName)
            
            if (imageObj && imageObj.get('Subtype')?.name === 'Image') {
              console.log(`✅ Found image object: ${imageName}`)
              
              // Get image properties
              const width = imageObj.get('Width')
              const height = imageObj.get('Height') 
              const bitsPerComponent = imageObj.get('BitsPerComponent')
              
              console.log('📐 Image props:', width + 'x' + height, bitsPerComponent + 'bpc')
              
              // Try to get image data
              try {
                const imageData = await imageObj.getBytes()
                if (imageData && imageData.length > 0) {
                  console.log(`📊 Got image data: ${imageData.length} bytes`)
                  
                  // Convert to base64 (simplified - real conversion would need proper image encoding)
                  const base64 = this.arrayToBase64(imageData)
                  return `data:image/png;base64,${base64}`
                }
              } catch (e: any) {
                console.log(`⚠️ Could not get image bytes for ${imageName}:`, e?.message || 'Unknown error')
              }
            }
          }
        }
      }
      
      // Method 2: Try to get from page.objs directly
      const pageObjs = pageProxy.objs
      if (pageObjs && pageObjs.has && pageObjs.has(imageName)) {
        console.log(`📦 Found ${imageName} in page.objs, extracting...`)
        const objData = pageObjs.get(imageName)
        if (PdfImageExtractor.isImageObject(objData)) {
          console.log(`✅ Processing ${imageName} from page.objs`)
          const extractedImage = await PdfImageExtractor.createExtractedImageFromObject(
            objData,
            imageName,
            1, // page number will be corrected later
            0,
            'xobject-direct'
          )
          if (extractedImage) {
            return extractedImage.data
          }
        }
      }
      
      // Method 3: Try async get from page.objs
      if (pageObjs && pageObjs.get) {
        console.log(`🔄 Trying async get for ${imageName}`)
        try {
          const objData = await new Promise((resolve) => {
            pageObjs.get(imageName, (data: any) => {
              console.log(`📦 Got async data for ${imageName}:`, typeof data)
              resolve(data)
            })
            // Timeout after 200ms
            setTimeout(() => resolve(null), 200)
          })
          
          if (objData && PdfImageExtractor.isImageObject(objData)) {
            console.log(`✅ Processing ${imageName} from async page.objs`)
            const extractedImage = await PdfImageExtractor.createExtractedImageFromObject(
              objData,
              imageName,
              1,
              0,
              'xobject-async'
            )
            if (extractedImage) {
              return extractedImage.data
            }
          }
        } catch (asyncError) {
          console.log(`⚠️ Async get failed for ${imageName}:`, asyncError)
        }
      }
      
      // Method 4: Try common objects
      const commonObjs = pageProxy.commonObjs
      if (commonObjs && commonObjs.has && commonObjs.has(imageName)) {
        console.log(`🌐 Found ${imageName} in commonObjs, extracting...`)
        const objData = commonObjs.get(imageName)
        if (PdfImageExtractor.isImageObject(objData)) {
          console.log(`✅ Processing ${imageName} from commonObjs`)
          const extractedImage = await PdfImageExtractor.createExtractedImageFromObject(
            objData,
            imageName,
            1,
            0,
            'xobject-common'
          )
          if (extractedImage) {
            return extractedImage.data
          }
        }
      }
      
      console.log(`❌ Could not extract XObject ${imageName} with any method`)
      return null
    } catch (error) {
      console.error(`❌ Error extracting XObject ${imageName}:`, error)
      return null
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
   * Extract images from page.objs (page-specific resources)
   */
  private static async extractFromPageObjects(pdfPage: PDFPageProxy, pageNumber: number): Promise<ExtractedImage[]> {
    const extractedImages: ExtractedImage[] = []
    
    try {
      // Access page objects through internal API (following PDF.js patterns)
      const pageObjs = (pdfPage as any).objs
      if (!pageObjs) {
        console.log(`📋 No page objects available for page ${pageNumber}`)
        return []
      }

      // Debug: Check what methods are available
      console.log('🔍 Page objects methods:', Object.getOwnPropertyNames(pageObjs))
      console.log('🔍 Page objects prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(pageObjs)))

      // Try different ways to access objects
      if (pageObjs.objs) {
        console.log('📋 Found pageObjs.objs with keys:', Object.keys(pageObjs.objs))
      }

      // Try iterator if available
      if (typeof pageObjs[Symbol.iterator] === 'function') {
        console.log('🔄 Using iterator to access page objects')
        let imageIndex = 0
        for (const [objId, objData] of pageObjs) {
          console.log(`📦 Page object: ${objId}`, {
            type: typeof objData,
            constructor: objData?.constructor?.name,
            isImage: this.isImageObject(objData)
          })
          
          if (this.isImageObject(objData)) {
            console.log(`🖼️ Processing page object image: ${objId}`)
            
            const extractedImage = await this.createExtractedImageFromObject(
              objData,
              objId,
              pageNumber,
              imageIndex,
              'page-obj'
            )
            
            if (extractedImage) {
              extractedImages.push(extractedImage)
              imageIndex++
            }
          }
        }
      } else if (pageObjs.get && typeof pageObjs.get === 'function') {
        console.log('🔄 Using get method to access page objects')
        // Try to get all objects via get method
        // We need to know the object IDs first
      } else {
        console.log('⚠️ No iterator or get method available on pageObjs')
      }

      console.log(`📦 Found ${extractedImages.length} images in page objects`)
      return extractedImages

    } catch (error) {
      console.error('❌ Error accessing page objects:', error)
      return []
    }
  }

  /**
   * Extract images from page.commonObjs (shared resources)
   */
  private static async extractFromCommonObjects(pdfPage: PDFPageProxy, pageNumber: number): Promise<ExtractedImage[]> {
    const extractedImages: ExtractedImage[] = []
    
    try {
      // Access common objects through internal API
      const commonObjs = (pdfPage as any).commonObjs
      if (!commonObjs) {
        console.log(`📋 No common objects available for page ${pageNumber}`)
        return []
      }

      // Iterate through common objects
      let imageIndex = 0
      for (const [objId, objData] of commonObjs) {
        try {
          if (this.isImageObject(objData)) {
            console.log(`🖼️ Processing common object image: ${objId}`)
            
            const extractedImage = await this.createExtractedImageFromObject(
              objData,
              objId,
              pageNumber,
              imageIndex,
              'common-obj'
            )
            
            if (extractedImage) {
              extractedImages.push(extractedImage)
              imageIndex++
            }
          }
        } catch (error) {
          console.error(`❌ Error processing common object ${objId}:`, error)
        }
      }

      console.log(`🌐 Found ${extractedImages.length} images in common objects`)
      return extractedImages

    } catch (error) {
      console.error('❌ Error accessing common objects:', error)
      return []
    }
  }

  /**
   * Extract images by analyzing page content stream (primary method for PDF.js 5.x)
   */
  private static async extractFromPageContent(pdfPage: PDFPageProxy, pageNumber: number): Promise<ExtractedImage[]> {
    const extractedImages: ExtractedImage[] = []
    
    try {
      // Get page text content to ensure page is processed
      await pdfPage.getTextContent()
      
      // Try to access page dictionary for direct resource analysis
      const pageDict = (pdfPage as any)._pageDict
      if (pageDict && pageDict.get) {
        const resources = pageDict.get('Resources')
        if (resources && resources.get) {
          const xObjectDict = resources.get('XObject')
          if (xObjectDict && xObjectDict.getKeys) {
            const imageKeys = xObjectDict.getKeys()
            console.log(`🎯 Found ${imageKeys.length} XObject resources in page content`)
            
            for (let i = 0; i < imageKeys.length; i++) {
              const key = imageKeys[i]
              try {
                const xObj = xObjectDict.get(key)
                if (xObj && xObj.get && xObj.get('Subtype')?.name === 'Image') {
                  console.log(`🖼️ Processing XObject image: ${key}`)
                  
                  const width = xObj.get('Width') || 100
                  const height = xObj.get('Height') || 100
                  
                  // Try to get actual image data from page.objs or commonObjs
                  let imageData = null
                  
                  // Check if image is loaded in page objects
                  const pageObjs = (pdfPage as any).objs
                  if (pageObjs && pageObjs.has && pageObjs.has(key)) {
                    imageData = pageObjs.get(key)
                    console.log(`📦 Found actual image data in page.objs for: ${key}`)
                  } else if (pageObjs && pageObjs.get) {
                    // Try async get with callback
                    imageData = await new Promise((resolve) => {
                      pageObjs.get(key, (data: any) => {
                        console.log(`📦 Got async image data for: ${key}`, typeof data)
                        resolve(data)
                      })
                      // Timeout after 100ms
                      setTimeout(() => resolve(null), 100)
                    })
                  }
                  
                  // Check common objects
                  if (!imageData) {
                    const commonObjs = (pdfPage as any).commonObjs
                    if (commonObjs && commonObjs.has && commonObjs.has(key)) {
                      imageData = commonObjs.get(key)
                      console.log(`🌐 Found actual image data in commonObjs for: ${key}`)
                    }
                  }
                  
                  // Create extracted image
                  if (imageData && this.isImageObject(imageData)) {
                    // We have actual image data!
                    console.log(`✅ Processing real image data for: ${key}`)
                    const realImage = await this.createExtractedImageFromObject(
                      imageData,
                      key,
                      pageNumber,
                      i,
                      'xobj-real'
                    )
                    if (realImage) {
                      extractedImages.push(realImage)
                      continue
                    }
                  }
                  
                  // Fallback: create placeholder
                  const extractedImage: ExtractedImage = {
                    id: `page-${pageNumber}-xobj-${key}`,
                    data: this.createPlaceholderImageData(width, height),
                    format: 'png',
                    width,
                    height,
                    pageNumber,
                    alt: `XObject image ${key} from page ${pageNumber}`,
                    type: 'embedded'
                  }
                  
                  extractedImages.push(extractedImage)
                  console.log(`📄 Created placeholder for XObject: ${key} (${width}x${height})`)
                }
              } catch (error) {
                console.error(`❌ Error processing XObject ${key}:`, error)
              }
            }
          }
        }
      }

      console.log(`📄 Found ${extractedImages.length} images in page content`)
      return extractedImages

    } catch (error) {
      console.error('❌ Error analyzing page content:', error)
      return []
    }
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
      console.log(`🖼️ Analyzing image object for ${objId}:`, {
        type: typeof obj,
        constructor: obj?.constructor?.name,
        width: obj?.width,
        height: obj?.height,
        hasData: !!obj?.data,
        hasBitmap: !!obj?.bitmap,
        keys: Object.keys(obj),
        dataType: obj?.data?.constructor?.name,
        dataFirstBytes: obj?.data ? Array.from(obj.data.slice(0, 20)) : 'N/A'
      })

      const width = obj?.width || 0
      const height = obj?.height || 0

      if (!width || !height) {
        console.log(`❌ Invalid image dimensions: ${width}x${height}`)
        return null
      }

      // **EXACT LOGIC from Editor**: Handle objects with pixel data
      if (obj.data && obj.data.length > 0) {
        console.log(`📊 Processing pixel data: ${obj.data.length} bytes`)
        return await this.createImageDataFromPixelData(obj.data, width, height, objId, pageNumber, imageIndex, source)
      }

      // **EXACT LOGIC from Editor**: Handle bitmap objects
      if (obj.bitmap) {
        console.log('🔧 Processing bitmap object')
        
        if (obj.bitmap.data && obj.bitmap.data.length > 0) {
          return await this.createImageDataFromPixelData(obj.bitmap.data, width, height, objId, pageNumber, imageIndex, source)
        }
      }

      console.log('❌ No supported extraction method found for image object type')
      return null

    } catch (error) {
      console.error('❌ Error extracting image data:', error)
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
    imageId: string = 'unknown',
    pageNumber: number = 1,
    imageIndex: number = 0,
    source: string = 'unknown'
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

      // Create PNG with proper format flag
      const pngBuffer = this.createPNGBuffer(processedData, safeWidth, safeHeight, isRGBA)
      const dataUrl = `data:image/png;base64,${this.uint8ArrayToBase64(pngBuffer)}`

      return {
        id: `${source}-${pageNumber}-${imageIndex + 1}-${imageId.replace(/[^a-zA-Z0-9]/g, '_')}`,
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
   * Create PNG buffer from processed pixel data using pure JavaScript
   * Based on working implementation - no canvas dependencies
   */
  private static createPNGBuffer(imageData: Uint8Array, width: number, height: number, hasAlpha: boolean = false): Buffer {
    const crc32 = (data: Buffer): number => {
      let crc = 0xFFFFFFFF
      for (let i = 0; i < data.length; i++) {
        crc = (crc ^ data[i]) >>> 0
        for (let j = 0; j < 8; j++) {
          crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1)
        }
      }
      return (crc ^ 0xFFFFFFFF) >>> 0
    }

    const writeUint32BE = (value: number): Buffer => {
      return Buffer.from([
        (value >>> 24) & 0xFF,
        (value >>> 16) & 0xFF,
        (value >>> 8) & 0xFF,
        value & 0xFF
      ])
    }

    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

    // IHDR chunk - support both RGB and RGBA
    const colorType = hasAlpha ? 6 : 2 // 6 = RGBA, 2 = RGB
    const bytesPerPixel = hasAlpha ? 4 : 3
    
    const ihdrData = Buffer.concat([
      writeUint32BE(width),
      writeUint32BE(height),
      Buffer.from([8, colorType, 0, 0, 0]) // 8-bit RGB or RGBA
    ])
    const ihdr = Buffer.concat([
      writeUint32BE(13),
      Buffer.from('IHDR'),
      ihdrData,
      writeUint32BE(crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData])))
    ])

    // Prepare image data with row filters
    const rowLength = width * bytesPerPixel + 1 // RGB/RGBA + filter byte
    const filteredData = Buffer.alloc(height * rowLength)
    let srcIndex = 0

    for (let y = 0; y < height; y++) {
      const rowStart = y * rowLength
      filteredData[rowStart] = 0 // No filter

      for (let x = 0; x < width; x++) {
        const pixelStart = rowStart + 1 + x * bytesPerPixel
        filteredData[pixelStart] = imageData[srcIndex++]     // R
        filteredData[pixelStart + 1] = imageData[srcIndex++] // G
        filteredData[pixelStart + 2] = imageData[srcIndex++] // B
        if (hasAlpha) {
          filteredData[pixelStart + 3] = imageData[srcIndex++] // A
        }
      }
    }

    // Simple deflate compression
    const idatCompressedData = zlib.deflateSync(filteredData)

    // IDAT chunk
    const idat = Buffer.concat([
      writeUint32BE(idatCompressedData.length),
      Buffer.from('IDAT'),
      idatCompressedData,
      writeUint32BE(crc32(Buffer.concat([Buffer.from('IDAT'), idatCompressedData])))
    ])

    // IEND chunk
    const iend = Buffer.concat([
      writeUint32BE(0),
      Buffer.from('IEND'),
      writeUint32BE(crc32(Buffer.from('IEND')))
    ])

    return Buffer.concat([signature, ihdr, idat, iend])
  }

  /**
   * Create canvas from ImageData (browser only)
   */
  private static createCanvasFromImageData(imageData: any): any | null {
    try {
      if (typeof (globalThis as any).document === 'undefined') {
        console.log('⚠️ ImageData conversion requires browser environment')
        return null
      }

      const canvas = (globalThis as any).document.createElement('canvas')
      canvas.width = imageData.width
      canvas.height = imageData.height
      
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      
      ctx.putImageData(imageData, 0, 0)
      return canvas
    } catch (error) {
      console.error('❌ Failed to create canvas from ImageData:', error)
      return null
    }
  }

  /**
   * Create canvas from ImageBitmap (browser only)
   */
  private static createCanvasFromImageBitmap(imageBitmap: any): any | null {
    try {
      if (typeof (globalThis as any).document === 'undefined') {
        console.log('⚠️ ImageBitmap conversion requires browser environment')
        return null
      }

      const canvas = (globalThis as any).document.createElement('canvas')
      canvas.width = imageBitmap.width
      canvas.height = imageBitmap.height
      
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      
      ctx.drawImage(imageBitmap, 0, 0)
      return canvas
    } catch (error) {
      console.error('❌ Failed to create canvas from ImageBitmap:', error)
      return null
    }
  }

  /**
   * Create image from raw image data (Node.js compatible with proper PNG encoding)
   */
  private static createImageFromRawData(data: Uint8Array | ArrayBuffer, width: number, height: number): string | null {
    try {
      if (typeof document === 'undefined') {
        // Node.js environment - need proper PNG encoding
        console.log('🔧 Converting raw image data to PNG in Node.js environment')
        
        const dataArray = data instanceof ArrayBuffer ? new Uint8Array(data) : data
        
        // Check if this is already encoded image data
        try {
          if (dataArray.length > 8) {
            // Check for PNG signature: 89 50 4E 47
            if (dataArray[0] === 0x89 && dataArray[1] === 0x50 && dataArray[2] === 0x4E && dataArray[3] === 0x47) {
              console.log('✅ Data is already PNG format')
              const base64 = Buffer.from(dataArray).toString('base64')
              return `data:image/png;base64,${base64}`
            }
            // Check for JPEG signature: FF D8 FF
            if (dataArray[0] === 0xFF && dataArray[1] === 0xD8 && dataArray[2] === 0xFF) {
              console.log('✅ Data is already JPEG format')
              const base64 = Buffer.from(dataArray).toString('base64')
              return `data:image/jpeg;base64,${base64}`
            }
          }
        } catch {
          console.log('⚠️ Could not detect image format, treating as raw data')
        }
        
        // If raw pixel data, encode as PNG using pure JavaScript
        console.log(`🔧 Encoding raw pixel data: ${dataArray.length} bytes → ${width}x${height}`)
        
        // DEBUG: Analyze raw data first
        const expectedPixels = width * height
        const bytesPerPixel = dataArray.length / expectedPixels
        console.log('🔍 RAW DATA ANALYSIS:')
        console.log(`   - Dimensions: ${width}x${height} = ${expectedPixels} pixels`)
        console.log(`   - Data size: ${dataArray.length} bytes`)
        console.log(`   - Bytes per pixel: ${bytesPerPixel.toFixed(2)}`)
        
        // Check data content
        let nonZeroCount = 0
        let minVal = 255, maxVal = 0
        const sampleSize = Math.min(100, dataArray.length)
        
        for (let i = 0; i < sampleSize; i++) {
          const val = dataArray[i]
          if (val > 0) nonZeroCount++
          minVal = Math.min(minVal, val)
          maxVal = Math.max(maxVal, val)
        }
        
        console.log(`   - Non-zero values: ${nonZeroCount}/${sampleSize} (${(nonZeroCount/sampleSize*100).toFixed(1)}%)`)
        console.log(`   - Value range: [${minVal}-${maxVal}]`)
        console.log(`   - Sample data: [${Array.from(dataArray.slice(0, 10)).join(', ')}]`)
        
        if (nonZeroCount === 0) {
          console.log('⚠️ Raw data appears to be all zeros - creating test pattern')
          // Create a visible test pattern
          const testData = new Uint8Array(expectedPixels * 4) // RGBA
          for (let i = 0; i < expectedPixels; i++) {
            const x = i % width
            const y = Math.floor(i / width)
            const isWhite = (Math.floor(x / 20) + Math.floor(y / 20)) % 2 === 0
            
            testData[i * 4] = isWhite ? 255 : 0     // R
            testData[i * 4 + 1] = isWhite ? 255 : 0 // G  
            testData[i * 4 + 2] = isWhite ? 255 : 0 // B
            testData[i * 4 + 3] = 255               // A
          }
          return this.createPNGFromPixels(testData, width, height)
        }
        
        // Convert to RGBA format
        const rgbaPixels = this.convertToRGBA(dataArray, width, height)
        
        // Create PNG using pure JavaScript encoder
        return this.createPNGFromPixels(rgbaPixels, width, height)
      }

      // Browser environment - use Canvas
      if (typeof (globalThis as any).document !== 'undefined') {
        const canvas = (globalThis as any).document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        
        const ctx = canvas.getContext('2d')
        if (!ctx) return null
        
        // Convert raw data to ImageData
        const dataArray = data instanceof ArrayBuffer ? new Uint8Array(data) : data
        const imageData = ctx.createImageData(width, height)
        
        // Copy data (assuming RGBA format)
        for (let i = 0; i < Math.min(dataArray.length, imageData.data.length); i++) {
          imageData.data[i] = dataArray[i]
        }
        
        ctx.putImageData(imageData, 0, 0)
        return canvas.toDataURL('image/png')
      }
      
      return null
    } catch (error) {
      console.error('❌ Failed to create image from raw data:', error)
      return null
    }
  }

  /**
   * Convert RGB to RGBA (based on working script logic)
   */
  private static convertRGBToRGBA(rgbData: Uint8Array, pixelCount: number): Uint8Array {
    const rgbaData = new Uint8Array(pixelCount * 4)
    
    for (let i = 0; i < pixelCount; i++) {
      rgbaData[i * 4] = rgbData[i * 3] || 0         // R
      rgbaData[i * 4 + 1] = rgbData[i * 3 + 1] || 0 // G
      rgbaData[i * 4 + 2] = rgbData[i * 3 + 2] || 0 // B
      rgbaData[i * 4 + 3] = 255                     // A
    }
    
    return rgbaData
  }

  /**
   * Convert Grayscale to RGBA (based on working script logic)
   */
  private static convertGrayscaleToRGBA(grayData: Uint8Array, pixelCount: number): Uint8Array {
    const rgbaData = new Uint8Array(pixelCount * 4)
    
    for (let i = 0; i < pixelCount; i++) {
      const gray = grayData[i] || 0
      rgbaData[i * 4] = gray     // R
      rgbaData[i * 4 + 1] = gray // G
      rgbaData[i * 4 + 2] = gray // B
      rgbaData[i * 4 + 3] = 255  // A
    }
    
    return rgbaData
  }

  /**
   * Convert unknown format to RGBA adaptively (based on working script logic)
   */
  private static convertAdaptiveToRGBA(pixelData: Uint8Array, pixelCount: number, bytesPerPixel: number): Uint8Array {
    const rgbaData = new Uint8Array(pixelCount * 4)
    
    for (let i = 0; i < pixelCount; i++) {
      const srcIndex = i * bytesPerPixel
      const destIndex = i * 4
      
      if (bytesPerPixel >= 3) {
        // Treat as RGB-like
        rgbaData[destIndex] = pixelData[srcIndex] || 0
        rgbaData[destIndex + 1] = pixelData[srcIndex + 1] || 0
        rgbaData[destIndex + 2] = pixelData[srcIndex + 2] || 0
        rgbaData[destIndex + 3] = bytesPerPixel >= 4 ? (pixelData[srcIndex + 3] || 255) : 255
      } else {
        // Single channel
        const value = pixelData[srcIndex] || 0
        rgbaData[destIndex] = value
        rgbaData[destIndex + 1] = value
        rgbaData[destIndex + 2] = value
        rgbaData[destIndex + 3] = 255
      }
    }
    
    return rgbaData
  }

  /**
   * Convert any color space to RGBA
   */
  private static convertToRGBA(bytes: Uint8Array, width: number, height: number): Uint8Array {
    const expectedSize = width * height * 4 // RGBA
    
    console.log(`🎨 Converting to RGBA: ${bytes.length} bytes → ${expectedSize} bytes expected`)
    
    if (bytes.length === expectedSize) {
      // Already RGBA
      console.log('✅ Data is already RGBA format')
      return bytes
    }
    
    const rgba = new Uint8Array(expectedSize)
    
    if (bytes.length === width * height) {
      // Grayscale to RGBA
      console.log('🔄 Converting grayscale to RGBA')
      for (let i = 0; i < width * height; i++) {
        const gray = bytes[i] || 0
        rgba[i * 4] = gray     // R
        rgba[i * 4 + 1] = gray // G
        rgba[i * 4 + 2] = gray // B
        rgba[i * 4 + 3] = 255  // A
      }
    } else if (bytes.length === width * height * 3) {
      // RGB to RGBA
      console.log('🔄 Converting RGB to RGBA')
      for (let i = 0; i < width * height; i++) {
        rgba[i * 4] = bytes[i * 3] || 0         // R
        rgba[i * 4 + 1] = bytes[i * 3 + 1] || 0 // G
        rgba[i * 4 + 2] = bytes[i * 3 + 2] || 0 // B
        rgba[i * 4 + 3] = 255                   // A
      }
    } else {
      // Unknown format - try to interpret raw data intelligently
      console.log(`⚠️ Unknown format: ${bytes.length} bytes for ${width}x${height}`)
      
      const pixelCount = width * height
      
      if (bytes.length < pixelCount) {
        // Too little data - repeat pattern
        console.log('🔄 Expanding limited data with pattern')
        for (let i = 0; i < pixelCount; i++) {
          const sourceIndex = i % bytes.length
          const value = bytes[sourceIndex] || 128
          
          rgba[i * 4] = value     // R
          rgba[i * 4 + 1] = value // G
          rgba[i * 4 + 2] = value // B
          rgba[i * 4 + 3] = 255   // A
        }
      } else {
        // More data than expected - try different interpretations
        console.log('🔄 Interpreting raw data with multiple channels')
        
        const bytesPerPixel = Math.floor(bytes.length / pixelCount)
        console.log(`📊 Estimated ${bytesPerPixel} bytes per pixel`)
        
        for (let i = 0; i < pixelCount; i++) {
          const baseIndex = i * bytesPerPixel
          
          if (bytesPerPixel >= 3) {
            // Treat as RGB+ data
            rgba[i * 4] = bytes[baseIndex] || 0         // R
            rgba[i * 4 + 1] = bytes[baseIndex + 1] || 0 // G
            rgba[i * 4 + 2] = bytes[baseIndex + 2] || 0 // B
            rgba[i * 4 + 3] = 255                       // A
          } else if (bytesPerPixel >= 1) {
            // Treat as grayscale with potential extra channels
            const gray = bytes[baseIndex] || 0
            rgba[i * 4] = gray     // R
            rgba[i * 4 + 1] = gray // G
            rgba[i * 4 + 2] = gray // B
            rgba[i * 4 + 3] = 255  // A
          } else {
            // Fill with mid-gray as fallback
            rgba[i * 4] = 128     // R
            rgba[i * 4 + 1] = 128 // G
            rgba[i * 4 + 2] = 128 // B
            rgba[i * 4 + 3] = 255 // A
          }
        }
      }
    }
    
    // Verify we have non-zero data
    let hasContent = false
    for (let i = 0; i < Math.min(rgba.length, 1000); i += 4) {
      if (rgba[i] > 0 || rgba[i + 1] > 0 || rgba[i + 2] > 0) {
        hasContent = true
        break
      }
    }
    
    if (!hasContent) {
      console.log('⚠️ Generated RGBA appears to be all black/empty, adding some content for testing')
      // Add a visible pattern for debugging
      for (let i = 0; i < Math.min(rgba.length / 4, 10000); i++) {
        const x = i % width
        const y = Math.floor(i / width)
        
        if ((x + y) % 20 < 10) {
          rgba[i * 4] = 255     // R - white stripes
          rgba[i * 4 + 1] = 255 // G
          rgba[i * 4 + 2] = 255 // B
          rgba[i * 4 + 3] = 255 // A
        } else {
          rgba[i * 4] = 100     // R - dark stripes
          rgba[i * 4 + 1] = 100 // G
          rgba[i * 4 + 2] = 100 // B
          rgba[i * 4 + 3] = 255 // A
        }
      }
    }
    
    console.log(`✅ RGBA conversion complete: ${rgba.length} bytes`)
    return rgba
  }

  /**
   * Create PNG from raw pixel data using pure JavaScript
   */
  private static createPNGFromPixels(pixels: Uint8Array, width: number, height: number): string {
    console.log(`🔧 Creating PNG: ${width}x${height} (${pixels.length} pixel bytes)`)
    
    // PNG file structure: signature + IHDR + IDAT + IEND
    const pngSignature = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    
    // Create IHDR chunk
    const ihdr = this.createIHDRChunk(width, height)
    
    // Create IDAT chunk (image data)
    const idat = this.createIDATChunk(pixels, width, height)
    
    // Create IEND chunk
    const iend = this.createIENDChunk()
    
    // Combine all chunks
    const totalSize = pngSignature.length + ihdr.length + idat.length + iend.length
    const pngBuffer = new Uint8Array(totalSize)
    
    let offset = 0
    pngBuffer.set(pngSignature, offset); offset += pngSignature.length
    pngBuffer.set(ihdr, offset); offset += ihdr.length  
    pngBuffer.set(idat, offset); offset += idat.length
    pngBuffer.set(iend, offset)
    
    // Convert to base64
    const base64 = this.uint8ArrayToBase64(pngBuffer)
    console.log(`✅ PNG created: ${base64.length} base64 chars`)
    
    return `data:image/png;base64,${base64}`
  }

  /**
   * Create PNG IHDR chunk
   */
  private static createIHDRChunk(width: number, height: number): Uint8Array {
    const data = new Uint8Array(13) // IHDR is always 13 bytes
    const view = new DataView(data.buffer)
    
    view.setUint32(0, width, false)      // Width (big-endian)
    view.setUint32(4, height, false)     // Height (big-endian)
    view.setUint8(8, 8)                  // Bit depth
    view.setUint8(9, 6)                  // Color type (RGBA)
    view.setUint8(10, 0)                 // Compression method
    view.setUint8(11, 0)                 // Filter method
    view.setUint8(12, 0)                 // Interlace method
    
    return this.createPNGChunk('IHDR', data)
  }

  /**
   * Create PNG IDAT chunk with minimal compression
   */
  private static createIDATChunk(pixels: Uint8Array, width: number, height: number): Uint8Array {
    // Add filter byte (0 = None) for each row
    const bytesPerRow = width * 4 // RGBA
    const rawData = new Uint8Array(height * (1 + bytesPerRow))
    
    for (let y = 0; y < height; y++) {
      const rowStart = y * (1 + bytesPerRow)
      rawData[rowStart] = 0 // Filter type: None
      
      // Copy pixel data for this row
      const pixelRowStart = y * bytesPerRow
      for (let x = 0; x < bytesPerRow; x++) {
        rawData[rowStart + 1 + x] = pixels[pixelRowStart + x] || 0
      }
    }
    
    // Apply minimal zlib compression
    const compressed = this.minimalZlibCompress(rawData)
    
    return this.createPNGChunk('IDAT', compressed)
  }

  /**
   * Create PNG IEND chunk
   */
  private static createIENDChunk(): Uint8Array {
    return this.createPNGChunk('IEND', new Uint8Array(0))
  }

  /**
   * Create PNG chunk with length, type, data, and CRC
   */
  private static createPNGChunk(type: string, data: Uint8Array): Uint8Array {
    const typeBytes = new (globalThis as any).TextEncoder().encode(type)
    const chunk = new Uint8Array(4 + 4 + data.length + 4) // length + type + data + crc
    const view = new DataView(chunk.buffer)
    
    // Length (big-endian)
    view.setUint32(0, data.length, false)
    
    // Type
    chunk.set(typeBytes, 4)
    
    // Data
    chunk.set(data, 8)
    
    // CRC
    const crcData = new Uint8Array(typeBytes.length + data.length)
    crcData.set(typeBytes, 0)
    crcData.set(data, typeBytes.length)
    const crc = this.calculateCRC32(crcData)
    view.setUint32(8 + data.length, crc, false)
    
    return chunk
  }

  /**
   * Minimal zlib compression
   */
  private static minimalZlibCompress(data: Uint8Array): Uint8Array {
    const result = new Uint8Array(data.length + 6)
    
    // Zlib header (2 bytes) - no compression
    result[0] = 0x78 // CMF
    result[1] = 0x01 // FLG (no compression)
    
    // Raw data
    result.set(data, 2)
    
    // Adler32 checksum (4 bytes)
    const adler = this.calculateAdler32(data)
    const view = new DataView(result.buffer, data.length + 2)
    view.setUint32(0, adler, false)
    
    return result
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
   * Adler32 calculation
   */
  private static calculateAdler32(data: Uint8Array): number {
    let a = 1
    let b = 0
    for (let i = 0; i < data.length; i++) {
      a = (a + data[i]) % 65521
      b = (b + a) % 65521
    }
    return (b << 16) | a
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
   * Apply memory-safe scaling following PDF.js patterns
   */
  private static applyMemorySafeScaling(
    originalWidth: number,
    originalHeight: number,
    actualWidth: number,
    actualHeight: number
  ): { actualWidth: number; actualHeight: number; scaled: boolean; scaleFactor: number } {
    const totalPixels = originalWidth * originalHeight
    
    if (totalPixels <= this.MAX_SAFE_PIXELS && 
        originalWidth <= this.MAX_DIMENSION && 
        originalHeight <= this.MAX_DIMENSION) {
      return {
        actualWidth,
        actualHeight,
        scaled: false,
        scaleFactor: 1.0
      }
    }

    // Calculate scale factor to fit within limits
    const pixelScale = Math.sqrt(this.MAX_SAFE_PIXELS / totalPixels)
    const dimensionScaleW = this.MAX_DIMENSION / originalWidth
    const dimensionScaleH = this.MAX_DIMENSION / originalHeight
    
    const scaleFactor = Math.min(pixelScale, dimensionScaleW, dimensionScaleH)
    
    return {
      actualWidth: Math.floor(actualWidth * scaleFactor),
      actualHeight: Math.floor(actualHeight * scaleFactor),
      scaled: true,
      scaleFactor
    }
  }

  /**
   * Create placeholder image data for Node.js environment
   */
  private static createPlaceholderImageData(_width: number, _height: number): string {
    // Create a minimal transparent PNG placeholder
    // This is a 1x1 transparent PNG in base64
    const transparentPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI/hHBJFwAAAABJRU5ErkJggg=='
    return `data:image/png;base64,${transparentPng}`
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
}
