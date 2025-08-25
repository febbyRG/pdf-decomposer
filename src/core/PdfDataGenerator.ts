import type { PdfPageContent } from '../models/PdfPageContent.js'
import type { PdfElement } from '../models/PdfElement.js'

/**
 * Interface for PDF Data compatible with pwa-admin
 */
export interface PdfArea {
  id: string
  coords: number[] // [x1, y1, x2, y2] normalized 0-1
  articleId: number
  widgetId: string
}

export interface PdfData {
  id: string
  index: number
  image: string
  thumbnail: string
  areas: PdfArea[]
}

export interface PdfDataGeneratorOptions {
  /**
   * Base URL for page images (will append page filename)
   */
  imageBaseUrl?: string
  
  /**
   * Function to generate article ID for each area
   * If not provided, will use placeholder articleId
   */
  articleIdGenerator?: (pageIndex: number, elementIndex: number, element: PdfElement) => number
  
  /**
   * Function to generate unique IDs for pages and areas
   * If not provided, will use simple incremental IDs
   */
  idGenerator?: () => string
  
  /**
   * Minimum element size to include (to filter out tiny elements)
   */
  minElementSize?: {
    width?: number
    height?: number
    area?: number
  }
  
  /**
   * Whether to group similar elements together
   */
  groupSimilarElements?: boolean
}

/**
 * Generates pdfData structure compatible with pwa-admin from pdf-decomposer output
 */
export class PdfDataGenerator {
  private idCounter = 0
  
  constructor(private options: PdfDataGeneratorOptions = {}) {}

  /**
   * Generate unique ID
   */
  private generateId(): string {
    if (this.options.idGenerator) {
      return this.options.idGenerator()
    }
    return this.generateRandomId()
  }

  /**
   * Generate random ID similar to the example format
   */
  private generateRandomId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < 12; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  /**
   * Generate widget ID based on element type and index following epub format
   * Only two types: P (Picture) for images, T (Text) for everything else
   */
  private generateWidgetId(element: PdfElement, elementIndex: number, typeCounters: Record<string, number>): string {
    // Following epub logic: only images are P (Picture), everything else is T (Text)
    const elementType = element.type === 'image' ? 'P' : 'T'
    
    if (!typeCounters[elementType]) {
      typeCounters[elementType] = 0
    }
    
    // Use current index BEFORE incrementing (epub pattern)
    const widgetId = `${elementType}:${typeCounters[elementType]}`
    typeCounters[elementType]++
    
    return widgetId
  }

  /**
   * Clamp coordinates to [0, 1] range and round to 6 decimal places
   */
  private clampAndRoundCoords(coords: number[]): number[] {
    return coords.map(coord => {
      // Clamp to [0, 1] range
      const clamped = Math.max(0, Math.min(1, coord))
      // Round to 6 decimal places to match original format
      return Math.round(clamped * 1000000) / 1000000
    })
  }

  /**
   * Normalize coordinates to 0-1 range based on page dimensions
   */
  private normalizeCoords(element: PdfElement, pageWidth: number, pageHeight: number): number[] {
    // Handle different bounding box formats from pdf-decomposer
    const bbox = (element as any).bbox || (element as any).boundingBox || (element as any).bounds
    
    if (!bbox) {
      // Fallback: use element position properties if available
      const x = (element as any).x || 0
      const y = (element as any).y || 0
      const width = (element as any).width || 50
      const height = (element as any).height || 20
      
      const coords = [
        x / pageWidth,
        y / pageHeight,
        (x + width) / pageWidth,
        (y + height) / pageHeight
      ]
      return this.clampAndRoundCoords(coords)
    }
    
    // Handle array format [x, y, width, height] or [top, left, width, height]
    if (Array.isArray(bbox)) {
      const [x, y, width, height] = bbox
      const coords = [
        x / pageWidth,
        y / pageHeight,
        (x + width) / pageWidth,
        (y + height) / pageHeight
      ]
      return this.clampAndRoundCoords(coords)
    }
    
    // Handle object format {x1, y1, x2, y2} or {x, y, width, height} or {top, left, width, height}
    if (typeof bbox === 'object') {
      // Format: {x1, y1, x2, y2}
      if ('x1' in bbox && 'y1' in bbox && 'x2' in bbox && 'y2' in bbox) {
        const coords = [
          bbox.x1 / pageWidth,
          bbox.y1 / pageHeight,
          bbox.x2 / pageWidth,
          bbox.y2 / pageHeight
        ]
        return this.clampAndRoundCoords(coords)
      }
      
      // Format: {x, y, width, height}
      if ('x' in bbox && 'y' in bbox && 'width' in bbox && 'height' in bbox) {
        const coords = [
          bbox.x / pageWidth,
          bbox.y / pageHeight,
          (bbox.x + bbox.width) / pageWidth,
          (bbox.y + bbox.height) / pageHeight
        ]
        return this.clampAndRoundCoords(coords)
      }
      
      // Format: {top, left, width, height}
      if ('top' in bbox && 'left' in bbox && 'width' in bbox && 'height' in bbox) {
        const coords = [
          bbox.left / pageWidth,
          bbox.top / pageHeight,
          (bbox.left + bbox.width) / pageWidth,
          (bbox.top + bbox.height) / pageHeight
        ]
        return this.clampAndRoundCoords(coords)
      }
    }
    
    // Fallback to default values
    return this.clampAndRoundCoords([0, 0, 0.1, 0.1])
  }

