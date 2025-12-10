/**
 * Core PDF screenshot functionality
 * Accepts pre-loaded PdfDocument to avoid duplicate loading
 */

import { PdfDocument } from './PdfDocument.js'
import { PageRenderer } from '../utils/PageRenderer.js'
import { MemoryManager } from '../utils/MemoryManager.js'
import { InvalidPdfError, PdfProcessingError } from '../types/pdf.types.js'
import type { ScreenshotOptions, ScreenshotPageResult, ScreenshotResult } from '../types/screenshot.types.js'
import type { PdfDecomposerState, PdfDecomposerError } from '../types/decomposer.types.js'

/**
 * Generate screenshots for PDF pages using pre-loaded PdfDocument
 * Optimized for memory efficiency on large documents
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
    
    // Check if we need to write files (Node.js only)
    const shouldWriteFiles = options.outputDir && typeof process !== 'undefined' && process.versions && process.versions.node

    if (shouldWriteFiles) {
      updateProgress(15, `Preparing output directory: ${options.outputDir}`)
    }

    // Default options - reduced for memory efficiency
    const imageWidth = options.imageWidth ?? 1024  // Reduced from 1200
    const imageQuality = options.imageQuality ?? 85 // Reduced from 90

    const screenshots: ScreenshotPageResult[] = []
    const totalPagesToProcess = endPage - startPage + 1
    
    // Determine if this is a large document requiring aggressive memory management
    const isLargeDocument = totalPagesToProcess > 20
    const cleanupInterval = isLargeDocument ? 3 : 10 // Cleanup every 3 pages for large docs

    // Generate screenshots for each page
    for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
      const pageIndex = pageNum - startPage
      const progressPercentage = 15 + Math.round((pageIndex / totalPagesToProcess) * 80) // 15% to 95%
      
      updateProgress(progressPercentage, `Processing page ${pageNum}/${endPage}...`)

      try {
        // Get PDF page
        const pdfPage = await pdfDocument.getPage(pageNum)

        const viewport = pdfPage.rawProxy.getViewport({ scale: 1 })

        // Skip text content validation for large documents to save memory
        if (!isLargeDocument) {
          try {
            await pdfPage.getTextContent()
          } catch (textError) {
            console.warn(`⚠️ Could not get text content for page ${pageNum}:`, textError)
          }
        }

        try {
          // Generate page screenshot as base64
          // Use lower scale for large documents to reduce memory
          const effectiveScale = isLargeDocument 
            ? Math.min(imageWidth / viewport.width, 1.0) // Cap at 1.0 for large docs
            : imageWidth / viewport.width

          const screenshotResult = await PageRenderer.renderPageToBase64(
            pdfPage.rawProxy,
            pdfDocument.rawProxy,
            {
              quality: imageQuality,
              scale: effectiveScale
            }
          )

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
              
              // Clear base64 data after writing to file to save memory
              if (isLargeDocument) {
                pageResult.screenshot = '' // Clear to free memory
              }
            } catch (fileError) {
              console.warn(`⚠️ Failed to write file for page ${pageNum}: ${(fileError as Error).message}`)
              // Don't fail the entire operation if file writing fails
            }
          }

          screenshots.push(pageResult)
          
          // Memory cleanup for large documents
          if (isLargeDocument && (pageIndex + 1) % cleanupInterval === 0) {
            await MemoryManager.cleanupMemory()
          }

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
