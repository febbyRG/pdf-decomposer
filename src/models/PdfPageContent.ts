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
  pdfData?: import('../core/PdfDataGenerator.js').PdfData[]  // Proper type for pwa-admin compatible format
  // Metadata for page composition
  metadata?: {
    composedFromPages?: number[]
    originalHeight?: number
    isComposed?: boolean
    [key: string]: any
  }
}