  /**
   * Check if element meets minimum size requirements
   */
  private meetsMinimumSize(coords: number[], pageWidth: number, pageHeight: number): boolean {
    const { minElementSize } = this.options
    if (!minElementSize) return true

    const width = (coords[2] - coords[0]) * pageWidth
    const height = (coords[3] - coords[1]) * pageHeight
    const area = width * height

    if (minElementSize.width && width < minElementSize.width) return false
    if (minElementSize.height && height < minElementSize.height) return false
    if (minElementSize.area && area < minElementSize.area) return false

    return true
  }

  /**
   * Generate page image URL (placeholder)
   */
  private generateImageUrl(pageIndex: number): string {
    const { imageBaseUrl } = this.options
    const pageNumber = String(pageIndex + 1).padStart(3, '0')
    const filename = `pg-${pageNumber}.jpg`
    
    if (imageBaseUrl) {
      return `${imageBaseUrl.replace(/\/$/, '')}/${filename}`
    }
    
    // Placeholder format - will be replaced in pwa-admin
    return `https://cdn.magloft.com/pdf-import/PLACEHOLDER_PROJECT_ID/images/pages/${filename}`
  }

  /**
   * Generate thumbnail URL from image URL
   */
  private generateThumbnailUrl(imageUrl: string): string {
    return `${imageUrl}?optimizer=image&width=128`
  }

  /**
   * Convert PdfPageContent array to PdfData array
   */
  public generatePdfData(pages: PdfPageContent[]): PdfData[] {
    return pages.map((page, pageIndex) => this.convertPageToPdfData(page, pageIndex))
  }

  /**
   * Convert single PdfPageContent to PdfData
   */
  public convertPageToPdfData(page: PdfPageContent, pageIndex?: number): PdfData {
    const index = pageIndex ?? page.pageIndex
    const typeCounters: Record<string, number> = {}
    
    // Filter and convert elements to areas
    const areas: PdfArea[] = page.elements
      .map((element, elementIndex) => {
        const coords = this.normalizeCoords(element, page.width, page.height)
        
        // Check minimum size requirements
        if (!this.meetsMinimumSize(coords, page.width, page.height)) {
          return null
        }
        
        const widgetId = this.generateWidgetId(element, elementIndex, typeCounters)
        // Use placeholder articleId - will be replaced in pwa-admin
        const articleId = this.options.articleIdGenerator?.(index, elementIndex, element) ?? 999999
        
        return {
          id: this.generateId(),
          coords,
          widgetId,
          articleId
        }
      })
      .filter((area): area is PdfArea => area !== null)

    const imageUrl = page.image || this.generateImageUrl(index)
    
    return {
      id: this.generateId(),
      index,
      image: imageUrl,
      thumbnail: this.generateThumbnailUrl(imageUrl),
      areas
    }
  }

  /**
   * Helper method to generate pdfData with commonly used settings
   */
  public static generateForMagloft(
    pages: PdfPageContent[], 
    options: {
      projectId?: string | number
      articleIdGenerator?: (pageIndex: number, elementIndex: number, element: PdfElement) => number
    } = {}
  ): PdfData[] {
    const { projectId = 'PLACEHOLDER_PROJECT_ID', articleIdGenerator } = options
    
    const generator = new PdfDataGenerator({
      imageBaseUrl: `https://cdn.magloft.com/pdf-import/${projectId}/images/pages`,
      articleIdGenerator,
      minElementSize: {
        width: 10,
        height: 10,
        area: 100
      }
    })
    
    return generator.generatePdfData(pages)
  }
}

/**
 * Convenience function for generating pdfData
 */
export function generatePdfData(
  pages: PdfPageContent[], 
  options?: PdfDataGeneratorOptions
): PdfData[] {
  const generator = new PdfDataGenerator(options)
  return generator.generatePdfData(pages)
}
