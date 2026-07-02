import type { PdfElement } from '../../../models/PdfElement.js'
import type { PdfPageContent } from '../../../models/PdfPageContent.js'

/**
 * Plain-object builders for heuristics unit tests. No PDF rendering required.
 */

let idCounter = 0
const nextId = () => `el-${idCounter++}`

export function makeTextElement(opts: {
  data: string
  type?: string
  top?: number
  left?: number
  width?: number
  height?: number
  fontSize?: number
  fontFamily?: string
  pageIndex?: number
}): PdfElement {
  return {
    id: nextId(),
    pageIndex: opts.pageIndex ?? 0,
    type: opts.type ?? 'text',
    data: opts.data,
    boundingBox: {
      top: opts.top ?? 0,
      left: opts.left ?? 0,
      width: opts.width ?? 200,
      height: opts.height ?? 20
    },
    attributes: {
      fontSize: opts.fontSize ?? 12,
      fontFamily: opts.fontFamily ?? 'Body Sans'
    }
  }
}

export function makeImageElement(opts: {
  top?: number
  left?: number
  width: number
  height: number
  pageIndex?: number
}): PdfElement {
  return {
    id: nextId(),
    pageIndex: opts.pageIndex ?? 0,
    type: 'image',
    data: 'image.jpg',
    boundingBox: {
      top: opts.top ?? 0,
      left: opts.left ?? 0,
      width: opts.width,
      height: opts.height
    }
  }
}

export function makePage(opts: {
  elements: PdfElement[]
  width?: number
  height?: number
  pageIndex?: number
  pageNumber?: number
  metadata?: Record<string, any>
}): PdfPageContent {
  return {
    pageIndex: opts.pageIndex ?? 0,
    pageNumber: opts.pageNumber ?? (opts.pageIndex ?? 0) + 1,
    width: opts.width ?? 595,
    height: opts.height ?? 842,
    title: 'page',
    image: '',
    elements: opts.elements,
    ...(opts.metadata ? { metadata: opts.metadata } : {})
  }
}

// A4-ish page in points.
export const PAGE_W = 595
export const PAGE_H = 842
export const PAGE_AREA = PAGE_W * PAGE_H

const text = (n: number) => 'word '.repeat(Math.ceil(n / 5)).slice(0, n).trim()

/**
 * Full-page ad: a dominant hero image (~65% coverage) plus short scattered promo
 * fragments (none a long paragraph). This is the case the old 200-char total
 * guard wrongly kept as decomposed.
 */
export function adElements(): PdfElement[] {
  return [
    makeImageElement({ width: PAGE_W, height: Math.round(PAGE_H * 0.65) }),
    makeTextElement({ data: 'A new standard has arrived', fontSize: 28 }),
    makeTextElement({ data: 'Now available', fontSize: 14 }),
    makeTextElement({ data: 'Suitable for sensitive eyes and daily use', fontSize: 12 }),
    makeTextElement({ data: 'For more information contact your representative', fontSize: 10 })
  ]
}

/** Editorial page: a small image plus at least one long continuous paragraph. */
export function editorialElements(): PdfElement[] {
  return [
    makeImageElement({ width: Math.round(PAGE_W * 0.5), height: Math.round(PAGE_H * 0.3) }),
    makeTextElement({ data: text(320), type: 'paragraph' }),
    makeTextElement({ data: text(280), type: 'paragraph' })
  ]
}

/** Tiled cover: several images spread across the page, aggregate coverage high. */
export function tiledElements(): PdfElement[] {
  const w = Math.round(PAGE_W * 0.48)
  const h = Math.round(PAGE_H * 0.45)
  return [
    makeImageElement({ top: 0, left: 0, width: w, height: h }),
    makeImageElement({ top: 0, left: PAGE_W - w, width: w, height: h }),
    makeImageElement({ top: PAGE_H - h, left: 0, width: w, height: h }),
    makeImageElement({ top: PAGE_H - h, left: PAGE_W - w, width: w, height: h })
  ]
}
