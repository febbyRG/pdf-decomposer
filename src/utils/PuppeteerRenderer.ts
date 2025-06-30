/**
 * Puppeteer-based PDF page renderer for serverless environments
 * No system dependencies required - works in Google Cloud Functions
 */

import * as fs from 'fs'
import * as path from 'path'
import puppeteer, { Browser, Page } from 'puppeteer'

export interface RenderOptions {
  width?: number
  height?: number
  quality?: number
  format?: 'png' | 'jpeg'
  scale?: number
}

export class PuppeteerRenderer {
  private browser: Browser | null = null
  private page: Page | null = null

  /**
   * Initialize Puppeteer browser instance
   */
  async initialize(): Promise<void> {
    if (this.browser) return

    console.log('🌐 Initializing Puppeteer browser...')

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // Overcome limited resource problems
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // Important for Cloud Functions
        '--disable-gpu'
      ]
    })

    this.page = await this.browser.newPage()
  }

  /**
   * Render a PDF page to image using Puppeteer
   */
  async renderPdfPageToImage(
    pdfBuffer: Buffer,
    pageNumber: number,
    outputPath: string,
    options: RenderOptions = {}
  ): Promise<{ width: number; height: number; filePath: string }> {
    await this.initialize()

    const {
      width = 800,
      quality = 80,
      format = 'jpeg',
      scale = 1
    } = options

    if (!this.page) {
      throw new Error('Puppeteer page not initialized')
    }

    try {
      // Create a data URL from the PDF buffer
      const pdfDataUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`

      // Navigate to a simple HTML page that embeds the PDF
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { margin: 0; padding: 0; }
            embed {
              width: 100vw;
              height: 100vh;
              border: none;
            }
          </style>
        </head>
        <body>
          <embed src="${pdfDataUrl}#page=${pageNumber}" type="application/pdf">
        </body>
        </html>
      `

      await this.page.setContent(htmlContent, { waitUntil: 'networkidle0' })
      await this.page.setViewport({
        width: Math.round(width),
        height: Math.round(width * 1.4),
        deviceScaleFactor: scale
      })

      // Wait a bit for PDF to load
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Take screenshot
      const screenshotBuffer = await this.page.screenshot({
        type: format,
        quality: format === 'jpeg' ? quality : undefined,
        fullPage: false
      })

      // Write screenshot to file
      fs.writeFileSync(outputPath, screenshotBuffer)

      // Get actual dimensions
      const dimensions = await this.page.evaluate(() => ({
        width: (globalThis as any).innerWidth,
        height: (globalThis as any).innerHeight
      }))

      console.log(`📷 Rendered page ${pageNumber} to ${path.basename(outputPath)} (${dimensions.width}x${dimensions.height})`)

      return {
        width: dimensions.width,
        height: dimensions.height,
        filePath: outputPath
      }

    } catch (error) {
      console.error(`❌ Failed to render PDF page ${pageNumber}:`, error)
      throw error
    }
  }

  /**
   * Render PDF page using PDF.js in the browser (more reliable method)
   */
  async renderPdfPageWithPdfJs(
    pdfBuffer: Buffer,
    pageNumber: number,
    outputPath: string,
    options: RenderOptions = {}
  ): Promise<{ width: number; height: number; filePath: string }> {
    await this.initialize()

    const {
      width = 800,
      quality = 80,
      format = 'jpeg',
      scale = 1
    } = options

    if (!this.page) {
      throw new Error('Puppeteer page not initialized')
    }

    try {
      // Create HTML page with PDF.js
      const pdfDataUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
          <style>
            body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; background: white; }
            canvas { max-width: 100%; max-height: 100%; }
          </style>
        </head>
        <body>
          <canvas id="pdf-canvas"></canvas>
          <script>
            (async () => {
              try {
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                const pdfData = '${pdfDataUrl}';
                const pdf = await pdfjsLib.getDocument(pdfData).promise;
                const page = await pdf.getPage(${pageNumber});

                const canvas = document.getElementById('pdf-canvas');
                const context = canvas.getContext('2d');

                const viewport = page.getViewport({ scale: ${scale} });
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                await page.render({
                  canvasContext: context,
                  viewport: viewport
                }).promise;

                window.pdfRendered = true;
                window.pdfDimensions = { width: viewport.width, height: viewport.height };
              } catch (error) {
                console.error('PDF rendering error:', error);
                window.pdfError = error.message;
              }
            })();
          </script>
        </body>
        </html>
      `

      await this.page.setContent(htmlContent, { waitUntil: 'networkidle0' })
      await this.page.setViewport({
        width: Math.round(width) + 100,
        height: Math.round(width * 1.4) + 100,
        deviceScaleFactor: 1
      })

      // Wait for PDF to render
      await this.page.waitForFunction(() => (globalThis as any).pdfRendered || (globalThis as any).pdfError, { timeout: 10000 })

      // Check for errors
      const pdfError = await this.page.evaluate(() => (globalThis as any).pdfError)
      if (pdfError) {
        throw new Error(`PDF.js rendering error: ${pdfError}`)
      }

      // Get actual dimensions
      const dimensions = await this.page.evaluate(() => (globalThis as any).pdfDimensions)

      // Take screenshot of the canvas
      const canvas = await this.page.$('#pdf-canvas')
      if (!canvas) {
        throw new Error('PDF canvas not found')
      }

      const screenshotBuffer = await canvas.screenshot({
        type: format,
        quality: format === 'jpeg' ? quality : undefined
      })

      // Write screenshot to file
      fs.writeFileSync(outputPath, screenshotBuffer)

      console.log(`📷 Rendered page ${pageNumber} with PDF.js to ${path.basename(outputPath)} (${dimensions.width}x${dimensions.height})`)

      return {
        width: dimensions.width,
        height: dimensions.height,
        filePath: outputPath
      }

    } catch (error) {
      console.error(`❌ Failed to render PDF page ${pageNumber} with PDF.js:`, error)
      throw error
    }
  }

  /**
   * Create thumbnail from full image
   */
  async createThumbnail(
    fullImagePath: string,
    thumbnailPath: string,
    maxWidth: number = 120,
    quality: number = 60
  ): Promise<void> {
    await this.initialize()

    if (!this.page) {
      throw new Error('Puppeteer page not initialized')
    }

    try {
      // Create HTML page to resize image
      const imageData = fs.readFileSync(fullImagePath, 'base64')
      const imageFormat = path.extname(fullImagePath).substring(1)
      const imageDataUrl = `data:image/${imageFormat};base64,${imageData}`

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; background: white; }
            canvas { border: none; }
          </style>
        </head>
        <body>
          <canvas id="thumbnail-canvas"></canvas>
          <script>
            (async () => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.getElementById('thumbnail-canvas');
                const ctx = canvas.getContext('2d');

                const aspectRatio = img.height / img.width;
                const newWidth = Math.min(img.width, ${maxWidth});
                const newHeight = newWidth * aspectRatio;

                canvas.width = newWidth;
                canvas.height = newHeight;

                ctx.drawImage(img, 0, 0, newWidth, newHeight);
                window.thumbnailRendered = true;
              };
              img.src = '${imageDataUrl}';
            })();
          </script>
        </body>
        </html>
      `

      await this.page.setContent(htmlContent, { waitUntil: 'networkidle0' })

      // Wait for thumbnail to render
      await this.page.waitForFunction(() => (globalThis as any).thumbnailRendered, { timeout: 5000 })

      // Take screenshot of the canvas
      const canvas = await this.page.$('#thumbnail-canvas')
      if (!canvas) {
        throw new Error('Thumbnail canvas not found')
      }

      const screenshotBuffer = await canvas.screenshot({
        type: 'jpeg',
        quality
      })

      // Write screenshot to file
      fs.writeFileSync(thumbnailPath, screenshotBuffer)

      console.log(`📏 Created thumbnail: ${path.basename(thumbnailPath)}`)

    } catch (error) {
      console.error('❌ Failed to create thumbnail:', error)
      throw error
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close()
      this.page = null
    }

    if (this.browser) {
      await this.browser.close()
      this.browser = null
      console.log('🧹 Puppeteer browser closed')
    }
  }
}

// Global instance for reuse
let globalRenderer: PuppeteerRenderer | null = null

/**
 * Get shared Puppeteer renderer instance
 */
export function getPuppeteerRenderer(): PuppeteerRenderer {
  if (!globalRenderer) {
    globalRenderer = new PuppeteerRenderer()
  }
  return globalRenderer
}

/**
 * Clean up global renderer
 */
export async function cleanupPuppeteerRenderer(): Promise<void> {
  if (globalRenderer) {
    await globalRenderer.cleanup()
    globalRenderer = null
  }
}

// Declare global types for browser window
declare global {
  interface Window {
    pdfRendered?: boolean
    pdfError?: string
    pdfDimensions?: { width: number; height: number }
    thumbnailRendered?: boolean
  }
}
