/**
 * Comprehensive types for PDF Decomposer system
 * Used across all components to ensure type safety and consistency
 */

import type { PdfDocument } from '../core/PdfDocument.js'

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
  minify?: boolean // When true, use compact bounding box format [x, y, width, height]
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
  type: 'text' | 'image' | 'annotation'
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
