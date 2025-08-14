export interface ExtractedImage {
  id: string
  pageNumber: number
  data: string // Data URL format (base64) or filename when outputDir is specified
  width: number
  height: number
  format: string
  resourceName?: string
  actualWidth?: number
  actualHeight?: number
  scaled?: boolean
  scaleFactor?: number
  alt?: string
  type?: string
  // Position information from PDF transform matrix
  x?: number
  y?: number
  transform?: number[] // [a, b, c, d, e, f] transformation matrix
}
