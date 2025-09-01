export interface PageRenderOptions {
  width?: number
  quality?: number
  scale?: number
}

/**
 * Universal page renderer - EXACT working pattern
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

  static async renderPageToBase64(
    pdfPage: any,
    pdfDocument: any,
    options: PageRenderOptions = {}
  ): Promise<{ width: number; height: number; base64: string }> {
    const { scale = 1.0 } = options

    try {
      if (!pdfPage) {
        throw new Error('Invalid PDF page object')
      }

      // Get viewport for scaling
      const viewport = pdfPage.getViewport({ scale })
      
      // Validate viewport
      if (!viewport || viewport.width <= 0 || viewport.height <= 0) {
        throw new Error(`Invalid viewport: ${viewport?.width}x${viewport?.height}`)
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
        // Node.js server-side rendering - ngx-pdfjs style (simplified)
        try {
          // Import Canvas directly (like ngx-pdfjs but for Node.js)
          const canvas = await import('canvas')
          
          const canvasWidth = Math.floor(viewport.width)
          const canvasHeight = Math.floor(viewport.height)
          
          // Create simple Node.js canvas (no canvasFactory complexity)
          const nodeCanvas = canvas.createCanvas(canvasWidth, canvasHeight)
          const context = nodeCanvas.getContext('2d')
          
          // Clear canvas with white background
          context.fillStyle = 'white'
          context.fillRect(0, 0, canvasWidth, canvasHeight)
          
          // Simple render context (ngx-pdfjs style)
          const renderContext = {
            canvasContext: context,
            viewport: viewport
          }
          
          const renderTask = pdfPage.render(renderContext)
          
          await renderTask.promise
          
          // Convert to PNG buffer
          const pngBuffer = nodeCanvas.toBuffer('image/png')
          const base64 = `data:image/png;base64,${pngBuffer.toString('base64')}`
          
          return {
            width: canvasWidth,
            height: canvasHeight,
            base64: base64
          }
          
        } catch (canvasError) {
          console.error('❌ Node.js Canvas rendering failed:', canvasError)
          throw new Error(`Node.js rendering failed: ${canvasError}`)
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
