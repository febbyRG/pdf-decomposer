/**
 * Comprehensive types for PDF Decomposer system
 * Used across all components to ensure type safety and consistency
 */

import type { PdfDocument } from '../core/PdfDocument.js'

// =============================================================================
// PDF.js INTERFACES (for type safety)
// =============================================================================

/**
 * PDF.js page object interface
 */
export interface PdfJsPage {
  getViewport(params: { scale: number }): PdfJsViewport
  getTextContent(): Promise<PdfJsTextContent>
  extractText(): Promise<PdfJsColorAwareElement[]>
  getAnnotations(): Promise<PdfJsAnnotation[]>
  extractImages(): Promise<PdfJsImageItem[]>
}

/**
 * PDF.js viewport interface
 */
export interface PdfJsViewport {
  width: number
  height: number
  convertToViewportRectangle(rect: number[]): number[]
}

/**
 * PDF.js text content interface
 */
export interface PdfJsTextContent {
  items: PdfJsTextItem[]
}

/**
 * PDF.js text item interface
 */
export interface PdfJsTextItem {
  str: string
  fontName: string
  transform: number[]
  width: number
  height?: number
}

/**
 * PDF.js color-aware element from PdfTextEvaluator
 */
export interface PdfJsColorAwareElement {
  text?: string
  textColor?: string
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  fontSize?: number
  boundingBox?: PdfDecomposerBoundingBox
}

/**
 * PDF.js annotation interface
 */
export interface PdfJsAnnotation {
  subtype: string
  url?: string
  dest?: any
  rect: number[]
  id: string
  contents?: string
}

/**
 * PDF.js image item interface
 */
export interface PdfJsImageItem {
  boundingBox: PdfDecomposerBoundingBox
  data: Buffer | Uint8Array
  objectId: string
  contentType: string
}

// =============================================================================
// CORE INTERFACES
// =============================================================================

/**
 * Simplified interface for PDF decomposer page processing
 * Used by PdfDecomposerPage for basic document access
 */
export interface PdfDecomposerPageData {
  pdfDoc: PdfDocument
  pkg: {
    pkgDir?: PdfDecomposerDirectory
    pages: any[]
  }
}

/**
 * Package interface for decomposer output
 * Represents the container for all decomposed content and metadata
 */
export interface PdfDecomposerPackage {
  fingerprint?: string
  pages: any[]
  thumbnail?: any
  state?: PdfDecomposerState // Missing feature: state property in package
  pkgDir?: PdfDecomposerDirectory
  dir?: string // Missing feature: directory path property
}

/**
 * Package directory interface
 * Handles file system operations for output
 */
export interface PdfDecomposerDirectory {
  dir?: string
  create(): Promise<void>
  exists?(): Promise<boolean>
}

/**
 * Progress state interface
 * Used for tracking decomposition progress and status
 */
export interface PdfDecomposerState {
  progress: number
  message: string
  processing: boolean
}

/**
 * Decompose error interface
 * Used for error reporting during page processing
 */
export interface PdfDecomposerError {
  message: string
  pageIndex: number
}

// =============================================================================
// OPTIONS INTERFACES
// =============================================================================

/**
 * Options for PDF decomposition
 * Controls various aspects of the decomposition process
 */
export interface PdfDecomposerOptions {
  startPage?: number
  endPage?: number
  outputDir?: string
  elementComposer?: boolean
  pageComposer?: boolean
  extractImages?: boolean
  extractLinks?: boolean // When true, extract links and annotations from PDF content
  minify?: boolean // When true, use compact bounding box format [x, y, width, height]
  cleanComposer?: boolean // When true, clean content to include only main content area
  cleanComposerOptions?: PdfCleanComposerOptions // Options for content cleaning
  minifyOptions?: {
    format?: 'plain' | 'html' // Controls data field output format: plain (default) = data field, html = formattedData field
    elementAttributes?: boolean // When true, include slim element attributes (fontFamily, textColor) in minified result
  }
}

/**
 * Options for content cleaning and filtering
 * Controls how the cleanComposer feature filters and cleans content
 */
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
 * Options for PDF screenshot generation
 * Controls screenshot rendering parameters
 */
export interface PdfDecomposerScreenshotOptions {
  imageWidth?: number
  imageHeight?: number
  outputDir?: string
  pages?: number[]
  format?: 'png' | 'jpeg'
  quality?: number
}

/**
 * Result interface for screenshot operations
 * Contains generated screenshots and metadata
 */
export interface PdfDecomposerScreenshotResult {
  screenshots: PdfDecomposerScreenshot[]
  totalPages: number
  processedPages: number
}

/**
 * Individual screenshot image interface
 */
export interface PdfDecomposerScreenshot {
  pageNumber: number
  buffer: Buffer
  width: number
  height: number
  filename?: string
}

// =============================================================================
// ELEMENT INTERFACES
// =============================================================================

/**
 * Base interface for all PDF elements
 */
