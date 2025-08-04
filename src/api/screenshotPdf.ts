import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js'
import { PdfDocument } from '../core/PdfDocument.js'
import { InvalidPdfError, PdfProcessingError } from '../types/pdf.types.js'
import '../utils/DOMMatrixPolyfill.js' // Polyfill for Node.js PDF.js compatibility
import { PageRenderer } from '../utils/PageRenderer.js'

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

    console.log('🔧 PDF.js worker configured in screenshot API:', pdfjsLib.GlobalWorkerOptions.workerSrc)

    // Verify configuration
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      throw new Error('Critical: Failed to configure PDF.js worker in screenshot API')
    }

    // Additional debug info
    console.log('🔧 PDF.js version:', pdfjsLib.version || 'unknown')
    console.log('🔧 Worker configured successfully for legacy build')

    // Test worker availability
    if (typeof Worker !== 'undefined') {
      console.log('✅ Web Workers are available')
    } else {
      console.warn('⚠️ Web Workers not available - PDF.js may not work properly')
    }
  }

  try {
    configureWorker()
  } catch (error) {
    console.error('❌ Failed to configure PDF.js worker:', error)
    throw error
  }
}

export interface ScreenshotOptions {
  readonly startPage?: number // First page to process (1-indexed, default: 1)
  readonly endPage?: number // Last page to process (1-indexed, default: all pages)
  readonly outputDir?: string // Output directory for generated files (optional - if provided, files will be written)
  readonly imageWidth?: number // Width for rendered page images (default: 1200)
  readonly imageQuality?: number // JPEG quality for page images (default: 90)
}

export interface ScreenshotPageResult {
  pageNumber: number
  width: number
  height: number
  screenshot: string // Data URL format: data:image/jpeg;base64,xxxxx or data:image/png;base64,xxxxx
  filePath?: string // File path if outputDir was provided and file was written
  error?: string
}

export interface ScreenshotResult {
  totalPages: number
  screenshots: ScreenshotPageResult[]
  error?: string
}

/**
 * Generate screenshots for PDF pages without full decomposition.
 * Works in both Node.js and browser environments.
 *
 * @param input PDF buffer (Buffer, ArrayBuffer, or Uint8Array)
 * @param options Optional configuration for screenshot generation
 * @returns Promise resolving to ScreenshotResult object with metadata and pages
 *
 * @example
 * ```typescript
 * // Node.js usage
 * import { readFileSync } from 'fs'
 * const buffer = readFileSync('document.pdf')
 * const result = await screenshotPdf(buffer, {
 *   outputDir: './screenshots',
 *   imageWidth: 1024,
 *   generateThumbnails: true
 * })
 *
 * // Browser usage
 * const file = fileInput.files[0]
 * const arrayBuffer = await file.arrayBuffer()
 * const result = await screenshotPdf(arrayBuffer, {
 *   imageWidth: 1024,
 *   imageQuality: 95
 * })
 * ```
 */
