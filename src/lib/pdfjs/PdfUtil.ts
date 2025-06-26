import { capitalCase } from 'change-case'
import { paramCase } from 'param-case'

export interface PdfImage {
  kind: 1 | 2 | 3
  data: Uint8ClampedArray
}

export function transformRgbToRgba(data: any) {
  const length = data.length / 3 * 4
  const result = new Uint8ClampedArray(length)
  for (let i = 0; i < data.length; i += 3) {
    const j = i / 3 * 4
    result[j + 0] = data[i + 0]
    result[j + 1] = data[i + 1]
    result[j + 2] = data[i + 2]
    result[j + 3] = 255
  }
  return result
}

export function transformGrayscaleToRgba(data: any) {
  const length = data.length * 4
  const result = new Uint8ClampedArray(length)
  for (let i = 0; i < data.length; i += 1) {
    const j = i * 4
    result[j + 0] = data[i]
    result[j + 1] = data[i]
    result[j + 2] = data[i]
    result[j + 3] = 255
  }
  return result
}

export function transformImageToArray(image: PdfImage): Uint8ClampedArray {
  if (image.kind === 1) {
    return transformGrayscaleToRgba(image.data)
  } else if (image.kind === 2) {
    return transformRgbToRgba(image.data)
  }
  return image.data
}

export function parseFontName(raw: string) {
  const result = { raw, identifier: '', fontFamily: raw.replace(/^.+\+/, ''), fontWeight: 'regular', fontStyle: 'normal' }
  if (/-regular$/i.test(result.fontFamily)) {
    result.fontFamily = result.fontFamily.replace(/-regular$/i, '')
  }
  if (/-bold$/i.test(result.fontFamily)) {
    result.fontFamily = result.fontFamily.replace(/-bold$/i, '')
    result.fontWeight = 'bold'
  }
  if (/-extrabold$/i.test(result.fontFamily)) {
    result.fontFamily = result.fontFamily.replace(/-extrabold$/i, '')
    result.fontWeight = 'bold'
  }
  if (/-black$/i.test(result.fontFamily)) {
    result.fontFamily = result.fontFamily.replace(/-black$/i, '')
    result.fontWeight = 'bold'
  }
  if (/-italic$/i.test(result.fontFamily)) {
    result.fontFamily = result.fontFamily.replace(/-italic$/i, '')
    result.fontStyle = 'italic'
  }
  if (/-oblique$/i.test(result.fontFamily)) {
    result.fontFamily = result.fontFamily.replace(/-oblique$/i, '')
    result.fontStyle = 'italic'
  }
  result.fontFamily = capitalCase(result.fontFamily)
  result.identifier = paramCase(result.fontFamily)
  return result
}

export function rgbToHex([r, g, b]: number[]) {
  const hex = [r, g, b].map((value) => value.toString(16).padStart(2, '0'))
  return `#${hex.join('')}`
}

export function hexToRgb(hex: string) {
  const match = hex.match(/^#([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})$/)
  if (!match) return [0, 0, 0]
  const [, r, g, b] = match
  return [parseInt(r, 16), parseInt(g, 16), parseInt(b, 16)]
}
