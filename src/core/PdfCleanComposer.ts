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

import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'
import type { PdfDocument } from './PdfDocument.js'
import type { PdfPageRenderer } from '../types/renderer.types.js'
import { computeImageDistribution, isImageElement, isTextElement, normalizeBoundingBox } from './heuristics/elementUtils.js'
import { DEFAULT_SCREENSHOT_THRESHOLDS, decideScreenshot, type ScreenshotThresholds } from './heuristics/screenshotHeuristics.js'
import { spreadCropHalf, type SpreadSourceInfo } from './spread/types.js'
import { logger } from '../utils/Logger.js'

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
    logger.warn('Failed to import Node.js modules:', error)
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

  /**
   * Pluggable page renderer. When set (e.g. PuppeteerRenderer), cleanComposer
   * rasterizes cover/page screenshots through it (Chromium) instead of
   * node-canvas. When null/undefined, the node-canvas PageRenderer path is used.
   * Mirrors how PdfDecomposer.screenshot() picks its rasterization path.
   */
  renderer?: PdfPageRenderer | null

  /**
   * Target width (px) for the page/cover screenshot when rendering via `renderer`.
   * Default: 1024. Ignored by the node-canvas fallback (which uses scale 1.0).
   */
  coverPageScreenshotWidth?: number

  /**
   * Hero-image coverage (0-1) that flags a full-page advertisement even when the
   * page also carries scattered promo text. Default: 0.55.
   */
  heroImageCoverageThreshold?: number

  /**
   * Longest continuous text block (chars) that marks a page as real editorial
   * content and prevents screenshot conversion. Default: 300.
   */
  significantTextBlockThreshold?: number

  /**
   * Maximum total text (chars) for a hero-image ad. Above this the page is
   * treated as content. Default: 600.
   */
  adMaxTextChars?: number
  /**
   * Minimum distinct text elements for the editorial-guard exemption on a
   * hero-image ad (scattered ad copy: headline, body, CTA, legal, URL).
   * Below this a long text block keeps the page decomposed. Default: 5.
   */
  adMinTextFragments?: number
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
  kept: PdfElement[]
  removed: PdfElement[]
  cleaned: PdfElement[]
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
      maxScreenshotsPerDocument: 10,
      outputDir: undefined
    }

    const finalOptions = { ...defaultOptions, ...options }

    // Process pages SEQUENTIALLY to avoid memory explosion from parallel screenshot generation
    // Limit screenshot conversions to bound memory on large PDFs (configurable:
    // ad-heavy magazines need more than the default, see maxScreenshotsPerDocument)
    const maxScreenshots = finalOptions.maxScreenshotsPerDocument
    let screenshotCount = 0
    
    const processedPages: PdfPageContent[] = []
    
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]
      
      // Check for cover page detection on first page
      if (i === 0 && finalOptions.coverPageDetection && pdfDocument) {
        const coverPageResult = await this.detectAndProcessCoverPage(page, pdfDocument, finalOptions)
        if (coverPageResult) {
          processedPages.push(coverPageResult)
          if (coverPageResult.metadata?.convertedToScreenshot) {
            screenshotCount++
          }
          continue
        }
      }
      
      // Process page with screenshot limit check
      const processedPage = await this.cleanPage(page, finalOptions, pdfDocument, screenshotCount >= maxScreenshots)
      
      // Count if this page was converted to screenshot
      if (processedPage.metadata?.convertedToScreenshot) {
        screenshotCount++
      }
      
      processedPages.push(processedPage)
    }
    
    return processedPages
  }

  /**
   * Clean a single PDF page
   * @param skipScreenshot If true, skip screenshot conversion (used when limit reached)
   */
  private static async cleanPage(
    page: PdfPageContent, 
    options: PdfCleanComposerOptions,
    pdfDocument?: PdfDocument,
    skipScreenshot = false
  ): Promise<PdfPageContent> {
    // Calculate content area for this page
    const contentArea = this.calculateContentArea(page, options)

    // Filter and clean elements
    const cleaningResult = this.cleanElements(page.elements || [], contentArea, options)

    // Check if page should be converted to screenshot (large image detection for any page)
    // Skip screenshot conversion if limit reached
    if (pdfDocument && cleaningResult.kept.length > 0 && !skipScreenshot) {
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

    // Preserve the text removed from the TOP margin band (running heads /
    // section kickers like "BUSINESS stable fly"): PdfPageComposer uses it as
    // continuity evidence binding consecutive pages of the same article.
    const runningHeadText = this.extractRunningHeadText(cleaningResult.removed, contentArea)

    // Return normally cleaned page
    return {
      ...page,
      elements: cleaningResult.kept,
      metadata: {
        ...page.metadata,
        ...(runningHeadText ? { runningHeadText } : {}),
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
   * Join the text of elements the margin filter removed from the top band.
   * These are the page's running heads / kickers: furniture for the OUTPUT,
   * but the strongest available continuity signal between pages.
   */
  private static extractRunningHeadText(removed: PdfElement[], contentArea: ContentArea): string {
    const parts: string[] = []
    for (const element of removed) {
      if (isImageElement(element)) continue
      if (element.removalReason !== 'outside_content_area') continue
      const bbox = normalizeBoundingBox(element.boundingBox)
      const centerY = bbox.top + bbox.height / 2
      if (centerY < contentArea.top) {
        const text = String(element.data || '').replace(/<[^>]*>/g, ' ').trim()
        if (text) parts.push(text)
      }
    }
    return parts.join(' ').trim()
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
    elements: PdfElement[],
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
        if (options.outputDir && isImageElement(element)) {
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
        if (options.outputDir && isImageElement(element)) {
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
  private static isElementInContentArea(element: PdfElement, contentArea: ContentArea): boolean {
    if (!element.boundingBox) {
      return true // Keep elements without bounding box
    }

    const bbox = normalizeBoundingBox(element.boundingBox)

    // For large elements (images that might be full-page or covers), be more lenient
    const elementArea = bbox.width * bbox.height
    const contentAreaSize = contentArea.width * contentArea.height
    const largeElementThreshold = 0.3 // 30% of content area
    const isLargeElement = elementArea > (contentAreaSize * largeElementThreshold)

    // Images of ANY size get the overlap test too. The margin filter exists to
    // strip page furniture, and furniture in margin bands is text (page
    // numbers, running heads), not images: a small content image sitting near
    // the edge (e.g. a QR code in a bottom corner) failed the center test at
    // wider margins and was silently dropped, while an image with no overlap
    // at all (fully inside the band) is still removed as decoration.
    if (isLargeElement || isImageElement(element)) {
      // Check if ANY part overlaps with content area (not just center)
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
  private static cleanElement(element: PdfElement, options: PdfCleanComposerOptions): PdfElement | null {
    const cleanedElement = { ...element }

    // Clean based on element type
    if (isTextElement(element)) {
      return this.cleanTextElement(cleanedElement, options)
    } else if (isImageElement(element)) {
      return this.cleanImageElement(cleanedElement, options)
    }

    // For other element types, return as-is
    return cleanedElement
  }

  /**
   * Clean text element content and validate dimensions
   */
  private static cleanTextElement(element: PdfElement, options: PdfCleanComposerOptions): PdfElement | null {
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
  private static cleanImageElement(element: PdfElement, options: PdfCleanComposerOptions): PdfElement | null {
    // Basic image validation - can be expanded
    if (!element.data) {
      return null
    }

    // Get image dimensions from bounding box
    const bbox = normalizeBoundingBox(element.boundingBox)
    
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
  private static validateTextElementDimensions(element: PdfElement, options: PdfCleanComposerOptions): boolean {
    if (!element.boundingBox) {
      return true // Keep elements without bounding box
    }

    const bbox = normalizeBoundingBox(element.boundingBox)
    
    return bbox.width >= (options.minTextWidth || 10) && bbox.height >= (options.minTextHeight || 8)
  }

  // normalizeBoundingBox / isImageElement / isTextElement now live in
  // ./heuristics/elementUtils (single source of truth, shared with the pure
  // screenshot + continuity heuristics).

  /**
   * Check if element was modified during cleaning
   */
  private static isElementModified(original: PdfElement, cleaned: PdfElement): boolean {
    return original.data !== cleaned.data
  }

  /**
   * Remove image file from output directory when element is filtered out
   * Only works in Node.js environment - gracefully degrades in browser
   */
  private static removeImageFile(element: PdfElement, outputDir: string): void {
    // Early return if not in Node.js environment
    if (!isNodeJS) {
      return
    }

    const { fs, path } = getNodeModules()
    
    // Early return if Node.js modules are not available
    if (!fs || !path) {
      logger.warn('⚠️  Node.js filesystem modules not available - skipping file removal')
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
      logger.warn('⚠️  Failed to remove image file for element:', error)
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
      const imageElements = (page.elements || []).filter(element => isImageElement(element))
      
      if (imageElements.length === 0) {
        return null
      }
      
      // Method 1: Check individual large images (original logic)
      for (const imageElement of imageElements) {
        const bbox = normalizeBoundingBox(imageElement.boundingBox)
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
        const bbox = normalizeBoundingBox(element.boundingBox)
        return total + (bbox.width * bbox.height)
      }, 0)
      
      const aggregateCoverageRatio = totalImageArea / pageArea
      
      // Also check if images are distributed across the page (not just clustered in one corner)
      const imageDistribution = computeImageDistribution(imageElements, page.width, page.height)
      
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
      logger.warn(`⚠️  Cover page detection failed for page ${page.pageIndex + 1}:`, error)
      return null
    }
  }

  /**
   * Determine if a page should be converted to a single full-page screenshot.
   * Thin wrapper over the pure decideScreenshot heuristic (see
   * ./heuristics/screenshotHeuristics). Async only to preserve the existing
   * call-site contract; the decision itself is synchronous.
   */
  private static async shouldConvertToScreenshot(
    page: PdfPageContent,
    cleanedElements: PdfElement[],
    options: PdfCleanComposerOptions
  ): Promise<{ convert: boolean, reason: string }> {
    const thresholds: ScreenshotThresholds = {
      coverPageThreshold: options.coverPageThreshold ?? DEFAULT_SCREENSHOT_THRESHOLDS.coverPageThreshold,
      heroImageCoverageThreshold: options.heroImageCoverageThreshold ?? DEFAULT_SCREENSHOT_THRESHOLDS.heroImageCoverageThreshold,
      significantTextBlockThreshold: options.significantTextBlockThreshold ?? DEFAULT_SCREENSHOT_THRESHOLDS.significantTextBlockThreshold,
      adMaxTextChars: options.adMaxTextChars ?? DEFAULT_SCREENSHOT_THRESHOLDS.adMaxTextChars,
      adMinTextFragments: options.adMinTextFragments ?? DEFAULT_SCREENSHOT_THRESHOLDS.adMinTextFragments
    }
    return decideScreenshot(
      { pageWidth: page.width, pageHeight: page.height, elements: cleanedElements },
      thresholds
    )
  }

  /**
   * Generate screenshot for cover page
   * Note: Uses scale 1.0 for memory efficiency on large documents
   */
  private static async generatePageScreenshot(
    page: PdfPageContent, 
    pdfDocument: PdfDocument, 
    options: PdfCleanComposerOptions
  ): Promise<any | null> {
    try {
      const rawQuality = options.coverPageScreenshotQuality ?? 85

      // Spread-split logical pages carry a LOGICAL pageIndex; the physical
      // PDF page must be resolved through metadata.spread. Half pages are
      // rendered from the full physical page and cropped afterwards.
      const spread = page.metadata?.spread as SpreadSourceInfo | undefined
      const physicalPageNumber = spread?.sourcePageNumber ?? page.pageIndex + 1
      const cropHalf = spreadCropHalf(spread)

      let screenshotResult: { width: number; height: number; base64: string }

      if (options.renderer) {
        // Renderer present (e.g. PuppeteerRenderer): rasterize the page inside the
        // renderer (Chromium) instead of node-canvas. Same contract screenshot()
        // uses. This keeps cleanComposer consistent with the configured renderer
        // and avoids the node-canvas Context2d::GetImageData OOM that fires when
        // pdf.js decodes very large (e.g. CMYK) embedded images onto node-canvas.
        // renderPage normalizes its own page state, so the Node-side pdf.js page
        // is intentionally NOT materialized on this path.
        const quality = rawQuality > 1 ? rawQuality / 100 : rawQuality
        const targetWidth = options.coverPageScreenshotWidth ?? 1024
        screenshotResult = await options.renderer.renderPage(physicalPageNumber, {
          // When a half is cropped afterwards, render the physical page at
          // double width so the half comes out at the requested width.
          width: cropHalf ? targetWidth * 2 : targetWidth,
          quality
        })
      } else {
        // No renderer: default node-canvas path (unchanged behaviour).
        // Get PDF page
        const pdfPage = await pdfDocument.getPage(physicalPageNumber)

        // Import PageRenderer dynamically for universal screenshot support
        const { PageRenderer } = await import('../utils/PageRenderer.js')

        // Use scale 1.0 for memory efficiency on large documents.
        // Higher scales cause OOM on PDFs with many pages.
        screenshotResult = await PageRenderer.renderPageToBase64(pdfPage.rawProxy, pdfDocument.rawProxy, {
          quality: rawQuality,
          scale: 1.0
        })
      }

      if (cropHalf) {
        const { cropImageHalf } = await import('../utils/ImageCrop.js')
        screenshotResult = await cropImageHalf(screenshotResult.base64, cropHalf)
      }

      // Infer extension from the returned data URL. PageRenderer returns
      // JPEG in Node mode (since v1.0.6) and PNG in browser; the previous
      // hard-coded `.png` filename + `^data:image/png;base64,` strip
      // produced corrupted files when the actual payload was JPEG (the
      // unstripped `data:image/jpeg;base64,` prefix got decoded as bytes).
      const dataUrl = screenshotResult.base64
      const isJpeg = /^data:image\/jpe?g;base64,/i.test(dataUrl)
      const extension = isJpeg ? 'jpg' : 'png'

      // Generate filename pattern - use "cover" for page 0, "page" for others
      const screenshotFilename = page.pageIndex === 0
        ? `cover_screenshot_p${page.pageIndex}_1.${extension}`
        : `page_screenshot_p${page.pageIndex}_1.${extension}`

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

          // Split on the data-URL comma to strip ANY image MIME prefix,
          // not just PNG. Falls back to the whole string if no comma is
          // present (defensive).
          const commaIndex = dataUrl.indexOf(',')
          const base64Data = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl
          const buffer = Buffer.from(base64Data, 'base64')
          const filePath = path.join(options.outputDir, screenshotFilename)

          fs.writeFileSync(filePath, buffer)

          // Return filename like other image elements
          screenshotData = screenshotFilename
        } catch (fileError) {
          logger.warn('⚠️ Failed to save cover screenshot file, using base64:', fileError)
          screenshotData = dataUrl
        }
      } else {
        // Use base64 data URL when no outputDir specified
        screenshotData = dataUrl
      }
      
      // Create screenshot element with consistent structure
      const screenshotElement = {
        type: 'image',
        // Member attribution must survive page composition (consumers group
        // elements by pageIndex to police screenshot usage per member).
        pageIndex: page.pageIndex,
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
          scale: 1.0,
          quality: options.coverPageScreenshotQuality || 85,
          isCoverPage: page.pageIndex === 0
        }
      }
      
      return screenshotElement
    } catch (error) {
      logger.error(`❌ Failed to generate cover page screenshot for page ${page.pageIndex + 1}:`, error)
      return null
    }
  }
}
