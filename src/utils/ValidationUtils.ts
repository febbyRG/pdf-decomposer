import { InvalidPdfError } from '../types/pdf.types.js'

/**
 * Validation utilities for PDF processing
 */
export class ValidationUtils {
  /**
   * Validates file path exists and is readable
   */
  static validateFilePath(filePath: string): void {
    if (!filePath || typeof filePath !== 'string') {
      throw new InvalidPdfError('File path must be a non-empty string')
    }

    if (!filePath.trim()) {
      throw new InvalidPdfError('File path cannot be empty')
    }
  }

  /**
   * Validates page number
   */
  static validatePageNumber(pageNumber: number, totalPages: number): void {
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new InvalidPdfError('Page number must be a positive integer')
    }

    if (pageNumber > totalPages) {
      throw new InvalidPdfError(`Page number ${pageNumber} exceeds total pages ${totalPages}`)
    }
  }

  /**
   * Validates render options
   */
  static validateRenderOptions(options: { width?: number; quality?: number }): void {
    if (options.width !== undefined) {
      if (!Number.isFinite(options.width) || options.width <= 0) {
        throw new InvalidPdfError('Width must be a positive number')
      }
      if (options.width > 8192) {
        throw new InvalidPdfError('Width cannot exceed 8192 pixels for memory safety')
      }
    }

    if (options.quality !== undefined) {
      if (!Number.isFinite(options.quality) || options.quality < 1 || options.quality > 100) {
        throw new InvalidPdfError('Quality must be between 1 and 100')
      }
    }
  }

  /**
   * Validates object ID
   */
  static validateObjectId(objectId: string): void {
    if (!objectId || typeof objectId !== 'string') {
      throw new InvalidPdfError('Object ID must be a non-empty string')
    }
  }

  /**
   * Validates bounding box
   */
  static validateBoundingBox(bbox: any): boolean {
    return (
      bbox &&
      typeof bbox.left === 'number' &&
      typeof bbox.right === 'number' &&
      typeof bbox.top === 'number' &&
      typeof bbox.bottom === 'number' &&
      bbox.left <= bbox.right &&
      bbox.top <= bbox.bottom
    )
  }

  /**
   * Safely gets numeric value with fallback
   */
  static safeNumber(value: any, fallback = 0): number {
    return Number.isFinite(value) ? value : fallback
  }

  /**
   * Safely gets string value with fallback
   */
  static safeString(value: any, fallback = ''): string {
    return typeof value === 'string' ? value : fallback
  }
}
