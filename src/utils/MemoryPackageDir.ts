/**
 * Memory-only package directory (no file system operations)
 * Implements the same interface as the original MemoryPackageDir
 */
export class MemoryPackageDir {
  public readonly dir: string

  constructor(outputDir = '.') {
    this.dir = outputDir
    console.log('🧠 Memory package directory initialized (no file system access)')
  }

  async create(): Promise<void> {
    console.log('🧠 Memory mode: skipping directory creation')
  }

  async exists(): Promise<boolean> {
    return true // Always exists in memory mode
  }
}
