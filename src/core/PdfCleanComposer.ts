/**
 * PDF Clean Composer
 * 
 * Filters PDF content to include only main content area elements,
 * excluding headers, footers, page numbers, and cleaning up text elements.
 * 
 * Main responsibilities:
 * - Detect content area boundaries for each page
 * - Filter elements within content area
 * - Clean text elements (fix spacing, validate characters)
 * - Remove non-content elements (headers, footers, page numbers)
 * - Validate and clean image elements
 */

import type { PdfPageContent } from '../models/PdfPageContent.js'

// Environment detection
const isNodeJS = typeof process !== 'undefined' && process.versions && process.versions.node

// Helper function to safely import and use Node.js modules
const getNodeModules = () => {
  if (!isNodeJS) {
    return { fs: null, path: null }
  }
  
  try {
    // Use require for synchronous import in Node.js environment
    const fs = eval('require')('fs')
    const path = eval('require')('path')
    return { fs, path }
  } catch (error) {
    console.warn('Failed to import Node.js modules:', error)
    return { fs: null, path: null }
  }
}

export interface PdfCleanComposerOptions {
  /**
   * Margin from top to exclude headers (as percentage of page height)
   * Default: 0.1 (10%)
   */
  topMarginPercent?: number

  /**
   * Margin from bottom to exclude footers (as percentage of page height)
   * Default: 0.1 (10%)
   */
  bottomMarginPercent?: number

  /**
   * Margin from left and right to exclude side elements (as percentage of page width)
   * Default: 0.05 (5%)
   */
  sideMarginPercent?: number

  /**
   * Minimum height for text elements (in points)
   * Elements smaller than this will be filtered out
   * Default: 8
   */
  minTextHeight?: number

  /**
   * Minimum width for text elements (in points)
   * Elements smaller than this will be filtered out
   * Default: 10
   */
  minTextWidth?: number

  /**
   * Maximum allowed spacing between words (as ratio of font size)
   * Text with excessive spacing will be cleaned
   * Default: 3.0
   */
  maxWordSpacingRatio?: number

  /**
   * Remove elements with non-printable or control characters
   * Default: true
   */
  removeControlCharacters?: boolean

  /**
   * Minimum meaningful text length
   * Text shorter than this will be filtered out
   * Default: 3
   */
  minTextLength?: number

  /**
   * Remove isolated single characters or symbols
   * Default: true
   */
  removeIsolatedCharacters?: boolean

  /**
   * Minimum width for image elements (in points/pixels)
   * Images smaller than this will be filtered out as decorative elements
   * Default: 50
   */
  minImageWidth?: number

  /**
   * Minimum height for image elements (in points/pixels)
   * Images smaller than this will be filtered out as decorative elements
   * Default: 50
   */
  minImageHeight?: number

  /**
   * Minimum area for image elements (width × height)
   * Images with smaller area will be filtered out
   * Default: 2500 (50×50)
   */
  minImageArea?: number

  /**
   * Output directory path for cleaning image files
   * If provided, removed image files will be deleted from disk
   */
  outputDir?: string
}

/**
 * Content area boundaries for a page
 */
interface ContentArea {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

/**
 * Element cleaning result
 */
interface CleaningResult {
  kept: any[]
  removed: any[]
  cleaned: any[]
}

export class PdfCleanComposer {
  /**
   * Clean and filter PDF pages to include only main content
   * 
   * @param pages Array of PDF page content to clean
   * @param options Cleaning configuration options
   * @returns Cleaned array of PDF page content
   */
  static cleanPages(pages: PdfPageContent[], options: PdfCleanComposerOptions = {}): PdfPageContent[] {
    const defaultOptions = {
      topMarginPercent: 0.1,
      bottomMarginPercent: 0.1,
      sideMarginPercent: 0.05,
      minTextHeight: 8,
      minTextWidth: 10,
      maxWordSpacingRatio: 3.0,
      removeControlCharacters: true,
      minTextLength: 3,
      removeIsolatedCharacters: true,
      minImageWidth: 50,
      minImageHeight: 50,
      minImageArea: 2500,
      outputDir: undefined
    }

    const finalOptions = { ...defaultOptions, ...options }

    console.log('🧹 Starting PDF content cleaning...')
    console.log('📊 Cleaning options:', finalOptions)

    return pages.map((page, pageIndex) => {
      console.log(`🔍 Cleaning page ${pageIndex + 1} of ${pages.length}`)
      return this.cleanPage(page, finalOptions)
    })
  }

