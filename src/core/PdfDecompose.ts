import type { PdfPageContent } from '../models/PdfPageContent.js'
import { InvalidPdfError, PdfProcessingError } from '../types/pdf.types.js'
import type { 
  PdfDecomposerOptions, 
  PdfDecomposerPackage, 
  PdfDecomposerState, 
  PdfDecomposerError,
  PdfDecomposerPageData
} from '../types/decomposer.types.js'
import { PdfDocument } from './PdfDocument.js'
import { PdfDecomposerPage } from './PdfDecomposerPage.js'
import { PdfElementComposer } from './PdfElementComposer.js'
import { PdfPageComposer } from './PdfPageComposer.js'
import { MemoryManager } from '../utils/MemoryManager.js'
import { MemoryPackageDir } from '../utils/MemoryPackageDir.js'

/**
 * Minify pages data for smaller output (missing feature from original)
 */
function minifyPagesData(pages: PdfPageContent[]): any[] {
  return pages.map(page => {
    const minifiedPage: any = {
      pageIndex: page.pageIndex,
      width: Math.round(page.width),
      height: Math.round(page.height),
      title: page.title,
      elements: page.elements.map(element => {
        const minifiedElement: any = {
          type: element.type,
          data: element.data
        }

        // Simplify boundingBox format
        if (element.boundingBox) {
          if (Array.isArray(element.boundingBox)) {
            // Convert [x, y, width, height] format to [top, left, width, height]
            minifiedElement.boundingBox = element.boundingBox
          } else if (typeof element.boundingBox === 'object') {
            // Convert {top, left, width, height} format to [top, left, width, height]
            const bbox = element.boundingBox as any
            minifiedElement.boundingBox = [Math.round(bbox.top || 0), Math.round(bbox.left || 0), Math.round(bbox.width || 0), Math.round(bbox.height || 0)]
          }
        }

        // Handle special type mapping
        if (element.attributes?.type) {
          // Map specific types like 'h1', 'h2', etc from attributes
          if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(element.attributes.type)) {
            minifiedElement.type = element.attributes.type
          }
        }

        return minifiedElement
      })
    }

    return minifiedPage
  })
}

/**
 * Core PDF decomposition logic for already-loaded PDF documents
 * 
 * Decomposes a PDF document and extracts all content including:
 * - Text content with positioning and formatting
 * - Images (if extractImages option is enabled)
 * - Document structure and metadata
 * - Page-level information (dimensions, rotation, etc.)
 * 
 * @param pdfDocument Already loaded and processed PdfDocument instance
 * @param options Optional configuration for decomposition process
 * @param progressCallback Optional callback for progress updates
 * @param errorCallback Optional callback for error notifications
 * @returns Promise resolving to array of PdfPageContent objects
 * 
 * @example
 * ```typescript
 * import { pdfDecompose } from 'pdf-decomposer/core'
 * 
 * // Load PDF first
 * const pdfProxy = await PdfLoader.loadFromBuffer(buffer)
 * const pdfDocument = new PdfDocument(pdfProxy)
 * await pdfDocument.process()
 * 
 * // Then decompose with progress tracking
 * const pages = await pdfDecompose(pdfDocument, {
 *   startPage: 1,
 *   endPage: 10,
 *   elementComposer: true,
 *   extractImages: true
 * }, (state) => {
 *   console.log(`Progress: ${state.progress}% - ${state.message}`)
 * })
 * ```
 */
