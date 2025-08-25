import type { PdfPageContent } from '../models/PdfPageContent.js'

/**
 * Options for PDF decomposition process
 */
export interface DecomposeOptions {
  startPage?: number
  endPage?: number
  outputDir?: string
  elementComposer?: boolean
  pageComposer?: boolean
  extractImages?: boolean
  minify?: boolean
}

/**
 * Result type for PDF decomposition operations
 */
export interface DecomposeResult {
  pages: PdfPageContent[]
}