  /**
   * Clean a single PDF page
   */
  private static cleanPage(page: PdfPageContent, options: PdfCleanComposerOptions): PdfPageContent {
    // Calculate content area for this page
    const contentArea = this.calculateContentArea(page, options)
    
    console.log(`📏 Page ${page.pageIndex + 1} content area:`, {
      top: Math.round(contentArea.top),
      bottom: Math.round(contentArea.bottom),
      left: Math.round(contentArea.left),
      right: Math.round(contentArea.right),
      width: Math.round(contentArea.width),
      height: Math.round(contentArea.height)
    })

    // Filter and clean elements
    const cleaningResult = this.cleanElements(page.elements || [], contentArea, options)

    console.log(`📊 Page ${page.pageIndex + 1} cleaning results:`, {
      originalElements: page.elements?.length || 0,
      keptElements: cleaningResult.kept.length,
      removedElements: cleaningResult.removed.length,
      cleanedElements: cleaningResult.cleaned.length
    })

    // Return cleaned page
    return {
      ...page,
      elements: cleaningResult.kept,
      metadata: {
        ...page.metadata,
        cleaning: {
          contentArea,
          originalElementCount: page.elements?.length || 0,
          cleanedElementCount: cleaningResult.kept.length,
          removedElementCount: cleaningResult.removed.length,
          cleanedTextCount: cleaningResult.cleaned.length
        }
      }
    }
  }

  /**
   * Calculate content area boundaries for a page
   */
  private static calculateContentArea(page: PdfPageContent, options: PdfCleanComposerOptions): ContentArea {
    const { width, height } = page
    
    const topMargin = height * (options.topMarginPercent || 0.1)
    const bottomMargin = height * (options.bottomMarginPercent || 0.1)
    const sideMargin = width * (options.sideMarginPercent || 0.05)

    return {
      top: topMargin,
      bottom: height - bottomMargin,
      left: sideMargin,
      right: width - sideMargin,
      width: width - (2 * sideMargin),
      height: height - topMargin - bottomMargin
    }
  }

  /**
   * Clean and filter elements based on content area and quality
   */
  private static cleanElements(
    elements: any[], 
    contentArea: ContentArea, 
    options: PdfCleanComposerOptions
  ): CleaningResult {
    const result: CleaningResult = {
      kept: [],
      removed: [],
      cleaned: []
    }

    for (const element of elements) {
      // Check if element is within content area
      if (!this.isElementInContentArea(element, contentArea)) {
        result.removed.push({
          ...element,
          removalReason: 'outside_content_area'
        })
        
        // Remove associated image file if it exists and outputDir is provided
        if (options.outputDir && this.isImageElement(element)) {
          this.removeImageFile(element, options.outputDir)
        }
        
        continue
      }

      // Clean the element based on its type
      const cleanedElement = this.cleanElement(element, options)
      
      if (cleanedElement === null) {
        result.removed.push({
          ...element,
          removalReason: 'failed_cleaning'
        })
        
        // Remove associated image file if it exists and outputDir is provided
        if (options.outputDir && this.isImageElement(element)) {
          this.removeImageFile(element, options.outputDir)
        }
        
        continue
      }

      // Check if element was modified during cleaning
      if (this.isElementModified(element, cleanedElement)) {
        result.cleaned.push(element)
      }

      result.kept.push(cleanedElement)
    }

    return result
  }

