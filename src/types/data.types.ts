import type { PdfElement } from '../models/PdfElement.js'
import type { PdfCleanComposerOptions } from './decomposer.types.js'

/**
 * Interface for PDF Area compatible with pwa-admin
 */
export interface PdfArea {
  id: string
  coords: number[] // [x1, y1, x2, y2] normalized 0-1
  articleId: number
  widgetId: string
}

/**
 * Interface for PDF Data compatible with pwa-admin
 */
export interface PdfData {
  id: string
  index: number
  image: string
  thumbnail: string
  areas: PdfArea[]
}

/**
 * Options for PDF data generator
 */
export interface PdfDataGeneratorOptions {
  /**
   * Base URL for page images (will append page filename)
   */
  imageBaseUrl?: string
  
  /**
   * Function to generate article ID for each area
   * If not provided, will use placeholder articleId
   */
  articleIdGenerator?: (pageIndex: number, elementIndex: number, element: PdfElement) => number
  
  /**
   * Function to generate unique IDs for pages and areas
   * If not provided, will use simple incremental IDs
   */
  idGenerator?: () => string
  
  /**
   * Minimum element size to include (to filter out tiny elements)
   */
  minElementSize?: {
    width?: number
    height?: number
    area?: number
  }
  
  /**
   * Whether to group similar elements together
   */
  groupSimilarElements?: boolean
}

/**
 * Options for PDF data generation process
 * Controls the generation of pwa-admin compatible data format
 */
export interface DataOptions {
  startPage?: number
  endPage?: number
  outputDir?: string
  extractImages?: boolean
  elementComposer?: boolean
  cleanComposer?: boolean
  cleanComposerOptions?: PdfCleanComposerOptions
  // Screenshot options for page image generation
  imageWidth?: number
  imageQuality?: number
}

/**
 * Result type for PDF data generation operations
 */
export interface DataResult {
  data: PdfData[]
}
