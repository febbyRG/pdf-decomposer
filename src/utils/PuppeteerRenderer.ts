/**
 * Puppeteer-based page renderer.
 *
 * Renders PDF pages inside a headless Chromium browser using the same
 * `document.createElement('canvas')` + pdf.js pipeline that pdf-decomposer's
 * BROWSER code path uses (and that flexpdf relies on at scale). The OOM that
 * node-canvas's `Context2d::GetImageData` hits never occurs here because the
 * canvas backing store lives inside Chromium, where canvas memory is managed
 * by the browser engine.
 *
 * Trade-offs vs the default node-canvas renderer:
 * - Cold-start cost: spawning Chromium adds ~500-2000ms per PdfDecomposer
 *   lifetime (one-time, not per page).
 * - Disk footprint: requires Chromium (~300 MB) — already present in the
 *   drone-jobs Cloud Function image via puppeteer.
 * - Reliability: handles 100+ page documents without external-memory OOM.
 *
 * PDF byte transfer:
 *   The PDF is served to Chromium over a tiny localhost HTTP server bound to
 *   a random port on 127.0.0.1. Earlier attempts passed the bytes through
 *   `page.evaluate` as base64, but that round-trips 100-200 MB strings
 *   through CDP's JSON serializer and crashes the tab with OOM. Serving via
 *   HTTP lets pdf.js fetch the file using the same code path it uses in
 *   production browsers, with zero protocol-level overhead.
 *
 * Failure modes designed around:
 * - "Blank image" issue from past attempts: caused by `page.screenshot()`
 *   capturing viewport-only or by racing pdf.js's async render. This renderer
 *   uses `canvas.toDataURL()` inside `page.evaluate`, after `await
 *   renderTask.promise`. No viewport size dependence; no race condition.
 * - pdf.js worker memory leakage (mozilla/pdf.js#10730): mitigated by calling
 *   `pageProxy.cleanup()` after every render and `doc.destroy()` on dispose.
 */

import { promises as fsp } from 'fs'
import * as http from 'http'
import type { AddressInfo } from 'net'
import type { PdfPageRenderResult, PdfPageRenderOptions, PdfPageRenderer } from '../types/renderer.types.js'
import { logger } from './Logger.js'

export interface PuppeteerRendererOptions {
  /**
   * Path to a Chromium/Chrome executable. Defaults to puppeteer's bundled
   * Chromium. Useful for Cloud Functions where the runtime image already
   * ships with Chromium at a known path.
   */
  executablePath?: string

  /**
   * Extra `--flag` arguments for the Chromium launch. The renderer always
   * passes `--no-sandbox --disable-setuid-sandbox` for container compat.
   */
  launchArgs?: string[]

  /**
   * Verbose console logging from the browser context. Useful for debugging
   * blank-screenshot or render-failure scenarios.
   */
  debug?: boolean
}

/** Identifier used internally — pdf.js document handle stored on `window`. */
const DOC_GLOBAL_KEY = '__pdfDecomposerDoc'

export class PuppeteerRenderer implements PdfPageRenderer {
  private browser: any = null
  private page: any = null
  private server: http.Server | null = null
  private serverUrl: string | null = null
  private initialized = false
  private numPages = 0

  constructor(private readonly options: PuppeteerRendererOptions = {}) {}

  async initialize(pdfData: Uint8Array): Promise<void> {
    if (this.initialized) return

    const puppeteer = await this.loadPuppeteer()
    if (!puppeteer) {
      throw new Error(
        'PuppeteerRenderer: puppeteer not installed. Install it with `npm install puppeteer` ' +
        'or use the default node-canvas renderer.'
      )
    }

    const pdfJsSrc = await this.readBundledPdfJs()
    const pdfWorkerSrc = await this.readBundledPdfJsWorker()

    // Spin up a localhost HTTP server that serves three resources to the
    // headless browser: the HTML scaffold (root), the PDF bytes, and pdf.js's
    // worker source. Everything lives on the same origin so no CORS dance.
    await this.startServer(pdfData, pdfJsSrc, pdfWorkerSrc)

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      ...(this.options.launchArgs ?? [])
    ]

