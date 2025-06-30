import fs from 'fs'
import { Package, PdfDecomposer } from '../core/PdfDecomposer.js'
import { PdfDocument } from '../core/PdfDocument.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'
import { InvalidPdfError, PdfProcessingError } from '../types/pdf.types.js'
import { ValidationUtils } from '../utils/ValidationUtils.js'

export interface DecomposeOptions {
  readonly assetPath?: string
  readonly startPage?: number // First page to process (1-indexed, default: 1)
  readonly endPage?: number // Last page to process (1-indexed, default: all pages)
  readonly generateImages?: boolean // Generate page images and thumbnails (default: false)
  readonly extractEmbeddedImages?: boolean // Extract individual images embedded in PDF content
  readonly imageWidth?: number // Width for rendered page images (default: 1200)
  readonly imageQuality?: number // JPEG quality for page images (default: 90)
}


/**
 * Decompose a PDF file and extract all page content (text, images, annotations, etc.) into JSON format.
 * Optionally generate page images and extract embedded images to assetPath.
 * @param filePath Path to the PDF file
 * @param options Optional configuration for decomposition
 * @param options.assetPath Directory to save generated images and assets
 * @param options.startPage First page to process (1-indexed, default: 1)
 * @param options.endPage Last page to process (1-indexed, default: all pages)
 * @param options.generateImages Generate page images and thumbnails (default: false)
 * @param options.extractEmbeddedImages Extract individual images embedded in PDF content (default: false)
 * @param options.imageWidth Width for rendered page images (default: 1200)
 * @param options.imageQuality JPEG quality for page images (default: 90)
 * @returns Array of PDFPageContent objects for each page in the specified range
 * @throws {InvalidPdfError} if the file cannot be read or parsed, or if page range is invalid
 * @throws {PdfProcessingError} if processing fails
 */
export async function decomposePdf(
  filePath: string,
  options: DecomposeOptions = {}
): Promise<PdfPageContent[]> {

  // Validate inputs
  ValidationUtils.validateFilePath(filePath)

  if (options.startPage !== undefined && (!Number.isInteger(options.startPage) || options.startPage < 1)) {
    throw new InvalidPdfError('startPage must be a positive integer')
  }

  if (options.endPage !== undefined && (!Number.isInteger(options.endPage) || options.endPage < 1)) {
    throw new InvalidPdfError('endPage must be a positive integer')
  }

  if (options.startPage !== undefined && options.endPage !== undefined && options.startPage > options.endPage) {
    throw new InvalidPdfError('startPage must be less than or equal to endPage')
  }

  try {
    const pdfDoc = await loadPdfDocument(filePath)

    // Prepare output package
    const outDir = options.assetPath || filePath
    const pkg: Package = { pkgDir: new LocalPackageDir(outDir), pages: [] }

    const composer = new PdfDecomposer(
      pdfDoc,
      pkg,
      false,
      options.generateImages ?? false,
      options.extractEmbeddedImages,
      options.imageWidth,
      options.imageQuality
    )
    composer.subscribe((state) => {
      console.log(`[${Math.round(state.progress)}%] ${state.message}`)
    })
    composer.decomposeError.push((err: any) => {
      console.error('Processing error:', err)
    })

    // Calculate page range
    const totalPages = pdfDoc.numPages
    const startPage = Math.max(1, options.startPage || 1)
    const endPage = Math.min(totalPages, options.endPage || totalPages)

    // Validate page range against actual document
    if (startPage > totalPages) {
      throw new InvalidPdfError(`startPage (${startPage}) exceeds document page count (${totalPages})`)
    }

    await composer.decompose(startPage, endPage)

    return composer.pkg.pages
  } catch (error) {
    if (error instanceof InvalidPdfError || error instanceof PdfProcessingError) {
      throw error
    }

    // Wrap unknown errors
    throw new PdfProcessingError(
      `Failed to decompose PDF: ${(error as Error).message}`,
      undefined,
      error as Error
    )
  }
}

class LocalPackageDir {
  constructor(private readonly dir: string) { }

  async create(): Promise<void> {
    try {
      if (!fs.existsSync(this.dir)) {
        fs.mkdirSync(this.dir, { recursive: true })
      }
    } catch (error) {
      throw new PdfProcessingError(
        `Failed to create output directory: ${(error as Error).message}`,
        undefined,
        error as Error
      )
    }
  }
}

async function loadPdfDocument(filePath: string): Promise<PdfDocument> {
  try {
    // Verify file exists
    if (!fs.existsSync(filePath)) {
      throw new InvalidPdfError(`File not found: ${filePath}`)
    }

    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js')
    const { getDocument } = pdfjsLib.default || pdfjsLib

    if (!getDocument) {
      throw new PdfProcessingError('Failed to load PDF.js getDocument function')
    }

    const data = new Uint8Array(fs.readFileSync(filePath))
    const loadingTask = getDocument({ data })
    const doc = await loadingTask.promise

    // Use the custom PdfDocument class, which will create PdfPage instances
    const customDoc = new PdfDocument(doc as any)
    await customDoc.process()

    return customDoc
  } catch (error) {
    if (error instanceof InvalidPdfError || error instanceof PdfProcessingError) {
      throw error
    }

    throw new InvalidPdfError(
      `Failed to load PDF document: ${(error as Error).message}`
    )
  }
}

