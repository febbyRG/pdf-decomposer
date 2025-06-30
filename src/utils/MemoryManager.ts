/**
 * Memory Management Utility
 * Provides memory monitoring, garbage collection triggering, and memory pressure handling
 */

export interface MemoryStats {
  used: number
  total: number
  external: number
  percentUsed: number
}

export interface MemoryOptions {
  maxMemoryMB?: number
  gcThresholdMB?: number
  aggressiveCleanup?: boolean
}

export class MemoryManager {
  private static readonly DEFAULT_MAX_MEMORY = 512 // MB
  private static readonly DEFAULT_GC_THRESHOLD = 256 // MB
  private static readonly CRITICAL_MEMORY_THRESHOLD = 0.85 // 85%

  /**
   * Get current memory usage statistics
   */
  static getMemoryStats(): MemoryStats {
    const usage = process.memoryUsage()
    const used = Math.round(usage.heapUsed / 1024 / 1024)
    const total = Math.round(usage.heapTotal / 1024 / 1024)
    const external = Math.round(usage.external / 1024 / 1024)

    return {
      used,
      total,
      external,
      percentUsed: Math.round((used / total) * 100)
    }
  }

  /**
   * Check if memory usage is critical
   */
  static isMemoryCritical(maxMemoryMB = MemoryManager.DEFAULT_MAX_MEMORY): boolean {
    const stats = MemoryManager.getMemoryStats()
    const criticalThreshold = maxMemoryMB * MemoryManager.CRITICAL_MEMORY_THRESHOLD
    return stats.used > criticalThreshold
  }

  /**
   * Force garbage collection if available
   */
  static forceGarbageCollection(): void {
    if (global.gc) {
      global.gc()
    }
  }

  /**
   * Clean up memory aggressively
   */
  static async cleanupMemory(): Promise<void> {
    // Force garbage collection
    MemoryManager.forceGarbageCollection()

    // Give the GC a chance to run
    await new Promise(resolve => setImmediate(resolve))

    // Force another GC cycle
    MemoryManager.forceGarbageCollection()
  }

  /**
   * Monitor memory and cleanup if needed
   */
  static async checkAndCleanupMemory(options: MemoryOptions = {}): Promise<boolean> {
    const {
      maxMemoryMB = MemoryManager.DEFAULT_MAX_MEMORY,
      gcThresholdMB = MemoryManager.DEFAULT_GC_THRESHOLD,
      aggressiveCleanup = false
    } = options

    const beforeStats = MemoryManager.getMemoryStats()

    // Check if we need cleanup
    const needsCleanup = beforeStats.used > gcThresholdMB ||
      MemoryManager.isMemoryCritical(maxMemoryMB)

    if (needsCleanup) {
      if (aggressiveCleanup) {
        await MemoryManager.cleanupMemory()
      } else {
        MemoryManager.forceGarbageCollection()
      }

      const afterStats = MemoryManager.getMemoryStats()
      const memoryFreed = beforeStats.used - afterStats.used

      console.log(`🧹 Memory cleanup: ${beforeStats.used}MB → ${afterStats.used}MB (freed ${memoryFreed}MB)`)

      return memoryFreed > 0
    }

    return false
  }

  /**
   * Execute a function with memory monitoring
   */
  static async withMemoryMonitoring<T>(
    operation: () => Promise<T>,
    options: MemoryOptions = {}
  ): Promise<T> {
    const beforeStats = MemoryManager.getMemoryStats()

    try {
      const result = await operation()

      // Cleanup after operation
      await MemoryManager.checkAndCleanupMemory(options)

      return result
    } catch (error) {
      // Emergency cleanup on error
      await MemoryManager.cleanupMemory()
      throw error
    } finally {
      const afterStats = MemoryManager.getMemoryStats()

      if (afterStats.used > beforeStats.used + 50) { // More than 50MB increase
        console.warn(`⚠️  Memory increase detected: ${beforeStats.used}MB → ${afterStats.used}MB`)
      }
    }
  }

  /**
   * Get adaptive image quality based on memory pressure
   */
  static getAdaptiveImageQuality(pageCount: number, currentPage: number): number {
    const baseQuality = 0.7

    // Reduce quality for large documents
    if (pageCount > 50) {
      return Math.max(0.3, baseQuality - 0.3)
    } else if (pageCount > 20) {
      return Math.max(0.4, baseQuality - 0.2)
    }

    // Reduce quality as we process more pages
    const progressPenalty = (currentPage / pageCount) * 0.2
    return Math.max(0.4, baseQuality - progressPenalty)
  }

  /**
   * Get adaptive image scale based on memory pressure
   */
  static getAdaptiveImageScale(pageCount: number, _currentPage: number): number {
    const baseScale = 1.0

    // Scale down for large documents
    if (pageCount > 50) {
      return 0.5
    } else if (pageCount > 20) {
      return 0.7
    }

    // Check current memory pressure
    if (MemoryManager.isMemoryCritical()) {
      return 0.5
    }

    return baseScale
  }
}
