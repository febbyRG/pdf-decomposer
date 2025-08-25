// Enhanced Class-based API (Load once, use many times)
export { PdfDecomposer } from './api/PdfDecomposer.js'

// Core classes (Node.js environment)
export * from './core/PdfDocument.js'
export * from './core/PdfOperator.js'
export * from './core/PdfOperatorList.js'
export * from './core/PdfOperatorSelection.js'
export * from './core/PdfOperatorTransforms.js'
export * from './core/PdfPage.js'
export * from './core/PdfTextEvaluator.js'
export * from './core/PdfUtil.js'

// Shared utilities for enhanced API
export { PdfLoader } from './core/PdfLoader.js'
export { PdfWorkerConfig } from './core/PdfWorkerConfig.js'

// Advanced Image Extraction (Enhanced from BC Editor)
export { PdfImageExtractor } from './core/PdfImageExtractor.js'
export type { ExtractedImage } from './types/image.types.js'

// Models and types
export * from './models/PdfElement.js'
export * from './models/PdfPageContent.js'
export type {
  BoundingBox, FontInfo, ImageData, InvalidPdfError, MemoryError, PdfProcessingError, RenderOptions
} from './types/pdf.types.js'
export type {
  PdfDecomposerOptions, PdfDecomposerState, PdfDecomposerError, PdfCleanComposerOptions
} from './types/decomposer.types.js'

// Utilities
export { Logger, logger } from './utils/Logger.js'
export { MemoryManager } from './utils/MemoryManager.js'
export { ValidationUtils } from './utils/ValidationUtils.js'
export { MemoryPackageDir } from './utils/MemoryPackageDir.js'

// PDF Data Generator for pwa-admin compatibility
export { PdfDataGenerator, generatePdfData } from './core/PdfDataGenerator.js'
export type { PdfData, PdfArea, PdfDataGeneratorOptions } from './core/PdfDataGenerator.js'

// Configuration
export { ENV_CONFIG, PDF_CONFIG } from './config/constants.js'

