/**
 * Reunification of one printed artwork that the PDF stores as multiple
 * vertically stacked image crops.
 *
 * Page generators (InDesign exports in particular) often slice a single placed
 * photo into two or more stacked XObjects. Extraction then reports two
 * independent image elements, and every downstream consumer treats the halves
 * as two unrelated pictures: the AI conversion pipeline rendered a magazine
 * artwork as two giant partial images pages apart (davisart TOC, Tests 36-38).
 *
 * Geometry alone CANNOT decide a merge. Measured on davisart page 7: the rail
 * of six DISTINCT thumbnails stacks edge to edge with gaps around 1pt, width
 * deltas as small as 0.05pt, and one distinct pair even overlapping 2pt, while
 * the genuinely split artwork overlaps 0.52pt with byte-identical widths. So
 * geometry only nominates candidates, and the pixel seam decides: where the
 * crops adjoin, a true split depicts the same printed sliver (measured mean
 * absolute RGB difference 5.7) while distinct photos do not (measured 131).
 * Pixels are only decoded for nominated pairs, so pages without stacked
 * same-column images (the vast majority) never pay a decode.
 *
 * Node-only: compositing needs node-canvas. In the browser build (or when
 * canvas is unavailable) the input is returned unchanged, never an error, so
 * decompose keeps working with the split elements as before.
 */

import type { ExtractedImage } from '../types/image.types.js'
import { logger } from './Logger.js'

/** Crops of one artwork share the printed column: same left edge and width. */
const ALIGNMENT_TOLERANCE_PT = 0.5
/**
 * Vertical seam window: a lower crop may start slightly above the upper crop's
 * bottom (rasterization overlap) or leave a hairline gap from rounding.
 * Anything past 4pt of overlap is layering (badges, overlays), not a split.
 */
const SEAM_GAP_MAX_PT = 0.5
const SEAM_OVERLAP_MAX_PT = 4
/**
 * Decision threshold for the seam test, mean absolute RGB difference in the
 * adjoining bands. Calibrated on davisart: true split 5.7, distinct
 * thumbnails 131.2 (a 20x separation).
 */
const SEAM_MAX_MEAN_DIFF = 30
/** Sampled band geometry for the seam comparison. */
const SEAM_BAND_MIN_PX = 2
const SEAM_SAMPLE_HEIGHT_PX = 4

type CanvasModule = typeof import('canvas')
type CanvasImage = import('canvas').Image

/** Geometry of a mergeable element: data URL present, position measured. */
interface CropGeometry {
  index: number
  x: number
  y: number
  width: number
  height: number
}

async function loadCanvasModule(): Promise<CanvasModule | null> {
  const isNode = typeof process !== 'undefined' && !!process.versions?.node
  if (!isNode) { return null }
  return import('canvas').catch(() => null)
}

function cropGeometry(images: ExtractedImage[]): CropGeometry[] {
  const crops: CropGeometry[] = []
  for (let index = 0; index < images.length; index++) {
    const element = images[index]
    if (typeof element.x !== 'number' || typeof element.y !== 'number') { continue }
    if (!(element.width > 0) || !(element.height > 0)) { continue }
    if (typeof element.data !== 'string' || !element.data.startsWith('data:')) { continue }
    crops.push({ index, x: element.x, y: element.y, width: element.width, height: element.height })
  }
  return crops
}

function isMergeCandidate(upper: CropGeometry, lower: CropGeometry): boolean {
  if (Math.abs(upper.x - lower.x) > ALIGNMENT_TOLERANCE_PT) { return false }
  if (Math.abs(upper.width - lower.width) > ALIGNMENT_TOLERANCE_PT) { return false }
  const overlapPt = upper.y + upper.height - lower.y
  return overlapPt >= -SEAM_GAP_MAX_PT && overlapPt <= SEAM_OVERLAP_MAX_PT
}

/**
 * Mean absolute RGB difference between the upper crop's bottom band and the
 * lower crop's top band, both resampled to a common size. For a real split the
 * bands depict the same printed sliver of the artwork.
 */