    this.browser = await puppeteer.launch({
      headless: true,
      executablePath: this.options.executablePath,
      args: launchArgs
    })

    this.page = await this.browser.newPage()

    if (this.options.debug) {
      this.page.on('console', (msg: any) => logger.info(`[puppeteer/console] ${msg.text()}`))
      this.page.on('pageerror', (err: any) => logger.warn(`[puppeteer/pageerror] ${err}`))
    }

    if (!this.serverUrl) {
      throw new Error('PuppeteerRenderer: HTTP server failed to bind')
    }

    // Navigate to the scaffold served by our local server. The scaffold
    // inlines pdf.js so by the time `load` fires, `pdfjsLib` is on `window`
    // and `GlobalWorkerOptions.workerSrc` already points to our worker URL.
    await this.page.goto(this.serverUrl, { waitUntil: 'load' })

    // Load the PDF document from the local server URL. pdf.js fetches the
    // bytes itself; nothing transits through CDP.
    this.numPages = await this.page.evaluate(async (pdfUrl: string, globalKey: string) => {
      const lib = (globalThis as any).pdfjsLib
      if (!lib) {
        throw new Error('pdfjsLib not present in page context')
      }
      const loadingTask = lib.getDocument({ url: pdfUrl, disableFontFace: true, verbosity: 0 })
      const pdfDoc = await loadingTask.promise
      ;(globalThis as any)[globalKey] = pdfDoc // eslint-disable-line @typescript-eslint/no-extra-semi
      return pdfDoc.numPages
    }, `${this.serverUrl}/pdf`, DOC_GLOBAL_KEY)

