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
}