export async function pdfDecompose(
  pdfDocument: PdfDocument,
  options: PdfDecomposerOptions = {},
  progressCallback?: (state: PdfDecomposerState) => void,
  errorCallback?: (error: PdfDecomposerError) => void
): Promise<PdfPageContent[]> {
  console.log('🔍 Starting PDF decomposition with pre-loaded document...')
  
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

  // Helper function to notify errors
  const notifyError = (message: string, pageIndex: number) => {
    if (errorCallback) {
      errorCallback({
        message,
        pageIndex
      })
    }
  }

  updateProgress(0, 'Starting PDF decomposition...')
  
  // Validate page range (missing feature from original)
  if (options.startPage !== undefined && options.startPage < 1) {
    throw new InvalidPdfError('startPage must be 1 or greater')
  }

  if (options.endPage !== undefined && options.endPage < 1) {
    throw new InvalidPdfError('endPage must be 1 or greater')
  }

  if (options.startPage !== undefined && options.endPage !== undefined && options.startPage > options.endPage) {
    throw new InvalidPdfError('startPage must be less than or equal to endPage')
  }
  
  try {

    // Create package object (like original implementation)
    const pkg: PdfDecomposerPackage = {
      pkgDir: new MemoryPackageDir(options.outputDir),
      pages: [],
      state: {
        progress: 0,
        message: 'Initializing...',
        processing: true
      }
    }

    // Create mock decomposer instance for PdfDecomposerPage compatibility
    const mockDecomposer: PdfDecomposerPageData = {
      pdfDoc: pdfDocument,
      pkg: pkg
    }
    
    // Set package fingerprint
    pkg.fingerprint = pdfDocument.fingerprint
    await pkg.pkgDir?.create()

    updateProgress(10, 'Loading document')

    // Calculate actual page range
    const totalPages = pdfDocument.numPages
    const startPage = options.startPage ?? 1
    const endPage = options.endPage ?? totalPages
    const actualStartPage = Math.max(1, startPage)
    const actualEndPage = Math.min(totalPages, endPage)
    const total = actualEndPage - actualStartPage + 1

    // Apply auto-enable logic: if pageComposer enabled, auto-enable elementComposer
    const finalOptions = {
      ...options,
      elementComposer: options.elementComposer ?? options.pageComposer ?? false,
      pageComposer: options.pageComposer ?? false
    }

    pkg.pages = []

    // Log initial memory usage
    const initialMemory = MemoryManager.getMemoryStats()
    console.log(`🧠 Starting decomposition with ${initialMemory.used}MB used`)
    console.log(`🚀 Processing pages ${actualStartPage}-${actualEndPage} (${total} pages) sequentially`)

    // Process pages sequentially (single-threaded)
    for (let pageIndex = 0; pageIndex < total; pageIndex++) {
      const actualPageNumber = actualStartPage + pageIndex
      const loaded = pageIndex + 1
      const progressPercentage = 10 + Math.round((loaded / total) * 70) // 10% to 80%

      updateProgress(progressPercentage, `Processed ${loaded} pages out of ${total}`)

      try {
        // Monitor memory before page processing
        await MemoryManager.withMemoryMonitoring(async () => {
          const page = new PdfDecomposerPage(
            mockDecomposer,
            actualPageNumber, 
            false, // skipDecompose
            finalOptions.extractImages ?? false
          )
          pkg.pages[pageIndex] = await page.decompose()

          if (pageIndex === 0 && pkg.pages[0]) {
            pkg.thumbnail = pkg.pages[0].thumbnail
          }
        }, {
          maxMemoryMB: 300,
          gcThresholdMB: 150,
          aggressiveCleanup: true
        })

        console.log(`📄 Processed ${loaded} pages out of ${total}`)

        // Periodic memory cleanup every 5 pages to prevent accumulation
        if ((pageIndex + 1) % 5 === 0 && pageIndex + 1 < total) {
          console.log(`🧹 Page ${actualPageNumber} complete, cleaning up memory...`)
          await MemoryManager.cleanupMemory()

          const memoryAfterCleanup = MemoryManager.getMemoryStats()
          console.log(`🧠 Memory after cleanup: ${memoryAfterCleanup.used}MB`)
        }

      } catch (error) {
        const errorMessage = `Error processing page ${actualPageNumber}: ${(error as Error).message}`
        console.error(`❌ ${errorMessage}`)
        
        // Notify error callback
        notifyError(errorMessage, pageIndex)
        
        pkg.pages[pageIndex] = null

        // Emergency cleanup on error
        await MemoryManager.cleanupMemory()
      }
    }

    updateProgress(85, 'Saving your Package')
    console.log('📦 Saving package...')
    pkg.pages = pkg.pages.filter((page) => page != null)

    // Apply element composition if requested
    if (finalOptions.elementComposer) {
      updateProgress(88, 'Composing elements into paragraphs')
      console.log('🔧 Composing elements into paragraphs...')
      pkg.pages = PdfElementComposer.composeElements(pkg.pages)
    }

    // Apply page composition if requested
    if (finalOptions.pageComposer) {
      updateProgress(92, 'Composing pages with continuous content')
      console.log('📄 Composing pages with continuous content...')
      pkg.pages = PdfPageComposer.composePages(pkg.pages)
    }

    updateProgress(95, 'Finalizing your PDF')
    
    // Apply minify option if requested (missing feature)
    if (options.minify) {
      console.log('🗜️ Applying minify option...')
      pkg.pages = minifyPagesData(pkg.pages)
    }

    updateProgress(100, 'Completed')
    console.log(`✅ PDF decomposition completed: ${pkg.pages.length} pages processed`)
    return pkg.pages as PdfPageContent[]
    
  } catch (error) {
    console.error('❌ PDF decomposition failed:', error)
    
    if (error instanceof Error) {
      if (error.message.includes('Invalid PDF') || error.message.includes('PDF')) {
        throw new InvalidPdfError(`PDF decomposition failed: ${error.message}`)
      }
      throw new PdfProcessingError(`PDF decomposition failed: ${error.message}`)
    }
    
    throw new PdfProcessingError(`PDF decomposition failed: ${String(error)}`)
  }
}
