import { createCanvas } from 'canvas'
import { describe, expect, it } from 'vitest'
import type { ExtractedImage } from '../types/image.types.js'
import { mergeSplitImageCrops } from './ImageCropMerge.js'

const SCALE_PX_PER_PT = 2

/**
 * A recognizable continuous artwork: vertical hue gradient with a diagonal.
 * Split crops taken from it share a seam; unrelated fills do not.
 */
function artworkCanvas(widthPt: number, heightPt: number): import('canvas').Canvas {
  const canvas = createCanvas(widthPt * SCALE_PX_PER_PT, heightPt * SCALE_PX_PER_PT)
  const context = canvas.getContext('2d')
  for (let y = 0; y < canvas.height; y++) {
    context.fillStyle = `rgb(${Math.round((y / canvas.height) * 255)}, 80, ${255 - Math.round((y / canvas.height) * 255)})`
    context.fillRect(0, y, canvas.width, 1)
  }
  context.strokeStyle = '#ffffff'
  context.lineWidth = 4
  context.beginPath()
  context.moveTo(0, 0)
  context.lineTo(canvas.width, canvas.height)
  context.stroke()
  return canvas
}

function cropOf(canvas: import('canvas').Canvas, id: string, x: number, y: number, widthPt: number, fromPt: number, heightPt: number): ExtractedImage {
  const crop = createCanvas(widthPt * SCALE_PX_PER_PT, Math.round(heightPt * SCALE_PX_PER_PT))
  crop.getContext('2d').drawImage(canvas, 0, -Math.round(fromPt * SCALE_PX_PER_PT))
  return {
    id,
    pageNumber: 1,
    data: crop.toDataURL('image/png'),
    format: 'png',
    x,
    y,
    width: widthPt,
    height: heightPt
  }
}

function solidImage(id: string, color: string, x: number, y: number, widthPt: number, heightPt: number): ExtractedImage {
  const canvas = createCanvas(widthPt * SCALE_PX_PER_PT, heightPt * SCALE_PX_PER_PT)
  const context = canvas.getContext('2d')
  context.fillStyle = color
  context.fillRect(0, 0, canvas.width, canvas.height)
  return { id, pageNumber: 1, data: canvas.toDataURL('image/png'), format: 'png', x, y, width: widthPt, height: heightPt }
}

describe('mergeSplitImageCrops', () => {
  it('reunites two crops of one artwork (matching column, small overlap, matching seam)', async () => {
    // The davisart lighthouse shape: same left/width, 0.5pt overlap.
    const artwork = artworkCanvas(80, 170)
    const upper = cropOf(artwork, 'img_a', 363, 569, 80, 0, 103)
    const lower = cropOf(artwork, 'img_b', 363, 671.5, 80, 102.5, 67.5)

    const result = await mergeSplitImageCrops([upper, lower])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('img_a')
    expect(result[0].y).toBe(569)
    expect(result[0].height).toBeCloseTo(170, 1)
    expect(result[0].width).toBe(80)
    expect(result[0].data.startsWith('data:image/png')).toBe(true)
  })

  it('collapses a three-crop chain into one element', async () => {
    const artwork = artworkCanvas(80, 180)
    const crops = [
      cropOf(artwork, 'img_a', 100, 0, 80, 0, 60),
      cropOf(artwork, 'img_b', 100, 60, 80, 60, 60),
      cropOf(artwork, 'img_c', 100, 120, 80, 120, 60)
    ]
    const result = await mergeSplitImageCrops(crops)
    expect(result).toHaveLength(1)
    expect(result[0].height).toBeCloseTo(180, 1)
  })

  it('never merges distinct stacked photos even at rail-like adjacency (seam mismatch)', async () => {
    // The davisart rail trap: same column, ~2pt overlap, different pictures.
    const red = solidImage('thumb_20', '#c02040', 466, 316, 158, 95)
    const blue = solidImage('thumb_24', '#2040c0', 466, 409, 158, 197)
    const result = await mergeSplitImageCrops([red, blue])
    expect(result).toHaveLength(2)
  })

  it('never merges across a real vertical gap, even when pixels would match', async () => {
    // Two crops of the same artwork placed apart are a design choice, not a split.
    const artwork = artworkCanvas(80, 170)
    const upper = cropOf(artwork, 'img_a', 363, 100, 80, 0, 60)
    const lower = cropOf(artwork, 'img_b', 363, 170, 80, 60, 60)
    const result = await mergeSplitImageCrops([upper, lower])
    expect(result).toHaveLength(2)
  })

  it('never merges layered images (overlay fully inside its host)', async () => {
    const artwork = artworkCanvas(80, 170)
    const host = cropOf(artwork, 'host', 100, 100, 80, 0, 170)
    const overlay = cropOf(artwork, 'overlay', 100, 130, 80, 30, 40)
    const result = await mergeSplitImageCrops([host, overlay])
    expect(result).toHaveLength(2)
  })

  it('never merges different columns or widths', async () => {
    const artwork = artworkCanvas(80, 120)
    const left = cropOf(artwork, 'img_a', 100, 0, 80, 0, 60)
    const shifted = cropOf(artwork, 'img_b', 103, 60, 80, 60, 60)
    expect(await mergeSplitImageCrops([left, shifted])).toHaveLength(2)

    const narrow = { ...cropOf(artwork, 'img_c', 100, 60, 80, 60, 60), width: 78 }
    expect(await mergeSplitImageCrops([left, narrow])).toHaveLength(2)
  })

  it('leaves elements without position or data-URL pixels untouched', async () => {
    const artwork = artworkCanvas(80, 120)
    const positioned = cropOf(artwork, 'img_a', 100, 0, 80, 0, 60)
    const unpositioned: ExtractedImage = { ...cropOf(artwork, 'img_b', 100, 60, 80, 60, 60), x: undefined, y: undefined }
    const fileBacked: ExtractedImage = { ...cropOf(artwork, 'img_c', 100, 60, 80, 60, 60), data: 'img_c.png' }
    expect(await mergeSplitImageCrops([positioned, unpositioned, fileBacked])).toHaveLength(3)
  })
})
