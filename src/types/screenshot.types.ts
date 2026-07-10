/**
 * Screenshot functionality types
 */

export interface ScreenshotOptions {
  readonly startPage?: number // First page to process (1-indexed, default: 1)
  readonly endPage?: number // Last page to process (1-indexed, default: all pages)
  readonly outputDir?: string // Output directory for generated files (optional - if provided, files will be written)
  readonly imageWidth?: number // Width for rendered page images (default: 1200)
  readonly imageQuality?: number // JPEG quality for page images (default: 90)
  /**
   * Keep only one horizontal half of every rendered page (Node only).
   * For spread PDFs: render a logical half page identified by
   * decompose(...)'s page.metadata.spread (sourcePageNumber + half).
   * The page renders at double width first so the half keeps imageWidth.
   */
  readonly half?: 'left' | 'right'
}

export interface ScreenshotPageResult {
  pageNumber: number
  width: number
  height: number
  screenshot: string // Data URL format: data:image/jpeg;base64,xxxxx or data:image/png;base64,xxxxx
  filePath?: string // File path if outputDir was provided and file was written
  error?: string
}

export interface ScreenshotResult {
  totalPages: number
  screenshots: ScreenshotPageResult[]
  error?: string
}
