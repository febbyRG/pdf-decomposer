/**
 * Core PDF screenshot functionality
 * Accepts pre-loaded PdfDocument to avoid duplicate loading
 */

import { PdfDocument } from './PdfDocument.js'
import { PageRenderer } from '../utils/PageRenderer.js'
import { InvalidPdfError, PdfProcessingError } from '../types/pdf.types.js'
import type { ScreenshotOptions, ScreenshotPageResult, ScreenshotResult } from '../types/screenshot.types.js'
import type { PdfDecomposerState, PdfDecomposerError } from '../types/decomposer.types.js'

/**
 * Generate screenshots for PDF pages using pre-loaded PdfDocument
 * 
 * @param pdfDocument Pre-loaded PdfDocument instance
 * @param options Optional configuration for screenshot generation
 * @param progressCallback Optional callback for progress updates
 * @param errorCallback Optional callback for error notifications
 * @returns Promise resolving to ScreenshotResult object
 */
export async function pdfScreenshot(
  pdfDocument: PdfDocument,
  options: ScreenshotOptions = {},
  progressCallback?: (state: PdfDecomposerState) => void,
  errorCallback?: (error: PdfDecomposerError) => void
): Promise<ScreenshotResult> {
  console.log('📸 Starting PDF screenshot generation using core logic...')

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

  updateProgress(0, 'Starting PDF screenshot generation...')

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
    // Determine page range
    const totalPages = pdfDocument.numPages
    const startPage = Math.max(1, options.startPage ?? 1)
    const endPage = Math.min(totalPages, options.endPage ?? totalPages)

    updateProgress(10, `Generating screenshots for pages ${startPage} to ${endPage}...`)
    console.log(`📚 Generating screenshots for pages ${startPage} to ${endPage} of ${totalPages}`)

    // Check if we need to write files (Node.js only)
    const shouldWriteFiles = options.outputDir && typeof process !== 'undefined' && process.versions && process.versions.node

    if (shouldWriteFiles) {
      updateProgress(15, `Preparing output directory: ${options.outputDir}`)
      console.log(`📁 Output directory: ${options.outputDir}`)
    }

    // Default options
    const imageWidth = options.imageWidth ?? 1200
    const imageQuality = options.imageQuality ?? 90

    const screenshots: ScreenshotPageResult[] = []
    const totalPagesToProcess = endPage - startPage + 1

    // Generate screenshots for each page
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      const pageIndex = pageNum - startPage
      const progressPercentage = 15 + Math.round((pageIndex / totalPagesToProcess) * 80) // 15% to 95%
      
      updateProgress(progressPercentage, `Processing page ${pageNum}/${endPage}...`)
      console.log(`📸 Processing page ${pageNum}/${endPage}...`)

      try {
        // Get PDF page
        const pdfPage = await pdfDocument.getPage(pageNum)
        console.log(`📄 Page ${pageNum} loaded successfully`)

        const viewport = pdfPage.rawProxy.getViewport({ scale: 1 })
        console.log(`📐 Page ${pageNum} viewport:`, {
          width: viewport.width,
          height: viewport.height
        })

        // Validate page content (missing feature from original)
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
            pdfPage.rawProxy,
            pdfDocument.rawProxy,
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
          
          // Notify error callback
          notifyError(errorMessage, pageIndex)

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
        
        // Notify error callback
        notifyError(errorMessage, pageIndex)

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
    
    updateProgress(100, `Screenshot generation completed: ${successCount}/${screenshots.length} pages successful`)
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
