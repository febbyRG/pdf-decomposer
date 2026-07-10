/**
 * PDF-Decomposer - Universal PDF Processing Library
 *
 * LICENSING NOTICE:
 * This software is dual-licensed:
 * - Non-commercial use: FREE
 * - Commercial use: PAID LICENSE REQUIRED
 *
 * Contact: febby.rachmat@gmail.com for commercial licensing
 * See LICENSE file for complete terms.
 */

// ============================================================================
// PUBLIC API — the intended, stable surface. Everything below the "internals"
// marker further down is exported for backward compatibility only and will be
// trimmed in the next major release.
// ============================================================================

// Class-based API (load once, use many times): decompose / screenshot / data / slice
export { PdfDecomposer } from './api/PdfDecomposer.js'
export type { PdfDecomposerConstructorOptions } from './api/PdfDecomposer.js'

// Operation options and results
export type {
  PdfDecomposerOptions, PdfDecomposerState, PdfDecomposerError, PdfCleanComposerOptions
} from './types/decomposer.types.js'
export type { DataOptions, DataResult, PdfData, PdfArea, PdfDataGeneratorOptions } from './types/data.types.js'
export type {
  BoundingBox, FontInfo, ImageData, InvalidPdfError, MemoryError, PdfProcessingError, RenderOptions
} from './types/pdf.types.js'
export type { ExtractedImage } from './types/image.types.js'

// Output models
export type { PdfElement } from './models/PdfElement.js'
export type { PdfPageContent } from './models/PdfPageContent.js'

// Spread handling (two-page-spread PDFs split into logical pages)
export { spreadCropHalf } from './core/spread/types.js'
export type {
  SpreadHandling, SpreadHalf, SpreadSourceInfo, SpreadDetectionResult, SpreadPageEvidence
} from './core/spread/types.js'

// Pluggable page renderers (e.g. swapping node-canvas with Puppeteer)
export { PuppeteerRenderer } from './utils/PuppeteerRenderer.js'
export type { PuppeteerRendererOptions } from './utils/PuppeteerRenderer.js'
export type {
  PdfPageRenderer, PdfPageRenderOptions, PdfPageRenderResult
} from './types/renderer.types.js'

// Logging: level-gated (default warn; raise with LOG_LEVEL=info|debug)
export { Logger, LogLevel, logger } from './utils/Logger.js'

// ============================================================================
// INTERNALS kept exported for backward compatibility (previously wildcard
// re-exports). Not part of the intended API: prefer PdfDecomposer above.
// These will be removed or narrowed in the next major release.
// ============================================================================

// Low-level document/page machinery
export { PdfDocument } from './core/PdfDocument.js'
export type { PDFDocumentProxy } from './core/PdfDocument.js'
export { PdfPage } from './core/PdfPage.js'
export type { PdfRenderOptions } from './core/PdfPage.js'
export { PdfLoader } from './core/PdfLoader.js'
export { PdfWorkerConfig } from './core/PdfWorkerConfig.js'

// Operator-stream tooling
export { PdfOperator } from './core/PdfOperator.js'
export type { PdfOperatorFilter } from './core/PdfOperator.js'
export { PdfOperatorList } from './core/PdfOperatorList.js'
export type { OPSLookup } from './core/PdfOperatorList.js'
export { PdfOperatorSelection } from './core/PdfOperatorSelection.js'
export type { PdfOperatorSelectionFn } from './core/PdfOperatorSelection.js'
export {
  moveText, paintImageXObject, paintJpegXObject, setCharSpacing,
  setFillRGBColor, setFont, setGState, setLeadingMoveText, showText
} from './core/PdfOperatorTransforms.js'
export type {
  MoveTextOperator, Operators, PaintXObjectOperator, SetFontOperator,
  SetGStateOperator, SetLeadingMoveTextOperator, ShowTextOperator
} from './core/PdfOperatorTransforms.js'
export { PdfTextEvaluator } from './core/PdfTextEvaluator.js'
export type { EvaluatorElement } from './core/PdfTextEvaluator.js'

// Pixel/color helpers
export {
  hexToRgb, parseFontName, rgbToHex,
  transformGrayscaleToRgba, transformImageToArray, transformRgbToRgba
} from './core/PdfUtil.js'
export type { PdfImage } from './core/PdfUtil.js'

// Extraction / generation building blocks (used internally by decompose/data)
export { PdfImageExtractor } from './core/PdfImageExtractor.js'
export { PdfDataGenerator, generatePdfData, pdfData } from './core/PdfDataGenerator.js'

// Utilities and configuration
export { MemoryManager } from './utils/MemoryManager.js'
export { ValidationUtils } from './utils/ValidationUtils.js'
export { MemoryPackageDir } from './utils/MemoryPackageDir.js'
export { ENV_CONFIG, PDF_CONFIG } from './config/constants.js'