export async function screenshotPdf(
  input: Buffer | ArrayBuffer | Uint8Array,
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  console.log('📸 Starting PDF screenshot generation...')

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
    console.log('📄 Loading PDF document for screenshot generation...')

    // Load PDF document from buffer
    const pdfDoc = await loadPdfDocumentFromBuffer(input)

    // Process all pages to load document
    await pdfDoc.process((progress) => {
      console.log(`📖 Loading pages for screenshot: ${progress.loaded}/${progress.total}`)
    })

    // Determine page range
    const totalPages = pdfDoc.numPages
    const startPage = Math.max(1, options.startPage ?? 1)
    const endPage = Math.min(totalPages, options.endPage ?? totalPages)

    console.log(`📚 Generating screenshots for pages ${startPage} to ${endPage} of ${totalPages}`)

    // Check if we need to write files (Node.js only)
    const shouldWriteFiles = options.outputDir && typeof process !== 'undefined' && process.versions && process.versions.node

    if (shouldWriteFiles) {
      console.log(`📁 Output directory: ${options.outputDir}`)
      // Ensure output directory exists (will be created by PageRenderer if needed)
    }

    // Default options
    const imageWidth = options.imageWidth ?? 1200
    const imageQuality = options.imageQuality ?? 90

    const screenshots: ScreenshotPageResult[] = []

    // Generate screenshots for each page
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      console.log(`📸 Processing page ${pageNum}/${endPage}...`)

      try {
        // Get PDF page
        const pdfPage = await pdfDoc.getPage(pageNum)
        console.log(`📄 Page ${pageNum} loaded successfully`)

        const viewport = pdfPage.getViewport({ scale: 1 })
        console.log(`📐 Page ${pageNum} viewport:`, {
          width: viewport.width,
          height: viewport.height
        })

        // Validate page content
        try {
          const textContent = await pdfPage.getTextContent()
          console.log(`📝 Page ${pageNum} text items:`, textContent.items.length)
        } catch (textError) {
          console.warn(`⚠️ Could not get text content for page ${pageNum}:`, textError)
        }

        try {
          // Generate page screenshot as base64
          console.log(`🎨 Starting screenshot generation for page ${pageNum}...`)

          const screenshotResult = await PageRenderer.renderPageToBase64(
            pdfPage,
            {
              quality: imageQuality,
              scale: imageWidth / viewport.width
            }
          )

          console.log(`✅ Screenshot generated for page ${pageNum} (${screenshotResult.width}x${screenshotResult.height})`)
          console.log(`📊 Data URL length: ${screenshotResult.base64.length} chars`)
          console.log(`🔍 Data URL format: ${screenshotResult.base64.substring(0, 30)}...`)

          const pageResult: ScreenshotPageResult = {
            pageNumber: pageNum,
            width: screenshotResult.width,
            height: screenshotResult.height,
            screenshot: screenshotResult.base64
          }

          // Also write to file if outputDir is provided and we're in Node.js
          if (shouldWriteFiles && options.outputDir) {
            try {
              // Determine file extension based on image format from data URL
              let fileExtension = 'jpg' // default
              if (screenshotResult.base64.includes('data:image/png')) {
                fileExtension = 'png'
              } else if (screenshotResult.base64.includes('data:image/jpeg')) {
                fileExtension = 'jpg'
              }

              const filename = `page-${pageNum}.${fileExtension}`
              const filePath = await PageRenderer.writeBase64ToFile(
                screenshotResult.base64,
                options.outputDir,
                filename
              )
              pageResult.filePath = filePath
              console.log(`💾 Screenshot saved to: ${filePath}`)
            } catch (fileError) {
              console.warn(`⚠️ Failed to write file for page ${pageNum}: ${(fileError as Error).message}`)
              // Don't fail the entire operation if file writing fails
            }
          }

          screenshots.push(pageResult)

        } catch (renderError) {
          const errorMessage = `Failed to render page ${pageNum}: ${(renderError as Error).message}`
          console.error(`❌ ${errorMessage}`)

          const pageResult: ScreenshotPageResult = {
            pageNumber: pageNum,
            width: viewport.width,
            height: viewport.height,
            screenshot: '',
            error: errorMessage
          }

          screenshots.push(pageResult)
        }

      } catch (pageError) {
        const errorMessage = `Failed to load page ${pageNum}: ${(pageError as Error).message}`
        console.error(`❌ ${errorMessage}`)

        const pageResult: ScreenshotPageResult = {
          pageNumber: pageNum,
          width: 0,
          height: 0,
          screenshot: '',
          error: errorMessage
        }

        screenshots.push(pageResult)
      }
    }

    const screenshotCount = endPage - startPage + 1
    const successCount = screenshots.filter(s => !s.error).length
    console.log(`✅ Screenshot generation completed: ${successCount}/${screenshots.length} pages successful`)

    return {
      totalPages: screenshotCount,
      screenshots
    }

  } catch (error) {
    console.error('❌ PDF screenshot generation failed:', error)

    if (error instanceof InvalidPdfError || error instanceof PdfProcessingError) {
      throw error
    }

    throw new PdfProcessingError(
      `PDF screenshot generation failed: ${error instanceof Error ? error.message : String(error)}`
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
