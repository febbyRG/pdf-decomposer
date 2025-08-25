import { PdfDocument } from '../core/PdfDocument.js'
import { PdfLoader } from '../core/PdfLoader.js'
import { PdfWorkerConfig } from '../core/PdfWorkerConfig.js'
import { PdfProcessingError } from '../types/pdf.types.js'
import type {
  PdfDecomposerOptions,
  PdfDecomposerState,
  PdfDecomposerError
} from '../types/decomposer.types.js'
import type { DecomposeResult } from '../types/decompose.types.js'
import type { DataOptions, DataResult } from '../types/data.types.js'
import '../utils/DOMMatrixPolyfill.js'

// Import types only from core modules
import type { ScreenshotOptions, ScreenshotResult } from '../types/screenshot.types.js'

// Configure PDF.js worker for browser environments
PdfWorkerConfig.configure()

/**
 * Enhanced PDF Decomposer Class - Load Once, Use Many Times
 * 
 * Provides a unified interface for PDF processing operations:
 * - Load PDF once, use multiple times
 * - Decompose PDF to extract text, images, and structure
 * - Generate page screenshots
 * - Memory efficient and universal (Node.js + Browser)
 * 
 * @example
 * ```typescript
 * // Basic usage
 * const pdf = new PdfDecomposer(buffer)
 * await pdf.initialize()
 * 
 * // Multiple operations on same PDF
 * const pages = await pdf.decompose({ elementComposer: true })
 * const screenshots = await pdf.screenshot({ imageWidth: 1024 })
 * 
 * // Access PDF info
 * console.log(`Pages: ${pdf.numPages}, Fingerprint: ${pdf.fingerprint}`)
 * ```
 */
export class PdfDecomposer {
  private pdfDocument: PdfDocument | null = null
  private buffer: Buffer | ArrayBuffer | Uint8Array
  private isInitialized = false
  
  // Observable pattern for progress tracking
  private observable: Array<(state: PdfDecomposerState) => void> = []
  private currentProgress = 0
  public decomposeError: Array<(error: PdfDecomposerError) => void> = []

  // Backward compatibility properties for PdfDecomposerPage
  public get pdfDoc(): PdfDocument {
    if (!this.pdfDocument) {
      throw new PdfProcessingError('PDF not initialized')
    }
    return this.pdfDocument
  }

  /**
   * Create a new PDF decomposer instance
   * @param input PDF buffer (Buffer, ArrayBuffer, or Uint8Array)
   */
  constructor(input: Buffer | ArrayBuffer | Uint8Array) {
    this.buffer = input
  }

  /**
   * Factory method to create and initialize PDF decomposer in one step
   * @param input PDF buffer (Buffer, ArrayBuffer, or Uint8Array)
   * @returns Promise resolving to initialized PdfDecomposer instance
   */
  static async create(input: Buffer | ArrayBuffer | Uint8Array): Promise<PdfDecomposer> {
    const decomposer = new PdfDecomposer(input)
    await decomposer.initialize()
    return decomposer
  }

  /**
   * Initialize the PDF document by loading and processing it
   * This must be called before using decompose() or screenshot()
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('📄 PDF already initialized')
      return
    }

    try {
      this.update('Loading ...', 0, 0)
      this.currentProgress = 0
      console.log('🚀 Initializing PDF decomposer...')

      // Load PDF document
      this.update('Preparing your PDF...', 0, 10)
      const pdfProxy = await PdfLoader.loadFromBuffer(this.buffer)
      
      // Create PdfDocument instance
      this.pdfDocument = new PdfDocument(pdfProxy)
      
      // Process all pages to load document structure
      await this.pdfDocument.process((progress) => {
        const processingProgress = 10 + (progress.loaded / progress.total) * 10 // 10% to 20%
        this.update(`Processing pages: ${progress.loaded}/${progress.total}`, processingProgress, processingProgress)
        console.log(`📖 Processing pages: ${progress.loaded}/${progress.total}`)
      })

      this.isInitialized = true
      console.log(`✅ PDF initialization completed: ${this.numPages} pages loaded`)

    } catch (error) {
      console.error('❌ PDF initialization failed:', error)
      this.notify({ progress: 0, message: 'PDF initialization failed', processing: false })
      throw error
    }
  }

  /**
   * Decompose PDF to extract content and structure
   * @param options Optional configuration for decomposition
   * @returns Promise resolving to array of PdfPageContent or PdfData objects based on options.pdfData
   */
  async decompose(options: PdfDecomposerOptions = {}): Promise<DecomposeResult> {
    this.ensureInitialized()
    
    // Validate page range like original implementation
    if (options.startPage !== undefined && options.startPage < 1) {
      throw new Error('startPage must be 1 or greater')
    }
    
    if (options.endPage !== undefined && options.endPage < 1) {
      throw new Error('endPage must be 1 or greater')
    }
    
    if (options.startPage !== undefined && options.endPage !== undefined && options.startPage > options.endPage) {
      throw new Error('startPage must be less than or equal to endPage')
    }
    
    try {
      console.log('🔍 Starting PDF decomposition using enhanced API...')
      
      // Use core decompose logic with already loaded PdfDocument and pass callbacks
      const { pdfDecompose } = await import('../core/PdfDecompose.js')
      return await pdfDecompose(
        this.pdfDocument as PdfDocument, 
        options,
        (state) => this.notify(state), // Pass progress callback
        (error) => this.notifyDecomposeError(error) // Pass error callback
      )
      
    } catch (error) {
      console.error('❌ Decomposition failed:', error)
      throw error // Re-throw to preserve error type
    }
  }

