import type { PdfElement } from './PdfElement.js'

export interface PdfPageContent {
  pageIndex: number
  pageNumber: number
  width: number
  height: number
  title: string
  image: string
  thumbnail?: string
  elements: PdfElement[]
  // Metadata for page composition
  metadata?: {
    composedFromPages?: number[] // Array of pageIndex values (0-based) that were composed together
    originalHeight?: number
    isComposed?: boolean
    [key: string]: any
  }
}