export interface PdfDecomposerElement {
  id: string
  pageIndex: number
  type: 'text' | 'image' | 'link' | 'annotation'
  boundingBox: PdfDecomposerBoundingBox
  data: any
  attributes?: Record<string, any>
}

/**
 * Text element interface
 */
export interface PdfDecomposerTextElement extends PdfDecomposerElement {
  type: 'text'
  data: string
  formattedData?: string
  attributes: PdfDecomposerTextAttributes
}

/**
 * Image element interface
 */
export interface PdfDecomposerImageElement extends PdfDecomposerElement {
  type: 'image'
  data: string | Buffer
  attributes: PdfDecomposerImageAttributes
}

/**
 * Link element interface
 */
export interface PdfDecomposerLinkElement extends PdfDecomposerElement {
  type: 'link'
  data: string // URL or destination
  attributes: PdfDecomposerLinkAttributes
}

/**
 * Text attributes interface
 */
export interface PdfDecomposerTextAttributes {
  fontFamily?: string
  fontSize?: number
  textColor?: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
}

/**
 * Image attributes interface
 */
export interface PdfDecomposerImageAttributes {
  type: 'embedded' | 'legacy'
  width: number
  height: number
  format?: string
  originalId?: string
  scaled?: boolean
  scaleFactor?: number
  extraction?: string
}

/**
 * Link attributes interface
 */
export interface PdfDecomposerLinkAttributes {
  linkType: 'url' | 'internal' | 'email' | 'annotation' // Type of link detected
  text?: string // Associated text content (for text-based links)
  annotationId?: string // PDF annotation ID (for annotation-based links)
  dest?: any // Internal destination data (for internal PDF links)
}

/**
 * Bounding box interface
 */
export interface PdfDecomposerBoundingBox {
  top: number
  left: number
  bottom: number
  right: number
  width: number
  height: number
}

// =============================================================================
// EXTRACTION RESULT INTERFACES (for improved type safety)
// =============================================================================

/**
 * Enhanced text element with complete type safety
 */
export interface PdfDecomposerExtractedTextElement {
  id: string
  pageIndex: number
  type: 'text'
  boundingBox: PdfDecomposerBoundingBox
  data: string
  formattedData: string
  attributes: PdfDecomposerTextAttributes & {
    originalFont?: string // Only present when font mapping fallback was used
  }
}

/**
 * Enhanced image element with complete metadata
 */
export interface PdfDecomposerExtractedImageElement {
  id: string
  pageIndex: number
  type: 'image'
  boundingBox: PdfDecomposerBoundingBox
  data: string
  attributes: {
    type: 'embedded' | 'legacy'
    width: number
    height: number
    format?: string
    originalId?: string
    scaled?: boolean
    scaleFactor?: number
    extraction?: 'universal'
  }
}

/**
 * Enhanced link element with comprehensive link data
 */
export interface PdfDecomposerExtractedLinkElement {
  id: string
  pageIndex: number
  type: 'link'
  boundingBox: PdfDecomposerBoundingBox
  data: string
  attributes: {
    linkType: 'url' | 'email' | 'internal'
    annotationId?: string
    dest?: any
    text?: string
    extraction?: 'text-pattern'
  }
}

/**
 * Union type for all extracted elements with enhanced type safety
 */
export type PdfDecomposerExtractedElement = 
  | PdfDecomposerExtractedTextElement 
  | PdfDecomposerExtractedImageElement 
  | PdfDecomposerExtractedLinkElement

/**
 * Color-aware element from PdfTextEvaluator with proper typing
 */
export interface PdfDecomposerColorAwareElement {
  text?: string
  textColor?: string
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  fontSize?: number
  boundingBox?: PdfDecomposerBoundingBox
}

// =============================================================================
// MEMORY AND MONITORING
// =============================================================================

/**
 * Memory statistics interface
 */
export interface PdfDecomposerMemoryStats {
  used: number
  total: number
  percentage: number
}

/**
 * Memory monitoring options
 */
export interface PdfDecomposerMemoryOptions {
  maxMemoryMB: number
  gcThresholdMB: number
  aggressiveCleanup: boolean
}

/**
 * Progress callback interface
 */
export interface PdfDecomposerProgressCallback {
  (progress: { loaded: number; total: number }): void
}

// =============================================================================
// FACTORY AND CREATION
// =============================================================================

/**
 * Factory options for creating PDF decomposer instances
 */
export interface PdfDecomposerFactoryOptions {
  skipDecompose?: boolean
  extractImages?: boolean
  elementComposer?: boolean
  pageComposer?: boolean
}

/**
 * PDF loading options
 */
export interface PdfDecomposerLoadingOptions {
  cMapUrl?: string
  cMapPacked?: boolean
  standardFontDataUrl?: string
  disableRange?: boolean
  disableStream?: boolean
  isEvalSupported?: boolean
  verbosity?: number
}
