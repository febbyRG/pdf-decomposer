export interface PageRenderOptions {
  width?: number
  quality?: number
  scale?: number
}

/**
 * Maximum canvas dimensions to prevent OOM on large pages
 */
const MAX_CANVAS_WIDTH = 1200
const MAX_CANVAS_HEIGHT = 1600
const MAX_CANVAS_PIXELS = MAX_CANVAS_WIDTH * MAX_CANVAS_HEIGHT

/**
 * Encode a node-canvas instance as JPEG with bounded peak memory.
 *
 * Prefers createJPEGStream() (chunked encode through libjpeg), falls back to
 * toBuffer('image/jpeg') for older canvas versions. toBuffer materializes a
 * full GetImageData ArrayBuffer alongside the JPEG output, which under
 * fragmented native heap can fail with "Allocation failed" — exactly the
 * production OOM signature.
 *
 * Quality is taken as a 0..1 fraction. node-canvas's streaming API expects
 * a 0..100 integer; toBuffer's options.quality is 0..1. Normalize so callers
 * don't have to care which path is taken.
 */
async function encodeJpeg(canvas: any, quality: number): Promise<Buffer> {
  const streamQuality = Math.round(quality * 100)

  const stream = typeof canvas.createJPEGStream === 'function'
    ? canvas.createJPEGStream({ quality: streamQuality })
    : (typeof canvas.jpegStream === 'function' ? canvas.jpegStream({ quality: streamQuality }) : null)

  if (stream) {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', (err: Error) => reject(err))
    })
  }

  // Fallback for canvas versions without a streaming API.
  return canvas.toBuffer('image/jpeg', { quality })
}

/**
 * Universal page renderer - Memory optimized
 */
export class PageRenderer {
  private static isBrowser(): boolean {
    return typeof globalThis !== 'undefined' &&
      typeof globalThis.window !== 'undefined' &&
      typeof globalThis.document !== 'undefined'
  }

  private static createCanvas(width: number, height: number): any {
    if (this.isBrowser()) {
      const doc = (globalThis as any).document
      const canvas = doc.createElement('canvas')
      canvas.width = width
      canvas.height = height
      return canvas
    } else {
      return {
        width,
        height,
        getContext: () => ({}),
        toBuffer: () => Buffer.alloc(100)
      }
    }
  }
  
  /**
   * Calculate safe canvas dimensions that won't cause OOM
   */
  private static getSafeCanvasDimensions(
    originalWidth: number, 
    originalHeight: number
  ): { width: number; height: number; scale: number } {
    const pixels = originalWidth * originalHeight
    
    if (pixels <= MAX_CANVAS_PIXELS && 
        originalWidth <= MAX_CANVAS_WIDTH && 
        originalHeight <= MAX_CANVAS_HEIGHT) {
      return { width: originalWidth, height: originalHeight, scale: 1.0 }
    }
    
    // Calculate scale to fit within limits
    const scaleByPixels = Math.sqrt(MAX_CANVAS_PIXELS / pixels)
    const scaleByWidth = MAX_CANVAS_WIDTH / originalWidth
    const scaleByHeight = MAX_CANVAS_HEIGHT / originalHeight
    const finalScale = Math.min(scaleByPixels, scaleByWidth, scaleByHeight)
    
    return {
      width: Math.floor(originalWidth * finalScale),
      height: Math.floor(originalHeight * finalScale),
      scale: finalScale
    }
  }

