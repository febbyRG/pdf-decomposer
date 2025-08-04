import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js'
import { Package, PdfDecomposer } from '../core/PdfDecomposer.js'
import { PdfDocument } from '../core/PdfDocument.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'
import { InvalidPdfError, PdfProcessingError } from '../types/pdf.types.js'
import '../utils/DOMMatrixPolyfill.js' // Polyfill for Node.js PDF.js compatibility

// Configure PDF.js worker for browser environments
if (typeof globalThis !== 'undefined' && typeof globalThis.window !== 'undefined' && typeof globalThis.document !== 'undefined') {
  // Browser environment - configure worker with multiple strategies
  const configureWorker = () => {
    // Default to legacy worker for legacy build
    let workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.2.146/legacy/build/pdf.worker.min.js'

    // Strategy 1: Check if external configuration is available
    if ((globalThis as any).window.pdfjsWorkerSrc) {
      workerSrc = (globalThis as any).window.pdfjsWorkerSrc
      console.log('🔧 Using external worker config:', workerSrc)
    }

    // Strategy 2: Check if external pdfjsLib is configured
    if ((globalThis as any).window.pdfjsLib && (globalThis as any).window.pdfjsLib.GlobalWorkerOptions && (globalThis as any).window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      workerSrc = (globalThis as any).window.pdfjsLib.GlobalWorkerOptions.workerSrc
      console.log('🔧 Using external pdfjsLib worker config:', workerSrc)
      // Copy worker configuration from external pdfjsLib
      pdfjsLib.GlobalWorkerOptions.workerSrc = (globalThis as any).window.pdfjsLib.GlobalWorkerOptions.workerSrc
    }

    // Strategy 3: Force configuration
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

    // Strategy 4: Backup configuration verification
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc
      console.log('🔧 Backup worker configuration applied:', workerSrc)
    }

    console.log('🔧 PDF.js worker configured in pdf-decomposer:', pdfjsLib.GlobalWorkerOptions.workerSrc)

    // Verify configuration
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      throw new Error('Critical: Failed to configure PDF.js worker in pdf-decomposer')
    }

    // Additional debug info
    console.log('🔧 PDF.js version:', pdfjsLib.version || 'unknown')
    console.log('🔧 Worker configured successfully for legacy build')
  }

  try {
    configureWorker()
  } catch (error) {
    console.error('❌ Failed to configure PDF.js worker:', error)
    throw error
  }
}

export interface DecomposeOptions {
  readonly startPage?: number // First page to process (1-indexed, default: 1)
  readonly endPage?: number // Last page to process (1-indexed, default: all pages)
  readonly extractImages?: boolean // Extract individual images embedded in PDF content
  readonly outputDir?: string // Output directory for generated files (default: current directory)
  readonly elementComposer?: boolean // Group text elements into paragraphs for better structure (default: false)
  readonly pageComposer?: boolean // Combine pages with continuous content flow (default: false)
  readonly minify?: boolean // Simplify return data from decomposePdf (default: false)
}

/**
 * Decompose a PDF buffer and extract all page content (text, images, annotations, etc.) into JSON format.
 * Works in both Node.js and browser environments without file system dependencies.
 * For page screenshots, use screenshotPdf() function instead.
 *
 * @param input PDF buffer (Buffer, ArrayBuffer, or Uint8Array)
 * @param options Optional configuration for decomposition
 * @returns Promise resolving to array of PdfPageContent objects
 *
 * @example
 * ```typescript
 * // Node.js usage (if fs available)
 * import { readFileSync } from 'fs'
 * const buffer = readFileSync('document.pdf')
 * const result = await decomposePdf(buffer, { elementComposer: true, extractImages: true })
 *
 * // Browser usage
 * const file = fileInput.files[0]
 * const arrayBuffer = await file.arrayBuffer()
 * const result = await decomposePdf(arrayBuffer, { elementComposer: true })
 *
 * // For page screenshots, use screenshotPdf() instead:
 * import { screenshotPdf } from 'pdf-decomposer'
 * const screenshots = await screenshotPdf(buffer, { imageWidth: 1024, outputDir: './screenshots' })
 * ```
 */
