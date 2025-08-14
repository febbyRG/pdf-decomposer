export interface ExtractedImage {
  id: string
  pageNumber: number
  data: string // Data URL format
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
}
