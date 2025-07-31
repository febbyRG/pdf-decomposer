import fs from 'fs'
import path from 'path'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js'
import { Package, PdfDecomposer } from '../core/PdfDecomposer.js'
import { PdfDocument } from '../core/PdfDocument.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'
import { InvalidPdfError, PdfProcessingError } from '../types/pdf.types.js'
import '../utils/DOMMatrixPolyfill.js' // Polyfill for Node.js PDF.js compatibility
import { ValidationUtils } from '../utils/ValidationUtils.js'

export interface DecomposeOptions {
  readonly assetPath?: string
  readonly startPage?: number // First page to process (1-indexed, default: 1)
  readonly endPage?: number // Last page to process (1-indexed, default: all pages)
  readonly generateImages?: boolean // Generate page images and thumbnails (default: false)
  readonly extractEmbeddedImages?: boolean // Extract individual images embedded in PDF content
  readonly elementComposer?: boolean // Group text elements into paragraphs for better structure (default: false)
  readonly pageComposer?: boolean // Combine pages with continuous content flow (default: false)
  readonly imageWidth?: number // Width for rendered page images (default: 1200)
  readonly imageQuality?: number // JPEG quality for page images (default: 90)
  readonly minify?: boolean // Simplify return data from decomposePdf (default: false)
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
 * @param options.elementComposer Group text elements into paragraphs for better structure (default: false)
 * @param options.pageComposer Combine pages with continuous content flow (default: false)
 * @param options.imageWidth Width for rendered page images (default: 1200)
 * @param options.imageQuality JPEG quality for page images (default: 90)
 * @param options.minify Simplify return data from decomposePdf (default: false)
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
    const outDir = options.assetPath || path.dirname(filePath)
    const pkg: Package = { pkgDir: new LocalPackageDir(outDir), pages: [] }

    // If pageComposer is enabled, automatically enable elementComposer
    const enableElementComposer = options.elementComposer ?? options.pageComposer ?? false
    const enablePageComposer = options.pageComposer ?? false

    const composer = new PdfDecomposer(
      pdfDoc,
      pkg,
      false,
      options.generateImages ?? false,
      options.extractEmbeddedImages,
      enableElementComposer,
      enablePageComposer,
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

    const pages = composer.pkg.pages
    return options.minify ? minifyPagesData(pages) : pages
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

/**
 * Minify pages data by removing unnecessary properties and simplifying structure
 * @param pages Array of PdfPageContent to minify
 * @returns Minified version of pages data
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

    // Use the imported pdfjs-dist library
    const { getDocument } = pdfjsLib

    if (!getDocument) {
      throw new PdfProcessingError('Failed to load PDF.js getDocument function')
    }

    const data = new Uint8Array(fs.readFileSync(filePath))
    const loadingTask = getDocument({
      data,
      verbosity: 0
    })
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

