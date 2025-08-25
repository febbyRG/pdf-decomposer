/**
 * Types for PDF slicing operations
 * Used for splitting PDF documents into smaller documents with selected pages
 */

/**
 * Options for PDF slicing operations
 * Controls how many pages to include and from which range
 */
export interface SliceOptions {
  /**
   * Number of pages to include from the beginning (1-based)
   * If not specified, includes all pages from startPage to end
   * 
   * @example
   * ```typescript
   * // Include first 5 pages
   * await pdfDecomposer.slice({ numberPages: 5 })
   * ```
   */
  numberPages?: number

  /**
   * Starting page number (1-based, defaults to 1)
   * 
   * @example
   * ```typescript
   * // Start from page 3
   * await pdfDecomposer.slice({ startPage: 3, numberPages: 5 })
   * ```
   */
  startPage?: number

  /**
   * Ending page number (1-based)
   * If both numberPages and endPage are specified, endPage takes precedence
   * 
   * @example
   * ```typescript
   * // Include pages 2-8
   * await pdfDecomposer.slice({ startPage: 2, endPage: 8 })
   * ```
   */
  endPage?: number
}

/**
 * Result interface for slice operations
 * Contains the sliced PDF data and metadata about the operation
 */
export interface SliceResult {
  /**
   * The sliced PDF as Uint8Array
   */
  pdfBytes: Uint8Array

  /**
   * Original total number of pages before slicing
   */
  originalPageCount: number

  /**
   * Number of pages in the sliced PDF
   */
  slicedPageCount: number

  /**
   * Range of pages that were included in the slice (1-based)
   */
  pageRange: {
    startPage: number
    endPage: number
  }

  /**
   * Size of the sliced PDF in bytes
   */
  fileSize: number
}
