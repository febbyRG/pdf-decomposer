import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js'
import { InvalidPdfError } from '../types/pdf.types.js'
import { PdfWorkerConfig } from './PdfWorkerConfig.js'

/**
 * Centralized PDF document loading utilities
 * Used by multiple APIs to eliminate duplicate loading logic
 */
export class PdfLoader {
  /**
   * Load PDF document from buffer with validation
   * @param input PDF buffer (Buffer, ArrayBuffer, or Uint8Array)
   * @returns Promise resolving to PDFDocumentProxy
   */
  static async loadFromBuffer(input: Buffer | ArrayBuffer | Uint8Array): Promise<any> {
    // Validate input
    this.validateInput(input)

    // Configure PDF.js worker
    PdfWorkerConfig.configure()

    try {
      console.log('📄 Loading PDF document...')
      
      // Convert to Uint8Array for PDF.js compatibility (same as original implementation)
      let pdfData: Uint8Array
      if (input instanceof ArrayBuffer) {
        pdfData = new Uint8Array(input)
      } else if (input instanceof Uint8Array) {
        pdfData = input
      } else if ((input as any)?.constructor?.name === 'Buffer') {
        // Handle Buffer without importing Node.js types (same as original)
        pdfData = new Uint8Array(input as any)
      } else {
        throw new InvalidPdfError('Input must be Buffer, ArrayBuffer, or Uint8Array')
      }

      // Use same configuration as original implementation
      const loadingTask = pdfjsLib.getDocument({
        data: pdfData,
        disableFontFace: false,
        verbosity: 0 // Reduce console noise
      })

      const pdfDoc = await loadingTask.promise
      console.log(`✅ PDF loaded: ${pdfDoc.numPages} pages`)
      
      return pdfDoc

    } catch (error) {
      console.error('❌ Failed to load PDF:', error)
      
      if (error instanceof Error) {
        if (error.message.includes('Invalid PDF')) {
          throw new InvalidPdfError(`Invalid PDF format: ${error.message}`)
        }
        throw new InvalidPdfError(`PDF loading failed: ${error.message}`)
      }
      
      throw new InvalidPdfError(`PDF loading failed: ${String(error)}`)
    }
  }

  /**
   * Validate input buffer
   */
  private static validateInput(input: any): void {
    if (!input) {
      throw new InvalidPdfError('PDF input is required')
    }

    // Check if input is valid buffer type
    const isValidBuffer = input instanceof Buffer || 
                         input instanceof ArrayBuffer || 
                         input instanceof Uint8Array

    if (!isValidBuffer) {
      throw new InvalidPdfError('Invalid PDF buffer format. Expected Buffer, ArrayBuffer, or Uint8Array')
    }

    // Handle length check for different buffer types
    let bufferSize: number
    if (input instanceof ArrayBuffer) {
      bufferSize = input.byteLength
    } else {
      bufferSize = input.length
    }

    if (bufferSize === 0) {
      throw new InvalidPdfError('PDF buffer is empty')
    }

    console.log(`📊 PDF buffer size: ${bufferSize} bytes`)
  }
}