function seamDifference(
  canvasModule: CanvasModule,
  upper: CropGeometry, upperImage: CanvasImage,
  lower: CropGeometry, lowerImage: CanvasImage
): number {
  const overlapPt = Math.max(0, upper.y + upper.height - lower.y)
  const bandUpperPx = Math.max(SEAM_BAND_MIN_PX, Math.round(overlapPt * (upperImage.height / upper.height)))
  const bandLowerPx = Math.max(SEAM_BAND_MIN_PX, Math.round(overlapPt * (lowerImage.height / lower.height)))
  const width = Math.min(upperImage.width, lowerImage.width)
  if (width < 1) { return Number.POSITIVE_INFINITY }

  const sample = (image: CanvasImage, sourceY: number, sourceHeight: number): Uint8ClampedArray => {
    const canvas = canvasModule.createCanvas(width, SEAM_SAMPLE_HEIGHT_PX)
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, sourceY, image.width, sourceHeight, 0, 0, width, SEAM_SAMPLE_HEIGHT_PX)
    return context.getImageData(0, 0, width, SEAM_SAMPLE_HEIGHT_PX).data
  }

  const upperBand = sample(upperImage, upperImage.height - bandUpperPx, bandUpperPx)
  const lowerBand = sample(lowerImage, 0, bandLowerPx)

  let difference = 0
  let samples = 0
  for (let i = 0; i < upperBand.length; i += 4) {
    difference += Math.abs(upperBand[i] - lowerBand[i])
      + Math.abs(upperBand[i + 1] - lowerBand[i + 1])
      + Math.abs(upperBand[i + 2] - lowerBand[i + 2])
    samples += 3
  }
  return samples === 0 ? Number.POSITIVE_INFINITY : difference / samples
}

/** Composite the two crops into one image at the sharper crop's resolution. */
function compositeCrops(
  canvasModule: CanvasModule,
  upper: CropGeometry, upperImage: CanvasImage, upperElement: ExtractedImage,
  lower: CropGeometry, lowerImage: CanvasImage
): ExtractedImage {
  const scale = Math.max(upperImage.width / upper.width, lowerImage.width / lower.width)
  const widthPt = Math.max(upper.width, lower.width)
  const heightPt = lower.y + lower.height - upper.y

  const canvas = canvasModule.createCanvas(Math.max(1, Math.round(widthPt * scale)), Math.max(1, Math.round(heightPt * scale)))
  const context = canvas.getContext('2d')
  context.drawImage(upperImage, 0, 0, Math.round(upper.width * scale), Math.round(upper.height * scale))
  context.drawImage(
    lowerImage,
    Math.round((lower.x - upper.x) * scale),
    Math.round((lower.y - upper.y) * scale),
    Math.round(lower.width * scale),
    Math.round(lower.height * scale)
  )

  return {
    ...upperElement,
    data: canvas.toDataURL('image/png'),
    format: 'png',
    width: widthPt,
    height: heightPt,
    actualWidth: canvas.width,
    actualHeight: canvas.height
  }
}

/**
 * Merge vertically adjacent crops of one printed artwork back into single
 * image elements. Operates on the extractor's per-page output (data-URL
 * stage, before any file saving), so downstream element creation is unchanged.
 * Chains merge transitively (an artwork split into three crops collapses in
 * two passes). Returns the input array untouched when nothing qualifies or
 * when canvas is unavailable.
 */
export async function mergeSplitImageCrops(images: ExtractedImage[]): Promise<ExtractedImage[]> {
  if (images.length < 2) { return images }

  let canvasModule: CanvasModule | null | undefined
  const result = [...images]
  let merged = true
  while (merged) {
    merged = false
    const crops = cropGeometry(result)
    outer: for (const a of crops) {
      for (const b of crops) {
        if (a.index === b.index) { continue }
        const [upper, lower] = a.y <= b.y ? [a, b] : [b, a]
        if (!isMergeCandidate(upper, lower)) { continue }

        // Candidates are rare: only now pay for canvas and pixel decodes.
        canvasModule = canvasModule === undefined ? await loadCanvasModule() : canvasModule
        if (!canvasModule) { return images }
        let upperImage: CanvasImage
        let lowerImage: CanvasImage
        try {
          upperImage = await canvasModule.loadImage(result[upper.index].data)
          lowerImage = await canvasModule.loadImage(result[lower.index].data)
        } catch {
          continue
        }

        const difference = seamDifference(canvasModule, upper, upperImage, lower, lowerImage)
        if (difference > SEAM_MAX_MEAN_DIFF) { continue }

        const combined = compositeCrops(canvasModule, upper, upperImage, result[upper.index], lower, lowerImage)
        logger.info(
          `Merged split image crops ${result[upper.index].id} + ${result[lower.index].id} `
          + `(overlap ${(upper.y + upper.height - lower.y).toFixed(2)}pt, seam diff ${difference.toFixed(1)})`
        )
        result.splice(Math.max(upper.index, lower.index), 1)
        result.splice(Math.min(upper.index, lower.index), 1, combined)
        merged = true
        break outer
      }
    }
  }
  return result
}
