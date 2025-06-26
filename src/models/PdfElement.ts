export interface PdfElement {
  id: string
  pageIndex: number
  type: 'text' | 'image' | 'path' | 'annotation' | string
  data: string
  [key: string]: any
}
