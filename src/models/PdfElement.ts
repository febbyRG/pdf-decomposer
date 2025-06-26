export interface PdfElement {
  type: 'text' | 'image' | 'path' | 'annotation' | string
  // Text
  str?: string
  fontName?: string
  transform?: number[]
  width?: number
  height?: number
  // Image
  imageIndex?: number
  widthPx?: number
  heightPx?: number
  // Path
  pathOps?: any[]
  // Annotation
  annotationSubtype?: string
  annotationData?: any
  // Generic
  [key: string]: any
}