  /**
   * Generate screenshots for PDF pages
   * @param options Optional configuration for screenshot generation
   * @returns Promise resolving to ScreenshotResult object
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    this.ensureInitialized()
    
    try {
      console.log('📸 Starting PDF screenshot generation using enhanced API...')
      
      // Use core screenshot logic with already loaded PdfDocument and pass callbacks
      const { pdfScreenshot } = await import('../core/PdfScreenshot.js')
      return await pdfScreenshot(
        this.pdfDocument as PdfDocument, 
        options,
        (state) => this.notify(state),
        (error) => this.notifyDecomposeError(error)
      )
      
    } catch (error) {
      console.error('❌ Screenshot generation failed:', error)
      throw error
    }
  }

  /**
   * Generate pdfData structure compatible with pwa-admin
   * @param options Optional configuration for pdfData generation
   * @returns Promise resolving to DataResult with pdfData and pages
   */
  async data(options: DataOptions = {}): Promise<DataResult> {
    this.ensureInitialized()
    
    try {
      console.log('📊 Starting PDF data generation using enhanced API...')
      
      // Use core data logic with already loaded PdfDocument and pass callbacks
      const { pdfData } = await import('../core/PdfDataGenerator.js')
      return await pdfData(
        this.pdfDocument as PdfDocument, 
        options,
        (state) => this.notify(state),
        (error) => this.notifyDecomposeError(error)
      )
      
    } catch (error) {
      console.error('❌ Data generation failed:', error)
      throw error
    }
  }

  /**
   * Get total number of pages in the PDF
   */
  get numPages(): number {
    this.ensureInitialized()
    return this.pdfDocument?.numPages ?? 0
  }

  /**
   * Get PDF document fingerprint for caching
   */
  get fingerprint(): string | undefined {
    this.ensureInitialized()
    return this.pdfDocument?.fingerprint
  }

  /**
   * Check if PDF is initialized
   */
  get initialized(): boolean {
    return this.isInitialized
  }

  /**
   * Ensure PDF is initialized before operations
   */
  private ensureInitialized(): void {
    if (!this.isInitialized || !this.pdfDocument) {
      throw new PdfProcessingError(
        'PDF not initialized. Call initialize() first or use PdfDecomposer.create() factory method.'
      )
    }
  }

  /**
   * Update progress with message
   */
  private update(message: string, startProgress = this.currentProgress, endProgress = startProgress, event?: any) {
    const progressDelta = endProgress - startProgress
    const progress =
      startProgress + (event ? (event.loaded / event.total) * progressDelta : progressDelta)
    if (progress < this.currentProgress) {
      return
    }
    this.currentProgress = progress
    this.notify({ progress, message, processing: true })
  }

  /**
   * Subscribe to progress updates
   */
  subscribe(fn: (state: PdfDecomposerState) => void) {
    this.observable.push(fn)
  }

  /**
   * Notify progress observers
   */
  private notify(state: PdfDecomposerState) {
    for (const fn of this.observable) fn(state)
  }

  /**
   * Notify decompose error observers
   */
  private notifyDecomposeError(error: PdfDecomposerError) {
    for (const fn of this.decomposeError) fn(error)
  }

  /**
   * Get PDF and page fingerprints
   */
  async getFingerprints() {
    this.ensureInitialized()
    const pdfHash = this.pdfDocument?.fingerprint
    const total = this.pdfDocument?.numPages ?? 0
    const pageHashes: string[] = []
    for (let index = 0; index < total; index++) {
      const page = await this.pdfDocument?.getPage(index + 1)
      if (page) {
        pageHashes.push(page.fingerprint)
      }
    }
    return { pdfHash, pageHashes, total }
  }
}