  static async renderPageToBase64(
    pdfPage: any,
    pdfDocument: any,
    options: PageRenderOptions = {}
  ): Promise<{ width: number; height: number; base64: string }> {
    let { scale = 1.0 } = options

    try {
      if (!pdfPage) {
        throw new Error('Invalid PDF page object')
      }

      // Get initial viewport
      let viewport = pdfPage.getViewport({ scale })
      
      // Validate viewport
      if (!viewport || viewport.width <= 0 || viewport.height <= 0) {
        throw new Error(`Invalid viewport: ${viewport?.width}x${viewport?.height}`)
      }
      
      // Apply safety limits to prevent OOM
      const safeDims = this.getSafeCanvasDimensions(viewport.width, viewport.height)
      if (safeDims.scale < 1.0) {
        // Need to reduce scale for memory safety
        scale = scale * safeDims.scale
        viewport = pdfPage.getViewport({ scale })
      }

      if (this.isBrowser()) {
        // Browser rendering using HTML5 Canvas
        const doc = (globalThis as any).document
        const canvas = doc.createElement('canvas')
        const context = canvas.getContext('2d')

        if (!context) {
          throw new Error('Failed to get 2D context')
        }

        // Set canvas dimensions
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)

        // Clear canvas with white background
        context.fillStyle = 'white'
        context.fillRect(0, 0, canvas.width, canvas.height)

        // Render PDF page to canvas
        const renderContext = {
          canvasContext: context,
          viewport: viewport
        }

        const renderTask = pdfPage.render(renderContext)
        await renderTask.promise

        // Convert to base64
        const dataUrl = canvas.toDataURL('image/png', 1.0)

        return {
          width: canvas.width,
          height: canvas.height,
          base64: dataUrl
        }
      } else {
        // Node.js server-side rendering - Memory optimized
        let nodeCanvas: any = null
        let context: any = null
        try {
          // Import Canvas directly
          const canvasModule = await import('canvas')

          const canvasWidth = Math.floor(viewport.width)
          const canvasHeight = Math.floor(viewport.height)

          // Create Node.js canvas with memory-safe dimensions
          nodeCanvas = canvasModule.createCanvas(canvasWidth, canvasHeight)
          context = nodeCanvas.getContext('2d')

          // Clear canvas with white background
          context.fillStyle = 'white'
          context.fillRect(0, 0, canvasWidth, canvasHeight)

          // Render PDF page to canvas
          const renderContext = {
            canvasContext: context,
            viewport: viewport
          }

          const renderTask = pdfPage.render(renderContext)
          await renderTask.promise

          // Encode JPEG. createJPEGStream chunks through libjpeg instead of
          // materializing the full ImageData buffer at once, which is the
          // exact allocation path that crashed production at large RSS (the
          // `Context2d::GetImageData` OOM in canvas.node). Fall back to
          // toBuffer() if the streaming API isn't available in the canvas
          // version on hand.
          const jpegBuffer = await encodeJpeg(nodeCanvas, 0.85)
          const base64 = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`

          const result = {
            width: canvasWidth,
            height: canvasHeight,
            base64
          }

          return result

        } catch (canvasError) {
          console.error('❌ Node.js Canvas rendering failed:', canvasError)
          throw new Error(`Node.js rendering failed: ${canvasError}`)
        } finally {
          // Release the Cairo surface backing this canvas. Setting width=0
          // is node-canvas's documented way to drop native memory — clearRect
          // alone only zeroes pixels and leaves the surface allocated.
          // Mirrors the NodeCanvasFactory.destroy() pattern used by pdf.js.
          if (nodeCanvas) {
            try {
              nodeCanvas.width = 0
              nodeCanvas.height = 0
            } catch {
              // Some canvas versions throw on width=0; ignore.
            }
          }
          context = null
          nodeCanvas = null
        }
      }

    } catch (error) {
      console.error('❌ Rendering failed:', error)
      return {
        width: 800,
        height: 600,
        base64: 'data:image/png;base64,error'
      }
    }
  }

  /**
   * Write base64 image data to file (Node.js only)
   */
  static async writeBase64ToFile(
    base64Data: string,
    outputDir: string,
    filename: string
  ): Promise<string> {
    if (this.isBrowser()) {
      throw new Error('writeBase64ToFile is not supported in browser environment')
    }

    try {
      const fs = await import('fs')
      const path = await import('path')

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
      }

      // Extract base64 content (remove data URL prefix)
      const base64Content = base64Data.split(',')[1] || base64Data
      const buffer = Buffer.from(base64Content, 'base64')

      // Write to file
      const filePath = path.join(outputDir, filename)
      fs.writeFileSync(filePath, buffer)

      return filePath
    } catch (error) {
      console.error('❌ Failed to write base64 to file:', error)
      throw error
    }
  }
}
