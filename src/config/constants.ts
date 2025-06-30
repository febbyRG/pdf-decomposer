/**
 * Configuration constants for PDF decomposition
 */
export const PDF_CONFIG = {
  // Memory and performance limits
  MAX_CANVAS_WIDTH: 4096,
  MAX_CANVAS_HEIGHT: 4096,
  DEFAULT_MAX_WIDTH: 1024,
  MEMORY_SAFE_PAGE_LIMIT: 50,
  GC_INTERVAL_PAGES: 10,

  // Image quality defaults
  JPEG_QUALITY: {
    HIGH: 85,
    MEDIUM: 60,
    LOW: 40,
    DEFAULT: 60
  },

  PNG_QUALITY: {
    HIGH: 95,
    MEDIUM: 90,
    LOW: 80,
    DEFAULT: 90
  },

  // Thumbnail settings
  THUMBNAIL: {
    MAX_WIDTH: 200,
    SCALE_FACTOR: 0.2,
    QUALITY: 50
  },

  // File size limits (bytes)
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB

  // Error messages
  ERRORS: {
    INVALID_FILE_PATH: 'File path must be a non-empty string',
    FILE_NOT_FOUND: 'PDF file not found',
    FILE_TOO_LARGE: 'PDF file is too large',
    INVALID_PAGE_NUMBER: 'Page number must be a positive integer',
    MEMORY_ERROR: 'Insufficient memory for operation',
    INVALID_PDF: 'Invalid or corrupted PDF file',
    PROCESSING_FAILED: 'PDF processing failed'
  }
} as const

/**
 * Environment-specific configuration
 */
export const ENV_CONFIG = {
  // Node.js memory constraints
  isLowMemory: process.env.NODE_ENV === 'production' ||
    parseInt(process.env.MAX_OLD_SPACE_SIZE || '0') < 2048,

  // Debug mode
  isDebug: process.env.NODE_ENV === 'development' ||
    process.env.DEBUG === 'true',

  // Concurrent processing limits
  maxConcurrentPages: parseInt(process.env.MAX_CONCURRENT_PAGES || '1'),

  // Output format preferences
  preferWebP: process.env.PREFER_WEBP === 'true',

  // Logging level
  logLevel: process.env.LOG_LEVEL || 'info'
} as const
