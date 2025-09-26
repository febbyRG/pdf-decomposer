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
import type { PdfDocument } from './PdfDocument.js'

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
   * Enable cover page detection and screenshot generation
   * If the first page is detected as a cover (full-page image), generate a screenshot instead
   * Default: true
   */
  coverPageDetection?: boolean

  /**
   * Cover page threshold (percentage of page area that an image must cover)
   * Used to determine if a page is a cover page
   * Default: 0.8 (80% of page area)
   */
  coverPageThreshold?: number

  /**
   * Screenshot quality for cover pages (1-100)
   * Default: 95
   */
  coverPageScreenshotQuality?: number

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
   * @param pdfDocument Optional PDF document for cover page detection and screenshot
   * @returns Cleaned array of PDF page content
   */
  static async cleanPages(
    pages: PdfPageContent[], 
    options: PdfCleanComposerOptions = {},
    pdfDocument?: PdfDocument
  ): Promise<PdfPageContent[]> {
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
      coverPageDetection: true,
      coverPageThreshold: 0.8,
      coverPageScreenshotQuality: 95,
      outputDir: undefined
    }

    const finalOptions = { ...defaultOptions, ...options }

    // Check for cover page detection if enabled and pdfDocument is provided
    if (finalOptions.coverPageDetection && pdfDocument && pages.length > 0) {
      const coverPageResult = await this.detectAndProcessCoverPage(pages[0], pdfDocument, finalOptions)
      if (coverPageResult) {
        pages[0] = coverPageResult
        // Skip normal processing for cover page, but continue with rest
        const restPages = pages.slice(1)
        const processedRestPages = await Promise.all(
          restPages.map((page, _index) => this.cleanPage(page, finalOptions, pdfDocument))
        )
        return [coverPageResult, ...processedRestPages]
      }
    }

    // Process all pages with async cleanPage method
    const processedPages = await Promise.all(
      pages.map((page, _) => this.cleanPage(page, finalOptions, pdfDocument))
    )
    return processedPages
  }

  /**
   * Clean a single PDF page
   */
  private static async cleanPage(
    page: PdfPageContent, 
    options: PdfCleanComposerOptions,
    pdfDocument?: PdfDocument
  ): Promise<PdfPageContent> {
    // Calculate content area for this page
    const contentArea = this.calculateContentArea(page, options)

    // Filter and clean elements
    const cleaningResult = this.cleanElements(page.elements || [], contentArea, options)

    // Check if page should be converted to screenshot (large image detection for any page)
    if (pdfDocument && cleaningResult.kept.length > 0) {
      const shouldScreenshot = await this.shouldConvertToScreenshot(page, cleaningResult.kept, options)
      
      if (shouldScreenshot.convert) {
        const screenshot = await this.generatePageScreenshot(page, pdfDocument, options)
        if (screenshot) {
          return {
            ...page,
            elements: [screenshot],
            metadata: {
              ...page.metadata,
              convertedToScreenshot: true,
              conversionReason: shouldScreenshot.reason,
              originalElementCount: page.elements?.length || 0,
              processedAsScreenshot: true,
              cleaning: {
                contentArea,
                originalElementCount: page.elements?.length || 0,
                cleanedElementCount: 1, // Screenshot counts as 1 element
                removedElementCount: (page.elements?.length || 0) - 1,
                cleanedTextCount: cleaningResult.cleaned.length
              }
            }
          }
        }
      }
    }

    // Return normally cleaned page
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
    
    // For large elements (images that might be full-page or covers), be more lenient
    const elementArea = bbox.width * bbox.height
    const contentAreaSize = contentArea.width * contentArea.height
    const largeElementThreshold = 0.3 // 30% of content area
    const isLargeElement = elementArea > (contentAreaSize * largeElementThreshold)
    
    if (isLargeElement) {
      // For large elements, check if ANY part overlaps with content area (not just center)
      const overlapHorizontal = bbox.left < contentArea.right && (bbox.left + bbox.width) > contentArea.left
      const overlapVertical = bbox.top < contentArea.bottom && (bbox.top + bbox.height) > contentArea.top
      return overlapHorizontal && overlapVertical
    }
    
    // For smaller elements, use center point detection (original logic)
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
      return null
    }

    // Check minimum height requirement
    if (bbox.height < (options.minImageHeight || 50)) {
      return null
    }

    // Check minimum area requirement (width × height)
    const area = bbox.width * bbox.height
    if (area < (options.minImageArea || 2500)) {
      return null
    }

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
      }
    } catch (error) {
      console.warn('⚠️  Failed to remove image file for element:', error)
    }
  }

  /**
   * Detect if the page is a cover page and process it as screenshot
   * Cover page is detected by having a large image that covers most of the page area
   * OR multiple images that collectively cover most of the page (for tiled cover pages)
   */
  private static async detectAndProcessCoverPage(
    page: PdfPageContent, 
    pdfDocument: PdfDocument, 
    options: PdfCleanComposerOptions
  ): Promise<PdfPageContent | null> {
    try {
      const pageArea = page.width * page.height
      const threshold = options.coverPageThreshold || 0.8
      
      // Check if page has large images that might indicate a cover
      const imageElements = (page.elements || []).filter(element => this.isImageElement(element))
      
      if (imageElements.length === 0) {
        return null
      }
      
      // Method 1: Check individual large images (original logic)
      for (const imageElement of imageElements) {
        const bbox = this.normalizeBoundingBox(imageElement.boundingBox)
        const imageArea = bbox.width * bbox.height
        const coverageRatio = imageArea / pageArea
        
        if (coverageRatio >= threshold) {
          // Generate screenshot for cover page
          const screenshot = await this.generatePageScreenshot(page, pdfDocument, options)
          if (screenshot) {
            return {
              ...page,
              elements: [screenshot],
              metadata: {
                ...page.metadata,
                coverPage: true,
                coverageRatio,
                originalElementCount: page.elements?.length || 0,
                processedAsScreenshot: true,
                detectionMethod: 'single-large-image'
              }
            }
          }
        }
      }
      
      // Method 2: Check aggregate coverage for tiled images (NEW LOGIC)
      const totalImageArea = imageElements.reduce((total, element) => {
        const bbox = this.normalizeBoundingBox(element.boundingBox)
        return total + (bbox.width * bbox.height)
      }, 0)
      
      const aggregateCoverageRatio = totalImageArea / pageArea
      
      // Also check if images are distributed across the page (not just clustered in one corner)
      const imageDistribution = this.calculateImageDistribution(imageElements, page.width, page.height)
      
      // Cover page criteria for tiled images:
      // 1. Total image coverage >= threshold
      // 2. Images are well distributed (not clustered in small area)
      // 3. Minimum number of images (to avoid false positives)
      const minImageCount = 3
      const minDistributionScore = 0.4 // Images should cover at least 40% of page width/height ranges
      
      if (aggregateCoverageRatio >= threshold && 
          imageElements.length >= minImageCount && 
          imageDistribution.distributionScore >= minDistributionScore) {
        
        // Generate screenshot for tiled cover page
        const screenshot = await this.generatePageScreenshot(page, pdfDocument, options)
        if (screenshot) {
          return {
            ...page,
            elements: [screenshot],
            metadata: {
              ...page.metadata,
              coverPage: true,
              coverageRatio: aggregateCoverageRatio,
              imageCount: imageElements.length,
              distributionScore: imageDistribution.distributionScore,
              originalElementCount: page.elements?.length || 0,
              processedAsScreenshot: true,
              detectionMethod: 'tiled-images'
            }
          }
        }
      }
      
      return null
    } catch (error) {
      console.warn(`⚠️  Cover page detection failed for page ${page.pageIndex + 1}:`, error)
      return null
    }
  }

  /**
   * Determine if a page should be converted to screenshot based on its content
   */
  private static async shouldConvertToScreenshot(
    page: PdfPageContent, 
    cleanedElements: any[], 
    options: PdfCleanComposerOptions
  ): Promise<{ convert: boolean, reason: string }> {
    if (cleanedElements.length === 0) {
      return { convert: false, reason: 'no-elements' }
    }
    
    const pageArea = page.width * page.height
    const threshold = options.coverPageThreshold || 0.8
    
    // Check if page has image elements
    const imageElements = cleanedElements.filter(element => this.isImageElement(element))
    
    if (imageElements.length === 0) {
      return { convert: false, reason: 'no-images' }
    }
    
    // Check for significant text content that should be preserved
    const textElements = cleanedElements.filter(element => this.isTextElement(element))
    const totalTextLength = textElements.reduce((total, element) => {
      return total + (element.data?.length || 0)
    }, 0)
    
    // Don't convert to screenshot if there's substantial text content
    const significantTextThreshold = 200 // 200 characters minimum
    if (totalTextLength >= significantTextThreshold) {
      return { 
        convert: false, 
        reason: `significant-text-content (${totalTextLength} characters)` 
      }
    }
    
    // Method 1: Single large image covering most of the page
    for (const imageElement of imageElements) {
      const bbox = this.normalizeBoundingBox(imageElement.boundingBox)
      const imageArea = bbox.width * bbox.height
      const coverageRatio = imageArea / pageArea
      
      if (coverageRatio >= threshold) {
        return { 
          convert: true, 
          reason: `single-large-image (${(coverageRatio * 100).toFixed(1)}% coverage)` 
        }
      }
    }
    
    // Method 2: Multiple images with high aggregate coverage (for tiled pages)
    // Early return if insufficient image count for tiled detection
    const minImageCount = 3
    if (imageElements.length < minImageCount) {
      return { convert: false, reason: 'insufficient-image-count' }
    }
    
    const totalImageArea = imageElements.reduce((total, element) => {
      const bbox = this.normalizeBoundingBox(element.boundingBox)
      return total + (bbox.width * bbox.height)
    }, 0)
    
    const aggregateCoverageRatio = totalImageArea / pageArea
    
    // Early return if coverage is insufficient
    if (aggregateCoverageRatio < threshold) {
      return { convert: false, reason: 'insufficient-aggregate-coverage' }
    }
    
    // Check distribution for tiled images
    const imageDistribution = this.calculateImageDistribution(imageElements, page.width, page.height)
    const minDistributionScore = 0.4
    
    if (imageDistribution.distributionScore >= minDistributionScore) {
      
      return { 
        convert: true, 
        reason: `tiled-images (${imageElements.length} images, ${(aggregateCoverageRatio * 100).toFixed(1)}% coverage)` 
      }
    }
    
    return { convert: false, reason: 'insufficient-coverage' }
  }

  /**
   * Calculate how well images are distributed across the page
   * Returns distribution score (0-1) indicating coverage of page dimensions
   */
  private static calculateImageDistribution(
    imageElements: any[], 
    pageWidth: number, 
    pageHeight: number
  ): { distributionScore: number, widthCoverage: number, heightCoverage: number } {
    if (imageElements.length === 0) {
      return { distributionScore: 0, widthCoverage: 0, heightCoverage: 0 }
    }
    
    // Find the bounding box that encompasses all images
    let minX = pageWidth
    let maxX = 0
    let minY = pageHeight  
    let maxY = 0
    
    for (const element of imageElements) {
      const bbox = this.normalizeBoundingBox(element.boundingBox)
      
      minX = Math.min(minX, bbox.left)
      maxX = Math.max(maxX, bbox.left + bbox.width)
      minY = Math.min(minY, bbox.top)
      maxY = Math.max(maxY, bbox.top + bbox.height)
    }
    
    // Calculate coverage of page dimensions
    const widthCoverage = Math.max(0, (maxX - minX)) / pageWidth
    const heightCoverage = Math.max(0, (maxY - minY)) / pageHeight
    
    // Distribution score is the minimum of width and height coverage
    // This ensures images are distributed in BOTH dimensions
    const distributionScore = Math.min(widthCoverage, heightCoverage)
    
    return {
      distributionScore,
      widthCoverage,
      heightCoverage
    }
  }

  /**
   * Generate screenshot for cover page
   */
  private static async generatePageScreenshot(
    page: PdfPageContent, 
    pdfDocument: PdfDocument, 
    options: PdfCleanComposerOptions
  ): Promise<any | null> {
    try {
      // Get PDF page
      const pdfPage = await pdfDocument.getPage(page.pageIndex + 1)
      
      // Import PageRenderer dynamically for universal screenshot support
      const { PageRenderer } = await import('../utils/PageRenderer.js')
      
      // Generate screenshot with high quality using raw PDF.js objects
      const screenshotResult = await PageRenderer.renderPageToBase64(pdfPage.rawProxy, pdfDocument.rawProxy, {
        quality: options.coverPageScreenshotQuality || 95,
        scale: 2.0 // High quality screenshot with proper scaling
      })
      
      // Generate filename pattern - use "cover" for page 0, "page" for others
      const screenshotFilename = page.pageIndex === 0 
        ? `cover_screenshot_p${page.pageIndex}_1.png`
        : `page_screenshot_p${page.pageIndex}_1.png`
      
      // Handle output data like other image elements
      let screenshotData: string
      if (options.outputDir) {
        try {
          // Save screenshot to file and return filename (consistent with image pattern)
          const fs = await import('fs')
          const path = await import('path')
          
          // Ensure output directory exists
          if (!fs.existsSync(options.outputDir)) {
            fs.mkdirSync(options.outputDir, { recursive: true })
          }
          
          // Convert base64 to buffer and save
          const base64Data = screenshotResult.base64.replace(/^data:image\/png;base64,/, '')
          const buffer = Buffer.from(base64Data, 'base64')
          const filePath = path.join(options.outputDir, screenshotFilename)
          
          fs.writeFileSync(filePath, buffer)
          
          // Return filename like other image elements
          screenshotData = screenshotFilename
        } catch (fileError) {
          console.warn('⚠️ Failed to save cover screenshot file, using base64:', fileError)
          screenshotData = screenshotResult.base64
        }
      } else {
        // Use base64 data URL when no outputDir specified
        screenshotData = screenshotResult.base64
      }
      
      // Create screenshot element with consistent structure
      const screenshotElement = {
        type: 'image',
        id: page.pageIndex === 0 
          ? `cover_screenshot_p${page.pageIndex}_1`
          : `page_screenshot_p${page.pageIndex}_1`,
        data: screenshotData,
        boundingBox: [0, 0, page.width, page.height],
        width: screenshotResult.width,
        height: screenshotResult.height,
        attributes: {
          type: page.pageIndex === 0 ? 'cover-screenshot' : 'page-screenshot',
          extraction: page.pageIndex === 0 ? 'cover-page-detection' : 'large-image-detection',
          originalPageWidth: page.width,
          originalPageHeight: page.height,
          scale: 2.0,
          quality: options.coverPageScreenshotQuality || 95,
          isCoverPage: page.pageIndex === 0
        }
      }
      
      return screenshotElement
    } catch (error) {
      console.error(`❌ Failed to generate cover page screenshot for page ${page.pageIndex + 1}:`, error)
      return null
    }
  }
}
