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
