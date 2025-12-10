import type { PdfPageContent } from '../models/PdfPageContent.js'
import type { PdfElement } from '../models/PdfElement.js'
import type { PdfDocument } from './PdfDocument.js'
import type { 
  PdfDecomposerState, 
  PdfDecomposerError 
} from '../types/decomposer.types.js'
import type { DataOptions, DataResult, PdfData, PdfArea, PdfDataGeneratorOptions } from '../types/data.types.js'

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

// =============================================================================
// CORE FUNCTION
// =============================================================================

/**
 * Core PDF data generation logic for already-loaded PDF documents
 * 
 * Generates pwa-admin compatible data format from PDF documents including:
 * - Normalized coordinates for all elements
 * - Widget ID mapping following epub conventions
 * - Area-based structure for interactive content
 * 
 * @param pdfDocument Already loaded and processed PdfDocument instance
 * @param options Optional configuration for data generation process
 * @param progressCallback Optional callback for progress updates
 * @param errorCallback Optional callback for error notifications
 * @returns Promise resolving to DataResult with pdfData and pages
 * 
 * @example
 * ```typescript
 * import { pdfData } from 'pdf-decomposer/core'
 * 
 * // Load PDF first
 * const pdfProxy = await PdfLoader.loadFromBuffer(buffer)
 * const pdfDocument = new PdfDocument(pdfProxy)
 * await pdfDocument.process()
 * 
 * // Then generate data with progress tracking
 * const result = await pdfData(pdfDocument, {
 *   startPage: 1,
 *   endPage: 10,
 *   elementComposer: true
 * }, (state) => {
 *   console.log(`Progress: ${state.progress}% - ${state.message}`)
 * })
 * ```
 */
export async function pdfData(
  pdfDocument: PdfDocument,
  options: DataOptions = {},
  progressCallback?: (state: PdfDecomposerState) => void,
  errorCallback?: (error: PdfDecomposerError) => void
): Promise<DataResult> {
  // Helper function to update progress
  const updateProgress = (progress: number, message: string) => {
    if (progressCallback) {
      progressCallback({
        progress,
        message,
        processing: true
      })
    }
  }

  updateProgress(0, 'Starting PDF data generation...')
  
  try {
    // First decompose the PDF to get page content
    updateProgress(10, 'Decomposing PDF content...')
    const { pdfDecompose } = await import('./PdfDecompose.js')
    
    const decomposeResult = await pdfDecompose(
      pdfDocument,
      {
        startPage: options.startPage,
        endPage: options.endPage,
        outputDir: options.outputDir,
        extractImages: options.extractImages,
        elementComposer: options.elementComposer ?? true,
        cleanComposer: options.cleanComposer,
        cleanComposerOptions: options.cleanComposerOptions
      },
      (state) => {
        // Forward decompose progress (10-80%)
        const adjustedProgress = 10 + (state.progress * 0.7)
        updateProgress(adjustedProgress, state.message)
      },
      errorCallback
    )
    
    const pages = decomposeResult.pages
    
    // Screenshot generation - can be skipped for memory-constrained environments
    let screenshotResult: any = null
    
    if (!options.skipScreenshots) {
      updateProgress(80, 'Generating page screenshots...')
      
      // Generate page screenshots for each page
      const { pdfScreenshot } = await import('./PdfScreenshot.js')
      screenshotResult = await pdfScreenshot(
        pdfDocument,
        {
          outputDir: options.outputDir,
          imageWidth: options.imageWidth,
          imageQuality: options.imageQuality,
          startPage: options.startPage,
          endPage: options.endPage
        },
        (state) => {
          // Forward screenshot progress (80-90%)
          const adjustedProgress = 80 + (state.progress * 0.1)
          updateProgress(adjustedProgress, `Generating screenshots: ${state.message}`)
        },
        errorCallback
      )
    } else {
      updateProgress(80, 'Skipping page screenshots (skipScreenshots=true)...')
    }
    
    updateProgress(90, 'Generating pdfData structure...')
    
    // Generate pdfData from decomposed pages
    const generator = new PdfDataGenerator({
      minElementSize: {
        width: 10,
        height: 10,
        area: 100
      }
    })
    
    // Map pages to screenshots and generate pdfData
    const pdfDataResult = pages.map((page, index) => {
      const screenshot = screenshotResult?.screenshots?.[index]
      let imageValue: string
      
      if (options.outputDir && screenshot?.filePath) {
        // If output directory exists, use filename (extract filename from filePath)
        const fileName = screenshot.filePath.split('/').pop() || `pg-${String(page.pageNumber).padStart(3, '0')}.png`
        imageValue = fileName
      } else if (screenshot?.screenshot) {
        // If no output directory, use base64 from screenshot
        imageValue = screenshot.screenshot
      } else {
        // Fallback to page image or placeholder filename
        imageValue = page.image || `pg-${String(page.pageNumber).padStart(3, '0')}.png`
      }
      
      // Create modified page with actual screenshot
      const pageWithScreenshot = {
        ...page,
        image: imageValue
      }
      
      return generator.convertPageToPdfData(pageWithScreenshot, index)
    })
    
    updateProgress(100, 'Completed')
    
    return {
      data: pdfDataResult
    }
    
  } catch (error) {
    console.error('❌ PDF data generation failed:', error)
    throw error
  }
}