    this.initialized = true
  }

  async renderPage(pageNumber: number, opts: PdfPageRenderOptions = {}): Promise<PdfPageRenderResult> {
    if (!this.initialized || !this.page) {
      throw new Error('PuppeteerRenderer.renderPage called before initialize()')
    }
    if (pageNumber < 1 || pageNumber > this.numPages) {
      throw new Error(`PuppeteerRenderer.renderPage: pageNumber ${pageNumber} out of range (1..${this.numPages})`)
    }

    const targetWidth = opts.width ?? 1024
    const quality = opts.quality ?? 0.85
    const format = opts.format ?? 'image/jpeg'

    const result = await this.page.evaluate(
      async (pageNum: number, w: number, q: number, fmt: string, globalKey: string) => {
        const doc = (globalThis as any)[globalKey]
        if (!doc) throw new Error('PDF document not loaded into page context')

        const page = await doc.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1 })
        const scale = w / viewport.width
        const scaledViewport = page.getViewport({ scale })

        // Build a fresh canvas per page so DOM doesn't accumulate. Detach by
        // letting it go out of scope at the end of the function — browser GC
        // releases the backing store.
        const canvas = (globalThis as any).document.createElement('canvas')
        canvas.width = Math.floor(scaledViewport.width)
        canvas.height = Math.floor(scaledViewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Failed to obtain 2D canvas context')

        // White background — pdf.js renders without clearing.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise

        // Encode via toDataURL — synchronous in browser, no viewport
        // dependence, no race condition with page.screenshot.
        const dataUrl = canvas.toDataURL(fmt, q)

        // pdf.js per-page cleanup. Drops worker-side state for this page.
        // The page object can still be re-fetched if needed.
        try {
          if (typeof page.cleanup === 'function') {
            page.cleanup()
          }
        } catch {
          // ignore; cleanup is best-effort
        }

        // Explicit canvas drop — set dimensions to 0 to free the Blink layer
        // backing store immediately instead of waiting for GC.
        canvas.width = 0
        canvas.height = 0

        return {
          width: Math.floor(scaledViewport.width),
          height: Math.floor(scaledViewport.height),
          base64: dataUrl
        }
      },
      pageNumber,
      targetWidth,
      quality,
      format,
      DOC_GLOBAL_KEY
    )

    return result as PdfPageRenderResult
  }

  async dispose(): Promise<void> {
    if (this.page) {
      try {
        await this.page.evaluate(async (globalKey: string) => {
          const doc = (globalThis as any)[globalKey]
          if (doc && typeof doc.destroy === 'function') {
            await doc.destroy()
          }
          ;(globalThis as any)[globalKey] = null // eslint-disable-line @typescript-eslint/no-extra-semi
        }, DOC_GLOBAL_KEY).catch(() => undefined)
      } catch {
        // ignore
      }
      await this.page.close().catch(() => undefined)
      this.page = null
    }
    if (this.browser) {
      await this.browser.close().catch(() => undefined)
      this.browser = null
    }
    if (this.server) {
      await new Promise<void>(resolve => this.server?.close(() => resolve()))
      this.server = null
      this.serverUrl = null
    }
    this.initialized = false
  }

  /**
   * Spin up a localhost HTTP server that exposes the PDF + pdf.js worker so
   * the headless Chromium can fetch them as same-origin resources.
   */
  private async startServer(pdfData: Uint8Array, pdfJsSrc: string, pdfWorkerSrc: string): Promise<void> {
    const pdfBuffer = Buffer.from(pdfData)
    const scaffold = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;background:#fff">
<script>${pdfJsSrc}</script>
<script>
  if (typeof window.pdfjsLib !== 'undefined' && window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';
  }
</script>
</body>
</html>`
    const scaffoldBuffer = Buffer.from(scaffold, 'utf8')
    const workerBuffer = Buffer.from(pdfWorkerSrc, 'utf8')

    this.server = http.createServer((req, res) => {
      if (req.url === '/pdf') {
        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Length': pdfBuffer.length,
          'Cache-Control': 'no-store'
        })
        res.end(pdfBuffer)
        return
      }
      if (req.url === '/pdf.worker.js') {
        res.writeHead(200, {
          'Content-Type': 'application/javascript',
          'Content-Length': workerBuffer.length,
          'Cache-Control': 'no-store'
        })
        res.end(workerBuffer)
        return
      }
      // Default: serve scaffold for any other path.
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Content-Length': scaffoldBuffer.length,
        'Cache-Control': 'no-store'
      })
      res.end(scaffoldBuffer)
    })

    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '127.0.0.1', () => {
        const address = this.server!.address() as AddressInfo
        this.serverUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })
  }

  /**
   * Load puppeteer dynamically so it stays an optional dependency. Returns
   * null if puppeteer isn't installed in the consumer's project.
   */
  private async loadPuppeteer(): Promise<any> {
    // Prefer dynamic ESM-style import so bundlers don't statically resolve
    // 'puppeteer' (which would break browser builds where puppeteer isn't a
    // valid target). The literal string is wrapped in a template so static
    // analyzers can't constant-fold it.
    try {
      const moduleName = ['pup', 'peteer'].join('')
      const mod = await import(moduleName)
      // ESM default-interop: real puppeteer's CommonJS shape lives on .default
      // in some bundlers; fall back to the namespace itself otherwise.
      return (mod as any).default ?? mod
    } catch {
      return null
    }
  }

  /**
   * Locate and read pdfjs-dist's legacy build from the consumer's
   * node_modules. Uses CommonJS `require.resolve` directly — pdf-decomposer's
   * tsconfig targets `module: commonjs`, so `require` is module-scoped and
   * available.
   */
  private async readBundledPdfJs(): Promise<string> {
    try {
      const pdfJsPath: string = require.resolve('pdfjs-dist/legacy/build/pdf.js')
      return await fsp.readFile(pdfJsPath, 'utf8')
    } catch (error) {
      const msg = (error as Error).message
      throw new Error(
        'PuppeteerRenderer: failed to read pdfjs-dist source for injection. ' +
        `Ensure pdfjs-dist is installed alongside puppeteer. Underlying error: ${msg}`
      )
    }
  }

  /**
   * Optional pdf.js worker file. If pdfjs-dist's worker build isn't reachable
   * we return an empty string and pdf.js falls back to its "fake worker"
   * (main-thread) mode. Slower but still correct.
   */
  private async readBundledPdfJsWorker(): Promise<string> {
    try {
      const workerPath: string = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js')
      return await fsp.readFile(workerPath, 'utf8')
    } catch {
      return ''
    }
  }

  /** Internal-use helper for tests/diagnostics. */
  get _pageCount(): number {
    return this.numPages
  }
}
