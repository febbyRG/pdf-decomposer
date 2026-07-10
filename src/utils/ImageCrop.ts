/**
 * Horizontal half-cropping of rendered page images, used when a physical
 * spread page is rasterized but only one logical half is wanted (spread
 * screenshot generation).
 *
 * Node-only by design: rasterization consumers (cleanComposer screenshot
 * conversion, the screenshot operation) run in Node. The browser build never
 * reaches this code path because spread splitting targets server-side
 * publishing pipelines.
 */

import { logger } from './Logger.js'

export interface CroppedImageResult {
  width: number
  height: number
  /** Data URL (image/jpeg) of the cropped half. */
  base64: string
}

/** JPEG quality used when re-encoding the cropped half (0-1 scale). */
const CROP_JPEG_QUALITY = 0.9

/**
 * Crop the left or right half of a rendered page image.
 *
 * @param dataUrl Source image as a data URL (any image MIME node-canvas can decode)
 * @param half Which half of the image to keep
 * @returns The cropped half re-encoded as JPEG, with its dimensions
 * @throws When executed outside Node (no node-canvas available)
 */
export async function cropImageHalf(
  dataUrl: string,
  half: 'left' | 'right'
): Promise<CroppedImageResult> {
  const isNode = typeof process !== 'undefined' && !!process.versions?.node
  if (!isNode) {
    throw new Error('cropImageHalf requires Node (node-canvas); spread screenshots are not supported in the browser build')
  }

  const { createCanvas, loadImage } = await import('canvas')
  const image = await loadImage(dataUrl)

  const halfWidth = Math.floor(image.width / 2)
  const sourceX = half === 'left' ? 0 : image.width - halfWidth

  const canvas = createCanvas(halfWidth, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, sourceX, 0, halfWidth, image.height, 0, 0, halfWidth, image.height)

  const base64 = canvas.toDataURL('image/jpeg', CROP_JPEG_QUALITY)
  logger.debug(`Cropped ${half} half: ${image.width}x${image.height} → ${halfWidth}x${image.height}`)

  return { width: halfWidth, height: image.height, base64 }
}
