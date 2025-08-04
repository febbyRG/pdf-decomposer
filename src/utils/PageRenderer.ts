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
    options: PageRenderOptions = {}
  ): Promise<{ width: number; height: number; base64: string }> {
    const { scale = 1.0 } = options

    console.log('================= version: 3')

    try {
      if (!pdfPage) {
        throw new Error('Invalid PDF page object')
      }

      // CRITICAL: Get ORIGINAL viewport first (scale 1.0)
      const originalViewport = pdfPage.getViewport({ scale: 1.0 })
      console.log(`📐 Original viewport: ${originalViewport.width}x${originalViewport.height}`)

      // THEN apply the scale to get final viewport
      const viewport = pdfPage.getViewport({ scale })
      console.log(`📐 Scaled viewport: ${viewport.width}x${viewport.height} (scale: ${scale})`)

      if (this.isBrowser()) {
        // EXACT working pattern from successful test - NO MODIFICATIONS
        console.log('🌐 Browser rendering (FIXED SCALE approach)')

        // Step 1: Create canvas exactly like working test
        const doc = (globalThis as any).document
        const canvas = doc.createElement('canvas')
        const context = canvas.getContext('2d')

        if (!context) {
          throw new Error('Failed to get 2D context')
        }

        // Step 2: Set canvas dimensions using SCALED viewport
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)

        console.log(`📐 Canvas: ${canvas.width}x${canvas.height}`)

        // Step 3: Clear canvas exactly like working test
        context.fillStyle = 'white'
        context.fillRect(0, 0, canvas.width, canvas.height)
        console.log('✅ Canvas cleared with white background')

        // Step 4: Render exactly like working test - USE SCALED VIEWPORT
        const renderContext = {
          canvasContext: context,
          viewport: viewport  // Use SCALED viewport that matches canvas size
        }

        console.log('🔄 Starting PDF page render...')
        console.log('🔧 Render context:', {
          hasCanvas: !!renderContext.canvasContext,
          hasViewport: !!renderContext.viewport,
          viewportWidth: renderContext.viewport.width,
          viewportHeight: renderContext.viewport.height,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          scale: scale
        })

        const renderTask = pdfPage.render(renderContext)
        await renderTask.promise
        console.log('✅ Page rendered successfully')

        // Step 5: Check content immediately - no delay
        const imageData = context.getImageData(0, 0, Math.min(100, canvas.width), Math.min(100, canvas.height))
        const hasContent = Array.from(imageData.data).some((value, index) => {
          if (index % 4 === 3) return false // Skip alpha channel
          return value !== 255 // Not white
        })

        console.log(`🔍 Canvas content check: ${hasContent ? 'HAS CONTENT' : 'APPEARS BLANK'}`)

        // Log render context details for debugging
        console.log('🔧 Post-render analysis:')
        console.log('  - Canvas dimensions:', canvas.width, 'x', canvas.height)
        console.log('  - Viewport dimensions:', viewport.width, 'x', viewport.height)
        console.log('  - Context state:', {
          fillStyle: context.fillStyle,
          globalAlpha: context.globalAlpha,
          globalCompositeOperation: context.globalCompositeOperation
        })

        // Check if there are any transforms applied
        const transform = context.getTransform()
        console.log('  - Canvas transform:', {
          a: transform.a, b: transform.b, c: transform.c,
          d: transform.d, e: transform.e, f: transform.f
        })

        // Step 6: Convert to base64 exactly like working test
        const dataUrl = canvas.toDataURL('image/png', 1.0)
        console.log(`📸 Data URL generated: ${dataUrl.length} chars`)

        return {
          width: canvas.width,
          height: canvas.height,
          base64: dataUrl
        }
      } else {
        // Node.js fallback
        console.log('⚠️ Node.js environment')
        const canvasWidth = Math.floor(viewport.width * scale)
        const canvasHeight = Math.floor(viewport.height * scale)

        return {
          width: canvasWidth,
          height: canvasHeight,
          base64: 'data:image/png;base64,placeholder'
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