export async function decomposePdf(
  input: Buffer | ArrayBuffer | Uint8Array,
  options: DecomposeOptions = {}
): Promise<PdfPageContent[]> {
  console.log('🔧 Starting buffer-based PDF decomposition...')

  // Validate input type
  if (!input) {
    throw new InvalidPdfError('Input buffer is required')
  }

  // Validate page range
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
    console.log('📄 Loading PDF document from buffer...')

    // Load PDF document from buffer (universal approach)
    const pdfDoc = await loadPdfDocumentFromBuffer(input)

    // Create in-memory package (no file system dependencies)
    const pkg: Package = {
      pkgDir: new MemoryPackageDir(options.outputDir),
      pages: [],
      state: {
        progress: 0,
        message: 'Initializing...',
        processing: true
      }
    }

    // If pageComposer is enabled, automatically enable elementComposer
    const enableElementComposer = options.elementComposer ?? options.pageComposer ?? false
    const enablePageComposer = options.pageComposer ?? false

    console.log(`🔧 Configuration: elementComposer=${enableElementComposer}, pageComposer=${enablePageComposer}`)

    // Create decomposer
    const decomposer = new PdfDecomposer(
      pdfDoc,
      pkg,
      false, // skipDecompose
      options.extractImages ?? false,
      enableElementComposer,
      enablePageComposer
    )

    // Process all pages first to load document
    await pdfDoc.process((progress) => {
      console.log(`📖 Loading pages: ${progress.loaded}/${progress.total}`)
    })

    // Determine page range
    const totalPages = pdfDoc.numPages
    const startPage = Math.max(1, options.startPage ?? 1)
    const endPage = Math.min(totalPages, options.endPage ?? totalPages)

    console.log(`📚 Processing pages ${startPage} to ${endPage} of ${totalPages}`)

    // Decompose the specified page range
    await decomposer.decompose(startPage, endPage)

    console.log(`✅ PDF decomposition completed: ${pkg.pages.length} pages processed`)

    // Apply minify option if requested
    if (options.minify) {
      console.log('🗜️ Applying minify option...')
      return minifyPagesData(pkg.pages)
    }

    return pkg.pages

  } catch (error) {
    console.error('❌ PDF decomposition failed:', error)

    if (error instanceof InvalidPdfError || error instanceof PdfProcessingError) {
      throw error
    }

    throw new PdfProcessingError(
      `PDF decomposition failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Load PDF document from buffer (browser and Node.js compatible)
 */
async function loadPdfDocumentFromBuffer(input: Buffer | ArrayBuffer | Uint8Array): Promise<PdfDocument> {
  try {
    console.log('📖 Loading PDF document from buffer...')

    // Convert input to Uint8Array for PDF.js compatibility
    let pdfData: Uint8Array
    if (input instanceof ArrayBuffer) {
      pdfData = new Uint8Array(input)
    } else if (input instanceof Uint8Array) {
      pdfData = input
    } else if ((input as any)?.constructor?.name === 'Buffer') {
      // Handle Buffer without importing Node.js types
      pdfData = new Uint8Array(input as any)
    } else {
      throw new InvalidPdfError('Input must be Buffer, ArrayBuffer, or Uint8Array')
    }

    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      disableFontFace: false,
      verbosity: 0 // Reduce console noise
    })

    const pdfDoc = await loadingTask.promise
    console.log(`✅ PDF loaded: ${pdfDoc.numPages} pages`)

    return new PdfDocument(pdfDoc)

  } catch (error) {
    console.error('❌ Failed to load PDF document:', error)
    throw new InvalidPdfError(`Failed to load PDF: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Memory-only package directory (no file system operations)
 */
class MemoryPackageDir {
  public readonly dir: string

  constructor(outputDir = '.') {
    this.dir = outputDir
    console.log('🧠 Memory package directory initialized (no file system access)')
  }

  async create(): Promise<void> {
    console.log('🧠 Memory mode: skipping directory creation')
  }
}

/**
 * Minify pages data for smaller output
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
