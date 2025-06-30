import { createCanvas } from 'canvas'
import { CanvasLike, MemoryError } from '../types/pdf.types.js'
import { MemoryManager } from './MemoryManager.js'

/**
 * Utility class for managing canvas operations with proper memory cleanup
 */
export class CanvasManager {
  private static readonly MAX_CANVAS_SIZE = 4096
  private static readonly DEFAULT_JPEG_QUALITY = 40 // Reduced for memory safety
  private static readonly DEFAULT_PNG_QUALITY = 60  // Reduced for memory safety
  private static readonly MEMORY_SAFE_QUALITY = 30  // For high memory pressure

  /**
   * Creates a canvas with memory-safe dimensions
   */
  static createSafeCanvas(width: number, height: number): CanvasLike {
    const safeWidth = Math.min(width, this.MAX_CANVAS_SIZE)
    const safeHeight = Math.min(height, this.MAX_CANVAS_SIZE)

    if (safeWidth <= 0 || safeHeight <= 0) {
      throw new MemoryError(`Invalid canvas dimensions: ${width}x${height}`)
    }

    try {
      return createCanvas(safeWidth, safeHeight)
    } catch (error) {
      throw new MemoryError(
        `Failed to create canvas ${safeWidth}x${safeHeight}: ${(error as Error).message}`
      )
    }
  }

  /**
   * Safely converts canvas to buffer with memory cleanup and adaptive quality
   */
  static async canvasToBuffer(
    canvas: CanvasLike,
    type: 'image/jpeg' | 'image/png' = 'image/jpeg',
    quality?: number
  ): Promise<Buffer> {
    try {
      // Use adaptive quality based on memory pressure
      let actualQuality = quality
      if (actualQuality === undefined) {
        if (MemoryManager.isMemoryCritical()) {
          actualQuality = this.MEMORY_SAFE_QUALITY
        } else {
          actualQuality = type === 'image/jpeg' ? this.DEFAULT_JPEG_QUALITY : this.DEFAULT_PNG_QUALITY
        }
      }

      const buffer = canvas.toBuffer(type, { quality: actualQuality })

      // Clean up canvas to help garbage collection
      this.cleanupCanvas(canvas)

      return buffer
    } catch (error) {
      this.cleanupCanvas(canvas)
      throw new MemoryError(`Failed to convert canvas to buffer: ${(error as Error).message}`)
    }
  }

  /**
   * Safely cleanup canvas resources
   */
  static cleanupCanvas(canvas: CanvasLike): void {
    try {
      // Reset canvas dimensions to free memory
      canvas.width = 0
      canvas.height = 0
    } catch (error) {
      // Ignore cleanup errors
      console.warn('Canvas cleanup warning:', error)
    }
  }

  /**
   * Execute canvas operation with automatic cleanup
   */
  static async withCanvas<T>(
    width: number,
    height: number,
    operation: (canvas: CanvasLike, context: any) => Promise<T>
  ): Promise<T> {
    const canvas = this.createSafeCanvas(width, height)

    try {
      const context = (canvas as any).getContext('2d')
      return await operation(canvas, context)
    } finally {
      this.cleanupCanvas(canvas)
    }
  }
}
