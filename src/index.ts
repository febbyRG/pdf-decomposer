// Main API (Buffer-based, works in both Node.js and browser)
export * from './api/decomposePdf.js'
export * from './api/screenshotPdf.js'

// Core classes (Node.js environment)
export * from './core/PdfDocument.js'
export * from './core/PdfOperator.js'
export * from './core/PdfOperatorList.js'
export * from './core/PdfOperatorSelection.js'
export * from './core/PdfOperatorTransforms.js'
export * from './core/PdfPage.js'
export * from './core/PdfTextEvaluator.js'
export * from './core/PdfUtil.js'

// Advanced Image Extraction (Enhanced from BC Editor)
export { PdfImageExtractor } from './core/PdfImageExtractor.js'
export type { ExtractedImage } from './core/PdfImageExtractor.js'

// Models and types
export * from './models/PdfElement.js'
export * from './models/PdfPageContent.js'
export type {
  BoundingBox, FontInfo, ImageData, InvalidPdfError, MemoryError, PdfProcessingError, RenderOptions
} from './types/pdf.types.js'

// Utilities
export { Logger, logger } from './utils/Logger.js'
export { MemoryManager } from './utils/MemoryManager.js'
export { ValidationUtils } from './utils/ValidationUtils.js'

// Configuration
export { ENV_CONFIG, PDF_CONFIG } from './config/constants.js'

