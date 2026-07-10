/**
 * Renderer-driven screenshot loop.
 *
 * Mirrors `PdfScreenshot.ts` in contract (same ScreenshotOptions, same
 * ScreenshotResult) but delegates the per-page rasterization to a pluggable
 * `PdfPageRenderer` (e.g. PuppeteerRenderer) instead of node-canvas.
 *
 * Kept as a separate file so the default node-canvas path stays untouched and
 * any regression here can't ripple back into existing consumers.
 */

import type { PdfDocument } from './PdfDocument.js'
import type { PdfPageRenderer } from '../types/renderer.types.js'
import type {
  ScreenshotOptions,
  ScreenshotPageResult,
  ScreenshotResult
} from '../types/screenshot.types.js'
import type { PdfDecomposerError, PdfDecomposerState } from '../types/decomposer.types.js'
import { InvalidPdfError, PdfProcessingError } from '../types/pdf.types.js'
import { promises as fsp } from 'fs'
import * as path from 'path'
import { logger } from '../utils/Logger.js'

/**
 * Run a screenshot pass through the provided renderer.
 *
 * Notes on behavior:
 * - The renderer's `initialize()` is assumed to have been called already by
 *   PdfDecomposer.initialize(). This function never calls initialize/dispose.
 * - Page release in `pdfDocument` still happens — even though the renderer
 *   may have its own pdf.js instance, the Node-side pdf.js owns text/image
 *   extraction state we still want to free.
 */
export async function pdfScreenshotViaRenderer(
  pdfDocument: PdfDocument,
  renderer: PdfPageRenderer,
  options: ScreenshotOptions = {},
  progressCallback?: (state: PdfDecomposerState) => void,
  errorCallback?: (error: PdfDecomposerError) => void
): Promise<ScreenshotResult> {
  const updateProgress = (progress: number, message: string) => {
    if (progressCallback) {
      progressCallback({ progress, message, processing: true })
    }
  }

  const notifyError = (message: string, pageIndex: number) => {
    if (errorCallback) {
      errorCallback({ message, pageIndex })
    }
  }

  updateProgress(0, 'Starting PDF screenshot generation (renderer)...')

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
    const totalPages = pdfDocument.numPages
    const startPage = Math.max(1, options.startPage ?? 1)
    const endPage = Math.min(totalPages, options.endPage ?? totalPages)
    const totalPagesToProcess = endPage - startPage + 1
    const imageWidth = options.imageWidth ?? 1024
    const imageQuality = options.imageQuality ?? 85
    const qualityFraction = imageQuality > 1 ? imageQuality / 100 : imageQuality

    const screenshots: ScreenshotPageResult[] = []
    const shouldWriteFiles = options.outputDir && typeof process !== 'undefined' && process.versions?.node

    if (shouldWriteFiles && options.outputDir) {
      updateProgress(10, `Preparing output directory: ${options.outputDir}`)
      try {
        await fsp.mkdir(options.outputDir, { recursive: true })
      } catch {
        // ignore — write step will fail later with a clearer error
      }
    }

    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      const pageIndex = pageNum - startPage
      const progress = 10 + Math.round((pageIndex / totalPagesToProcess) * 80)
      updateProgress(progress, `Rendering page ${pageNum}/${endPage} via custom renderer...`)

      try {
        let renderResult = await renderer.renderPage(pageNum, {
          // Halves render at double width so the crop keeps imageWidth.
          width: options.half ? imageWidth * 2 : imageWidth,
          quality: qualityFraction
        })

        if (options.half) {
          const { cropImageHalf } = await import('../utils/ImageCrop.js')
          renderResult = await cropImageHalf(renderResult.base64, options.half)
        }

        const pageResult: ScreenshotPageResult = {
          pageNumber: pageNum,
          width: renderResult.width,
          height: renderResult.height,
          screenshot: renderResult.base64
        }

        if (shouldWriteFiles && options.outputDir) {
          try {
            const extension = inferFileExtension(renderResult.base64)
            const filename = `page-${pageNum}.${extension}`
            const filePath = path.join(options.outputDir, filename)
            const base64Content = renderResult.base64.split(',')[1] ?? renderResult.base64
            await fsp.writeFile(filePath, Buffer.from(base64Content, 'base64'))
            pageResult.filePath = filePath

            // For large documents drop the in-memory data URL once it's on
            // disk — keeps the screenshots array bounded.
            if (totalPagesToProcess > 20) {
              pageResult.screenshot = ''
            }
          } catch (writeErr) {
            logger.warn(`⚠️ Failed to write screenshot for page ${pageNum}: ${(writeErr as Error).message}`)
          }
        }

        screenshots.push(pageResult)

        // Release Node-side pdf.js page state. The renderer manages its own
        // page state; this is for any extraction calls that hit the same
        // page in pdf-decomposer's Node pdf.js instance.
        await pdfDocument.releasePage(pageNum).catch(() => undefined)
      } catch (renderError) {
        const errorMessage = `Failed to render page ${pageNum}: ${(renderError as Error).message}`
        logger.error(`❌ ${errorMessage}`)
        notifyError(errorMessage, pageIndex)
        screenshots.push({
          pageNumber: pageNum,
          width: 0,
          height: 0,
          screenshot: '',
          error: errorMessage
        })
      }
    }

    const successCount = screenshots.filter(s => !s.error).length
    updateProgress(100, `Screenshot generation completed: ${successCount}/${screenshots.length} pages successful`)

    return {
      totalPages: totalPagesToProcess,
      screenshots
    }
  } catch (error) {
    if (error instanceof InvalidPdfError || error instanceof PdfProcessingError) {
      throw error
    }
    throw new PdfProcessingError(
      `PDF screenshot generation (renderer) failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

function inferFileExtension(dataUrl: string): string {
  if (dataUrl.startsWith('data:image/png')) return 'png'
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'jpg'
  return 'jpg'
}