  /**
   * Check if element is within content area boundaries
   */
  private static isElementInContentArea(element: any, contentArea: ContentArea): boolean {
    if (!element.boundingBox) {
      return true // Keep elements without bounding box
    }

    const bbox = this.normalizeBoundingBox(element.boundingBox)
    
    // Element center point
    const centerX = bbox.left + (bbox.width / 2)
    const centerY = bbox.top + (bbox.height / 2)

    // Check if center is within content area
    const withinHorizontal = centerX >= contentArea.left && centerX <= contentArea.right
    const withinVertical = centerY >= contentArea.top && centerY <= contentArea.bottom

    return withinHorizontal && withinVertical
  }

  /**
   * Clean individual element based on its type
   */
  private static cleanElement(element: any, options: PdfCleanComposerOptions): any | null {
    const cleanedElement = { ...element }

    // Clean based on element type
    if (this.isTextElement(element)) {
      return this.cleanTextElement(cleanedElement, options)
    } else if (this.isImageElement(element)) {
      return this.cleanImageElement(cleanedElement, options)
    }

    // For other element types, return as-is
    return cleanedElement
  }

  /**
   * Clean text element content and validate dimensions
   */
  private static cleanTextElement(element: any, options: PdfCleanComposerOptions): any | null {
    if (!element.data || typeof element.data !== 'string') {
      return null
    }

    let cleanedText = element.data

    // Remove control characters if enabled
    if (options.removeControlCharacters) {
      cleanedText = this.removeControlCharacters(cleanedText)
    }

    // Fix excessive spacing
    cleanedText = this.fixTextSpacing(cleanedText, options.maxWordSpacingRatio || 3.0)

    // Check minimum text length
    if (cleanedText.trim().length < (options.minTextLength || 3)) {
      return null
    }

    // Remove isolated characters if enabled
    if (options.removeIsolatedCharacters && this.isIsolatedCharacter(cleanedText)) {
      return null
    }

    // Check element dimensions
    if (!this.validateTextElementDimensions(element, options)) {
      return null
    }

    // Return cleaned element
    return {
      ...element,
      data: cleanedText
    }
  }

  /**
   * Clean image element and validate dimensions
   */
  private static cleanImageElement(element: any, options: PdfCleanComposerOptions): any | null {
    // Basic image validation - can be expanded
    if (!element.data) {
      return null
    }

    // Get image dimensions from bounding box
    const bbox = this.normalizeBoundingBox(element.boundingBox)
    
    // Check minimum width requirement
    if (bbox.width < (options.minImageWidth || 50)) {
      console.log(`🚫 Filtering small image: width ${bbox.width} < ${options.minImageWidth || 50}`)
      return null
    }

    // Check minimum height requirement
    if (bbox.height < (options.minImageHeight || 50)) {
      console.log(`🚫 Filtering small image: height ${bbox.height} < ${options.minImageHeight || 50}`)
      return null
    }

    // Check minimum area requirement (width × height)
    const area = bbox.width * bbox.height
    if (area < (options.minImageArea || 2500)) {
      console.log(`🚫 Filtering small image: area ${Math.round(area)} < ${options.minImageArea || 2500} (${Math.round(bbox.width)}×${Math.round(bbox.height)})`)
      return null
    }

    console.log(`✅ Image passed size validation: ${Math.round(bbox.width)}×${Math.round(bbox.height)} (area: ${Math.round(area)})`)
    return element
  }

  /**
   * Remove control characters and non-printable characters
   */
  private static removeControlCharacters(text: string): string {
    // Remove control characters (ASCII 0-31 except tab, newline, carriage return)
    // and DEL character (ASCII 127)
    // eslint-disable-next-line no-control-regex
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  }

  /**
   * Fix excessive spacing in text
   */
  private static fixTextSpacing(text: string, _maxSpacingRatio: number): string {
    // Replace multiple consecutive spaces with single space
    let cleaned = text.replace(/\s+/g, ' ')
    
    // Remove leading and trailing whitespace
    cleaned = cleaned.trim()

    return cleaned
  }

