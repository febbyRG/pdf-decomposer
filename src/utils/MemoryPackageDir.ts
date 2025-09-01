/**
 * Memory-only package directory (no file system operations)
 * Implements the same interface as the original MemoryPackageDir
 */
export class MemoryPackageDir {
  public readonly dir: string

  constructor(outputDir = '.') {
    this.dir = outputDir
  }

  async create(): Promise<void> {
    // No-op: In memory mode, no directory creation needed
  }

  async exists(): Promise<boolean> {
    return true // Always exists in memory mode
  }
}
