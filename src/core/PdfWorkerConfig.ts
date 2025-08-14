import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js'

/**
 * Shared PDF.js worker configuration (based on original implementation)
 */
export class PdfWorkerConfig {
  /**
   * Configure PDF.js worker settings
   */
  static configure(): void {
    // Configure PDF.js worker for browser environments (from original implementation)
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
    } else {
      // Node.js environment - use local worker
      pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js')
      console.log('🔧 PDF.js worker configured for Node.js')
    }
    
    console.log('🔧 PDF.js worker configured')
  }
}