  /**
   * Check if text is an isolated character or symbol
   */
  private static isIsolatedCharacter(text: string): boolean {
    const trimmed = text.trim()
    
    // Single character
    if (trimmed.length === 1) {
      return true
    }

    // Multiple single characters separated by spaces
    if (/^[\s\w\p{P}](\s+[\s\w\p{P}])*$/u.test(trimmed) && trimmed.length <= 20) {
      return true
    }

    return false
  }

  /**
   * Validate text element dimensions
   */
  private static validateTextElementDimensions(element: any, options: PdfCleanComposerOptions): boolean {
    if (!element.boundingBox) {
      return true // Keep elements without bounding box
    }

    const bbox = this.normalizeBoundingBox(element.boundingBox)
    
    return bbox.width >= (options.minTextWidth || 10) && bbox.height >= (options.minTextHeight || 8)
  }

  /**
   * Check if element is a text element
   */
  private static isTextElement(element: any): boolean {
    return element.type === 'paragraph' || 
           element.type === 'heading' || 
           element.type === 'text' ||
           (element.type && element.type.startsWith('h')) // h1, h2, etc.
  }

  /**
   * Check if element is an image element
   */
  private static isImageElement(element: any): boolean {
    return element.type === 'image'
  }

  /**
   * Normalize bounding box to consistent format
   */
  private static normalizeBoundingBox(boundingBox: any): { top: number, left: number, width: number, height: number } {
    if (Array.isArray(boundingBox)) {
      // Format: [left, top, width, height] or [top, left, width, height]
      const [a, b, width, height] = boundingBox
      
      // Determine if it's [left, top, width, height] or [top, left, width, height]
      // Usually PDF coordinates have origin at bottom-left, so larger values are typically top
      return {
        left: Math.min(a, b),
        top: Math.max(a, b),
        width: width || 0,
        height: height || 0
      }
    } else if (typeof boundingBox === 'object') {
      // Object format: {top, left, width, height} or {x, y, width, height}
      return {
        top: boundingBox.top || boundingBox.y || 0,
        left: boundingBox.left || boundingBox.x || 0,
        width: boundingBox.width || 0,
        height: boundingBox.height || 0
      }
    }

    // Fallback
    return { top: 0, left: 0, width: 0, height: 0 }
  }

  /**
   * Check if element was modified during cleaning
   */
  private static isElementModified(original: any, cleaned: any): boolean {
    return original.data !== cleaned.data
  }

  /**
   * Remove image file from output directory when element is filtered out
   * Only works in Node.js environment - gracefully degrades in browser
   */
  private static removeImageFile(element: any, outputDir: string): void {
    // Early return if not in Node.js environment
    if (!isNodeJS) {
      console.log('🌐 Browser environment detected - skipping file removal (files are in memory)')
      return
    }

    const { fs, path } = getNodeModules()
    
    // Early return if Node.js modules are not available
    if (!fs || !path) {
      console.warn('⚠️  Node.js filesystem modules not available - skipping file removal')
      return
    }

    try {
      // Extract image filename or path from element data
      let imagePath: string | null = null

      if (element.data && typeof element.data === 'string') {
        // Check if data contains a file path or filename
        if (element.data.includes('.png') || element.data.includes('.jpg') || element.data.includes('.jpeg')) {
          // Extract filename from path or use as-is if it's just a filename
          const filename = element.data.split('/').pop() || element.data
          imagePath = path.join(outputDir, filename)
        }
      }

      // Also check if element has a filename attribute
      if (!imagePath && element.filename) {
        imagePath = path.join(outputDir, element.filename)
      }

      // Also check if element has an id that corresponds to a file
      if (!imagePath && element.id) {
        // Try common image extensions
        const extensions = ['.png', '.jpg', '.jpeg']
        for (const ext of extensions) {
          const testPath = path.join(outputDir, `${element.id}${ext}`)
          if (fs.existsSync(testPath)) {
            imagePath = testPath
            break
          }
        }
      }

      if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath)
        console.log(`🗑️  Removed filtered image file: ${imagePath}`)
      }
    } catch (error) {
      console.warn('⚠️  Failed to remove image file for element:', error)
    }
  }
}
