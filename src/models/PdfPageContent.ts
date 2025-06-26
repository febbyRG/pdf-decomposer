import type { PdfElement } from './PdfElement.js'

export interface PdfPageContent {
  pageNumber: number
  elements: PdfElement[]
  annotations: any[]
}
