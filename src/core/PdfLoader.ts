import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js'
import { InvalidPdfError } from '../types/pdf.types.js'
import { PdfWorkerConfig } from './PdfWorkerConfig.js'

/**
 * Centralized PDF document loading utilities
 * Used by multiple APIs to eliminate duplicate loading logic
 */
export class PdfLoader {
  // Store the canvasFactory for later use
  static nodeCanvasFactory: any = null
  
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

      // Set up proper Node.js factories for server-side rendering
      const loadingParams: any = {
        data: pdfData,
        disableFontFace: true, // Force use of Canvas registered fonts instead of PDF embedded fonts
        verbosity: 0 // Reduce console noise
      }

      try {
        // Setup Node.js specific factories for server-side rendering
        if (typeof process !== 'undefined' && process.versions?.node) {
          console.log('🔧 Setting up Node.js factories for server-side rendering...')
          
          // Use dynamic import for optional Node.js canvas factory
          const nodeCanvas = await import('canvas').catch(() => null)
          
          if (nodeCanvas) {
            console.log('🖼️ Node.js Canvas available, creating NodeCanvasFactory')
            
            // Register fonts FIRST (following official examples)
            console.log('🔤 Registering system fonts...')
            try {
              nodeCanvas.registerFont('/System/Library/Fonts/ArialHB.ttc', { family: 'Arial' })
              console.log('✅ Arial registered')
            } catch (e) {
              console.log('⚠️ Arial failed:', String(e))
            }
            
            try {
              nodeCanvas.registerFont('/System/Library/Fonts/Helvetica.ttc', { family: 'Helvetica' })
              console.log('✅ Helvetica registered')
            } catch (e) {
              console.log('⚠️ Helvetica failed:', String(e))
            }
            
            try {
              nodeCanvas.registerFont('/System/Library/Fonts/Times.ttc', { family: 'Times' })
              console.log('✅ Times registered')
            } catch (e) {
              console.log('⚠️ Times failed:', String(e))
            }
            
            // Simple NodeCanvasFactory (following PDF.js official examples)
            class NodeCanvasFactory {
              create(width: number, height: number) {
                if (!nodeCanvas) {
                  throw new Error('Node Canvas not available')
                }
                const canvas = nodeCanvas.createCanvas(width, height)
                const context = canvas.getContext('2d')
                return { canvas, context }
              }
              
              reset(canvasAndContext: any, width: number, height: number) {
                canvasAndContext.canvas.width = width
                canvasAndContext.canvas.height = height
              }
              
              destroy(canvasAndContext: any) {
                canvasAndContext.canvas.width = 0
                canvasAndContext.canvas.height = 0
                canvasAndContext.canvas = null
                canvasAndContext.context = null
              }
            }
            
            // Set up Node.js canvas factory in loading params
            loadingParams.canvasFactory = new NodeCanvasFactory()
            
            // Also store it statically for later access
            PdfLoader.nodeCanvasFactory = loadingParams.canvasFactory
            console.log('✅ NodeCanvasFactory configured for enhanced server-side rendering')
          } else {
            console.log('📦 Node.js Canvas not available, PDF.js will use default factories')
          }
        }
      } catch (factoryError) {
        console.warn('⚠️ Node.js factory setup failed, using default setup:', factoryError)
      }

      // PDF.js document loading - it will automatically set up appropriate factories
      const loadingTask = pdfjsLib.getDocument(loadingParams)

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
