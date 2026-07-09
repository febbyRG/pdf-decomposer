import type { Composite } from './types.js'

/**
 * Stage 3 — Text Type Classification: label each composite as a heading level
 * (h1-h5) or paragraph from its font size relative to the character-weighted
 * page average. Classification only; never adds or removes composites.
 */

// Heading levels as multiples of the page's average font size.
const HEADING_FONT_RATIOS: Array<{ type: string, ratio: number }> = [
  { type: 'h1', ratio: 2.1 },
  { type: 'h2', ratio: 1.75 },
  { type: 'h3', ratio: 1.5 },
  { type: 'h4', ratio: 1.25 },
  { type: 'h5', ratio: 1.1 }
]

// Long text is body copy regardless of font size.
const MAX_HEADING_WORD_COUNT = 15

export function classifyTextTypes(composites: Composite[]): Composite[] {
  if (composites.length === 0) return composites

  // Character-weighted average font size
  const weightedPairs = composites.map(comp => [comp.attributes.fontSize, comp.data.length])
  const totalCharacters = weightedPairs.reduce((sum, [, charCount]) => sum + charCount, 0)
  const aggregatedSum = weightedPairs.reduce((sum, [fontSize, charCount]) => sum + fontSize * charCount, 0)
  const averageFontSize = totalCharacters > 0 ? aggregatedSum / totalCharacters : 12

  const headingThresholds = HEADING_FONT_RATIOS.map(({ type, ratio }) => ({
    type,
    size: ratio * averageFontSize
  }))

  for (const composite of composites) {
    const fontSize = composite.attributes.fontSize
    const wordCount = composite.data.split(/\s+/).filter(str => str !== '').length
    const isLongText = wordCount > MAX_HEADING_WORD_COUNT

    if (fontSize > averageFontSize && !isLongText) {
      // Find the appropriate heading level (floor comparison)
      const heading = headingThresholds.find(threshold => threshold.size <= fontSize)
      composite.attributes.type = heading ? heading.type : 'h5'
    } else {
      composite.attributes.type = 'paragraph'
    }
  }

  return composites
}
