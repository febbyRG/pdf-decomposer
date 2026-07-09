/**
 * Formatted-HTML post-processing for merged composites: span optimization and
 * cleanup. Pure string transforms, no I/O.
 */

interface ParsedSpan {
  attributes: string
  content: string
  styles: Record<string, string>
}

/**
 * Optimize formatted HTML by merging spans with similar or compatible styling.
 * Header elements get more permissive merge rules (same size + family wins,
 * color may be missing on some spans).
 */
export function optimizeFormattedHtml(html: string, isHeaderElement = false): string {
  if (!html || html.trim().length === 0) return ''

  // Parse spans and extract their content and styling
  const spanRegex = /<span([^>]*)>(.*?)<\/span>/g
  const spans: ParsedSpan[] = []
  let match

  while ((match = spanRegex.exec(html)) !== null) {
    const attributes = match[1]
    const content = match[2]

    // Parse style attributes
    const styles: Record<string, string> = {}
    const styleMatch = attributes.match(/style="([^"]*)"/)
    if (styleMatch) {
      const styleString = styleMatch[1]
      styleString.split(';').forEach(rule => {
        const [property, value] = rule.split(':').map(s => s.trim())
        if (property && value) {
          styles[property] = value
        }
      })
    }

    spans.push({ attributes, content, styles })
  }

  // If no spans found, return original
  if (spans.length === 0) return html

  // Check if all spans can be merged (header elements have special rules)
  if (canMergeAllSpans(spans, isHeaderElement)) {
    // Merge all spans into one with the most complete styling
    const mergedStyles = getMergedStyles(spans, isHeaderElement)

    let mergedContent: string
    if (isHeaderElement) {
      // For headers, extract the text content from inside header tags and merge into single header
      const headerTexts: string[] = []
      let headerTag = 'h2' // default

      spans.forEach(span => {
        // Extract header tag and text content
        const headerMatch = span.content.match(/<(h[1-6])>(.*?)<\/h[1-6]>/g)
        if (headerMatch) {
          headerMatch.forEach(fragment => {
            const tagMatch = fragment.match(/<(h[1-6])>(.*?)<\/h[1-6]>/)
            if (tagMatch) {
              headerTag = tagMatch[1] // Get the header level (h1, h2, etc)
              const text = tagMatch[2].trim()
              if (text && text !== '') {
                headerTexts.push(text)
              }
            }
          })
        }
      })

      // Merge all header texts into one header tag
      mergedContent = `<${headerTag}>${headerTexts.join(' ')}</${headerTag}>`
    } else {
      // For non-headers, use original logic
      mergedContent = spans.map(s => s.content).join(' ')
    }

    const styleString = Object.entries(mergedStyles)
      .map(([prop, value]) => `${prop}: ${value}`)
      .join('; ')

    return `<span style="${styleString}">${mergedContent}</span>`
  }

  // Otherwise, return original html (could add more sophisticated merging later)
  return html
}

/**
 * Check if all spans can be merged based on their styling compatibility.
 */
function canMergeAllSpans(spans: Array<Pick<ParsedSpan, 'styles'>>, isHeaderElement = false): boolean {
  if (spans.length <= 1) return true

  // For header elements, be more permissive about merging: headers should be
  // semantically consistent even if some spans lack certain styles.
  if (isHeaderElement) {
    const firstSpan = spans[0]
    const baseSize = firstSpan.styles['font-size']
    const baseFamily = firstSpan.styles['font-family']

    return spans.every(span => {
      const spanSize = span.styles['font-size']
      const spanFamily = span.styles['font-family']

      // Same size and family are required for headers
      return spanSize === baseSize && spanFamily === baseFamily
    })
  }

  // For non-header elements, use the strict compatibility logic:
  // get the base styles from the span that has the most complete styling
  const mostCompleteSpan = spans.reduce((prev, current) => {
    return Object.keys(current.styles).length > Object.keys(prev.styles).length ? current : prev
  })

  // A span is compatible if it has the same values for properties that exist
  // in both and does not contradict the most complete span.
  return spans.every(span => {
    return Object.entries(span.styles).every(([prop, value]) => {
      const baseValue = mostCompleteSpan.styles[prop]
      return !baseValue || baseValue === value
    })
  })
}

/**
 * Merge styles from multiple spans, prioritizing the most complete styling
 * (headers prioritize the span carrying color for semantic consistency).
 */
function getMergedStyles(spans: Array<Pick<ParsedSpan, 'styles'>>, isHeaderElement = false): Record<string, string> {
  const merged: Record<string, string> = {}

  if (isHeaderElement) {
    const spanWithColor = spans.find(span => span.styles.color)
    const mostCompleteSpan = spanWithColor || spans.reduce((prev, current) => {
      return Object.keys(current.styles).length > Object.keys(prev.styles).length ? current : prev
    })

    Object.assign(merged, mostCompleteSpan.styles)

    // Add any additional properties from other spans that don't conflict
    spans.forEach(span => {
      Object.entries(span.styles).forEach(([prop, value]) => {
        if (!merged[prop]) {
          merged[prop] = value
        }
      })
    })
  } else {
    const mostCompleteSpan = spans.reduce((prev, current) => {
      return Object.keys(current.styles).length > Object.keys(prev.styles).length ? current : prev
    })

    Object.assign(merged, mostCompleteSpan.styles)

    spans.forEach(span => {
      Object.entries(span.styles).forEach(([prop, value]) => {
        if (!merged[prop]) {
          merged[prop] = value
        }
      })
    })
  }

  return merged
}

/**
 * Clean up formatted HTML by removing empty span-wrapped headers and
 * collapsing runs of whitespace.
 */
export function cleanupFormattedHtml(html: string): string {
  if (!html || html.trim().length === 0) return ''

  let cleaned = html

  // Simple, direct approach - remove empty span headers
  cleaned = cleaned.replace(/<span[^>]*><h[1-6]> <\/h[1-6]><\/span>/g, '')
  cleaned = cleaned.replace(/<span[^>]*><h[1-6]>\s+<\/h[1-6]><\/span>/g, '')
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()

  return cleaned
}
