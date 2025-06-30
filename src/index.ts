// Main API
export { decomposePdf } from './api/decomposePdf.js'
export type { DecomposeOptions } from './api/decomposePdf.js'

// Core classes
export * from './core/PdfDocument.js'
export * from './core/PdfOperator.js'
export * from './core/PdfOperatorList.js'
export * from './core/PdfOperatorSelection.js'
export * from './core/PdfOperatorTransforms.js'
export * from './core/PdfPage.js'
export * from './core/PdfTextEvaluator.js'
export * from './core/PdfUtil.js'

// Models and types
export * from './models/PdfElement.js'
export * from './models/PdfPageContent.js'
export type {
  BoundingBox, FontInfo, ImageData, InvalidPdfError, MemoryError, PdfProcessingError, RenderOptions
} from './types/pdf.types.js'

// Utilities
export { CanvasManager } from './utils/CanvasManager.js'
export { Logger, logger } from './utils/Logger.js'
export { ValidationUtils } from './utils/ValidationUtils.js'

// Configuration
export { ENV_CONFIG, PDF_CONFIG } from './config/constants.js'

