/**
 * Pluggable page-renderer interface.
 *
 * The default screenshot path uses `node-canvas` (Cairo). For large PDFs on
 * Node.js, that path can hit `v8::ArrayBuffer::New` OOM inside
 * `Context2d::GetImageData` (see docs/PERFORMANCE_PLAN.md and the linked
 * node-canvas / pdf.js GitHub issues). Consumers can opt into an alternative
 * renderer (e.g. PuppeteerRenderer) that side-steps node-canvas entirely.
 *
 * Implementations are responsible only for the per-page rasterization step.
 * Text/image extraction, link extraction, and page composition still run on
 * the Node-side pdf.js instance owned by PdfDecomposer.
 */
export interface PdfPageRenderResult {
  /** Rendered canvas width in pixels. */
  width: number
  /** Rendered canvas height in pixels. */
  height: number
  /** Image as a data URL, e.g. `data:image/jpeg;base64,...`. */
  base64: string
}

export interface PdfPageRenderOptions {
  /** Target image width in pixels. Height is computed from the page aspect ratio. */
  width?: number
  /** JPEG quality fraction 0..1 (matches HTMLCanvas.toDataURL contract). */
  quality?: number
  /** Output image MIME type. Defaults to `image/jpeg`. */
  format?: 'image/jpeg' | 'image/png'
}

export interface PdfPageRenderer {
  /**
   * Called once by PdfDecomposer.initialize(). The renderer may use this hook
   * to prepare resources (spawn a browser, load pdf.js, etc.). Receives the
   * PDF bytes so the renderer can build its own document if needed.
   *
   * Optional — renderers that don't need setup can omit this.
   */
  initialize?(pdfData: Uint8Array): Promise<void>

  /**
   * Render a single 1-indexed PDF page to an image data URL.
   *
   * The renderer is expected to release per-page resources before returning.
   */
  renderPage(pageNumber: number, options?: PdfPageRenderOptions): Promise<PdfPageRenderResult>

  /**
   * Called when PdfDecomposer.dispose() runs. The renderer should release any
   * long-lived resources (browser process, temp files, etc.).
   *
   * Optional.
   */
  dispose?(): Promise<void>
}
