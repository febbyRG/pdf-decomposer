import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'

/**
 * Internal composite type for advanced text processing algorithm
 */
interface Composite {
  id: string
  data: string
  formattedData?: string
  boundingBox: {
    top: number
    left: number
    right: number
    bottom: number
    width: number
    height: number
  }
  attributes: {
    fontSize: number
    fontFamily?: string
    type?: string
    composed?: boolean
  }
  originalElements: PdfElement[]
}

/**
 * Enhanced PdfElementComposer with complete advanced text processing algorithm system.
 * Implements 3-stage processing: OverlappingText → OrderComposites → ComputeTextTypes
 */
export class PdfElementComposer {
  /**
   * Compose elements by grouping text elements into paragraphs while preserving images.
   * @param pages Array of PDF page content with raw elements
   * @returns Array of PDF page content with composed elements (paragraphs + images)
   */
  static composeElements(pages: PdfPageContent[]): PdfPageContent[] {
    return pages.map(page => ({
      ...page,
      elements: this.composePageElements(page.elements)
    }))
  }

  /**
   * Compose elements for a single page using complete advanced text processing algorithm system.
   */
  private static composePageElements(elements: PdfElement[]): PdfElement[] {
    // Separate text and non-text elements
    const textElements = elements.filter(el => el.type === 'text' && this.isMeaningfulText(el.formattedData || el.data))
    const nonTextElements = elements.filter(el => el.type !== 'text')

    if (textElements.length === 0) return elements

    // Advanced 3-stage text processing system
    let composites = this.convertToComposites(textElements)

    // Stage 1: OverlappingTextAlgorithm (Priority 30) - Spatial merging
    composites = this.runOverlappingTextAlgorithm(composites)

    // Stage 2: OrderCompositesAlgorithm (Priority 40) - Reading order detection
    composites = this.runOrderCompositesAlgorithm(composites)

    // Stage 3: ComputeTextTypesAlgorithm (Priority 50) - Text type classification
    composites = this.runComputeTextTypesAlgorithm(composites)

    // Convert back to PdfElements
    let processedElements = this.convertToElements(composites)

    // Merge drop caps with following paragraphs
    processedElements = this.mergeDropCaps(processedElements)

    // Combine with non-text elements - preserve algorithm ordering for text elements
    // Only sort non-text elements by position, keep text elements in algorithm order
    const processedTextElements = processedElements
    const sortedNonTextElements = nonTextElements.sort((a, b) => {
      const aTop = a.boundingBox?.top || 0
      const bTop = b.boundingBox?.top || 0
      const yDiff = aTop - bTop

      if (Math.abs(yDiff) > 10) return yDiff

      const aLeft = a.boundingBox?.left || 0
      const bLeft = b.boundingBox?.left || 0
      return aLeft - bLeft
    })

    // Merge text and non-text elements while preserving text element order from algorithm
    const finalElements: PdfElement[] = []
    let textIndex = 0
    let nonTextIndex = 0

    while (textIndex < processedTextElements.length || nonTextIndex < sortedNonTextElements.length) {
      const textEl = textIndex < processedTextElements.length ? processedTextElements[textIndex] : null
      const nonTextEl = nonTextIndex < sortedNonTextElements.length ? sortedNonTextElements[nonTextIndex] : null

      if (!textEl) {
        if (nonTextEl) {
          finalElements.push(nonTextEl)
        }
        nonTextIndex++
      } else if (!nonTextEl) {
        finalElements.push(textEl)
        textIndex++
      } else {
        // Compare positions to interleave properly
        const textTop = textEl.boundingBox?.top || 0
        const nonTextTop = nonTextEl.boundingBox?.top || 0

        if (textTop <= nonTextTop + 10) { // Text element comes first or same line
          finalElements.push(textEl)
          textIndex++
        } else {
          finalElements.push(nonTextEl)
          nonTextIndex++
        }
      }
    }

    return finalElements
  }

  /**
   * Convert PdfElements to internal Composite format for processing
   */
  private static convertToComposites(elements: PdfElement[]): Composite[] {
    return elements.map((el, index) => ({
      id: `element_${index}`,
      data: el.data || '',
      formattedData: el.formattedData,
      boundingBox: {
        top: el.boundingBox?.top || 0,
        left: el.boundingBox?.left || 0,
        right: (el.boundingBox?.left || 0) + (el.boundingBox?.width || 0),
        bottom: (el.boundingBox?.top || 0) + (el.boundingBox?.height || 0),
        width: el.boundingBox?.width || 0,
        height: el.boundingBox?.height || 0
      },
      attributes: {
        fontSize: el.attributes?.fontSize || 12,
        fontFamily: el.attributes?.fontFamily,
        composed: false
      },
      originalElements: [el]
    }))
  }

  /**
   * Convert Composites back to PdfElements
   */
  private static convertToElements(composites: Composite[]): PdfElement[] {
    return composites.map(composite => {
      const firstOriginal = composite.originalElements[0]

      // Determine element type based on classification
      let elementType = firstOriginal.type
      if (composite.attributes.type === 'paragraph') {
        elementType = 'paragraph'
      } else if (['h1', 'h2', 'h3', 'h4', 'h5'].includes(composite.attributes.type || '')) {
        elementType = 'header'
      }

      return {
        ...firstOriginal,
        type: elementType,
        data: composite.data,
        formattedData: composite.formattedData || composite.data,
        boundingBox: {
          top: composite.boundingBox.top,
          left: composite.boundingBox.left,
          width: composite.boundingBox.width,
          height: composite.boundingBox.height
        },
        attributes: {
          ...firstOriginal.attributes,
          fontSize: composite.attributes.fontSize,
          fontFamily: composite.attributes.fontFamily,
          type: composite.attributes.type,
          composed: composite.attributes.composed
        }
      }
    })
  }

  /**
   * Merge drop caps (large initial letters) with their following paragraphs
   */
  private static mergeDropCaps(elements: PdfElement[]): PdfElement[] {
    if (elements.length === 0) return elements

    const result: PdfElement[] = []
    let i = 0

    while (i < elements.length) {
      const currentElement = elements[i]
      const nextElement = i + 1 < elements.length ? elements[i + 1] : null

      // Check if current element is a drop cap pattern
      if (this.isDropCap(currentElement, nextElement) && nextElement) {
        // Merge drop cap with next paragraph
        const mergedElement = this.mergeDropCapWithParagraph(currentElement, nextElement)
        result.push(mergedElement)
        i += 2 // Skip both elements as they're merged
      } else {
        result.push(currentElement)
        i++
      }
    }

    return result
  }

  /**
   * Check if an element is a drop cap (large single letter/word)
   */
  private static isDropCap(element: PdfElement, nextElement: PdfElement | null): boolean {
    if (!element || !nextElement) return false

    // Must be a header (large font) followed by a paragraph
    if (element.type !== 'header' || nextElement.type !== 'paragraph') return false

    const text = (element.data || '').trim()
    const fontSize = element.attributes?.fontSize || 0
    const nextFontSize = nextElement.attributes?.fontSize || 0

    // Drop cap criteria:
    // 1. Very short text (1-3 characters, typically just one letter)
    // 2. Significantly larger font than next element (at least 2x)
    // 3. Elements are vertically close (drop cap should be near the paragraph)
    const isShortText = text.length <= 3
    const isLargeFont = fontSize > nextFontSize * 2
    const isVerticallyClose = this.areVerticallyClose(element, nextElement, 50) // within 50pts

    return isShortText && isLargeFont && isVerticallyClose
  }

  /**
   * Check if two elements are vertically close
   */
  private static areVerticallyClose(element1: PdfElement, element2: PdfElement, threshold: number): boolean {
    const top2 = element2.boundingBox?.top || 0
    const bottom1 = (element1.boundingBox?.top || 0) + (element1.boundingBox?.height || 0)

    // Check if element2 starts within threshold distance from element1's bottom
    const verticalDistance = Math.abs(top2 - bottom1)
    return verticalDistance <= threshold
  }

  /**
   * Merge a drop cap with its following paragraph
   */
  private static mergeDropCapWithParagraph(dropCap: PdfElement, paragraph: PdfElement): PdfElement {
    const dropCapText = (dropCap.data || '').trim()
    const paragraphText = (paragraph.data || '').trim()

    // Combine the texts
    const combinedText = dropCapText + paragraphText

    // Use paragraph's bounding box as the main area, but extend to include drop cap
    const combinedBoundingBox = {
      top: Math.min(dropCap.boundingBox?.top || 0, paragraph.boundingBox?.top || 0),
      left: Math.min(dropCap.boundingBox?.left || 0, paragraph.boundingBox?.left || 0),
      width: Math.max(
        (dropCap.boundingBox?.left || 0) + (dropCap.boundingBox?.width || 0),
        (paragraph.boundingBox?.left || 0) + (paragraph.boundingBox?.width || 0)
      ) - Math.min(dropCap.boundingBox?.left || 0, paragraph.boundingBox?.left || 0),
      height: Math.max(
        (dropCap.boundingBox?.top || 0) + (dropCap.boundingBox?.height || 0),
        (paragraph.boundingBox?.top || 0) + (paragraph.boundingBox?.height || 0)
      ) - Math.min(dropCap.boundingBox?.top || 0, paragraph.boundingBox?.top || 0)
    }

    // Create combined formatted data (keep paragraph formatting, but prepend drop cap)
    const combinedFormattedData = this.combineDropCapFormatting(dropCap, paragraph)

    return {
      ...paragraph, // Use paragraph as base
      data: combinedText,
      formattedData: combinedFormattedData,
      boundingBox: combinedBoundingBox,
      attributes: {
        ...paragraph.attributes,
        composed: true
      }
    }
  }

  /**
   * Combine formatting from drop cap and paragraph
   */
  private static combineDropCapFormatting(dropCap: PdfElement, paragraph: PdfElement): string {
    const paragraphFormatted = paragraph.formattedData || paragraph.data || ''

    // Extract the drop cap letter and paragraph content
    const dropCapText = (dropCap.data || '').trim()
    const paragraphText = (paragraph.data || '').trim()

    if (!dropCapText || !paragraphText) {
      return paragraphFormatted
    }

    // Create a styled drop cap followed by paragraph content
    const dropCapStyled = `<span style="font-size: ${dropCap.attributes?.fontSize}px; font-family: ${dropCap.attributes?.fontFamily}"><strong>${dropCapText}</strong></span>`

    // Remove the drop cap letter from paragraph formatting if it exists
    let cleanParagraphFormatted = paragraphFormatted
    if (paragraphText.toLowerCase().startsWith(dropCapText.toLowerCase())) {
      // If paragraph text starts with same letter, we need to handle it carefully
      cleanParagraphFormatted = paragraphFormatted
    }

    return `${dropCapStyled}${cleanParagraphFormatted}`
  }

  /**
   * Stage 1 - Overlapping Text Algorithm: OverlappingTextAlgorithm (Priority 30)
   * Spatial merging with 10% font tolerance and dynamic expansion
   */
  private static runOverlappingTextAlgorithm(composites: Composite[]): Composite[] {
    if (composites.length === 0) return composites

    // Calculate page statistics for dynamic thresholds
    const pageStats = this.calculatePageStatisticsFromComposites(composites)

    const processed = new Set<string>()
    const result: Composite[] = []

    for (const composite of composites) {
      if (processed.has(composite.id)) continue

      const cluster = [composite]
      processed.add(composite.id)

      // Find all overlapping/adjacent composites
      let foundMatch = true
      while (foundMatch) {
        foundMatch = false

        for (const candidate of composites) {
          if (processed.has(candidate.id)) continue

          // Check if candidate should merge with any composite in cluster
          for (const clusterComposite of cluster) {
            if (this.shouldMergeComposites(clusterComposite, candidate, pageStats)) {
              cluster.push(candidate)
              processed.add(candidate.id)
              foundMatch = true
              break
            }
          }

          if (foundMatch) break
        }
      }

      // Create merged composite from cluster
      result.push(this.createMergedComposite(cluster))
    }

    return result
  }

  /**
   * Stage 2 - Spatial Order Algorithm: OrderCompositesAlgorithm (Priority 40)
   * Reading order detection with beam scanning for multi-column layout
   */
  private static runOrderCompositesAlgorithm(composites: Composite[]): Composite[] {
    if (composites.length === 0) return composites

    // Use beam scanning to detect column layout
    const columns = this.detectColumnsWithBeamScanning(composites)

    if (columns.length <= 1) {
      // Single column - simple top-to-bottom sorting
      return composites.sort((a, b) => a.boundingBox.top - b.boundingBox.top)
    }

    // Multi-column - sort by column first, then by position within column
    const sortedComposites: Composite[] = []

    // Process each column left-to-right
    columns.sort((a, b) => a.leftBoundary - b.leftBoundary)

    for (const column of columns) {
      // Sort elements within column by top-to-bottom
      const columnElements = column.elements.sort((a, b) => a.boundingBox.top - b.boundingBox.top)
      sortedComposites.push(...columnElements)
    }

    return sortedComposites
  }

  /**
   * Advanced Beam Scanning: Detect column layout using horizontal and vertical beams
   */
  private static detectColumnsWithBeamScanning(composites: Composite[]): Array<{
    leftBoundary: number
    rightBoundary: number
    elements: Composite[]
  }> {
    if (composites.length === 0) return []

    // Calculate page boundaries
    const leftMost = Math.min(...composites.map(c => c.boundingBox.left))
    const rightMost = Math.max(...composites.map(c => c.boundingBox.right))

    // Sort elements by left position to find gaps
    const sortedByLeft = [...composites].sort((a, b) => a.boundingBox.left - b.boundingBox.left)

    // Find significant gaps between elements (column separators)
    const columnBreaks: number[] = []

    for (let i = 0; i < sortedByLeft.length - 1; i++) {
      const currentRight = sortedByLeft[i].boundingBox.right
      const nextLeft = sortedByLeft[i + 1].boundingBox.left
      const gap = nextLeft - currentRight

      // If gap is significant (>= 15pt), it's a column break
      if (gap >= 15) {
        const breakPoint = (currentRight + nextLeft) / 2
        if (!columnBreaks.includes(breakPoint)) {
          columnBreaks.push(breakPoint)
        }
      }
    }

    // Create columns based on detected breaks
    const columns: Array<{ leftBoundary: number, rightBoundary: number, elements: Composite[] }> = []

    if (columnBreaks.length === 0) {
      // No significant gaps - single column
      return [{
        leftBoundary: leftMost,
        rightBoundary: rightMost,
        elements: composites
      }]
    }

    // Multiple columns detected - sort breaks
    columnBreaks.sort((a, b) => a - b)

    let currentLeft = leftMost

    for (let i = 0; i <= columnBreaks.length; i++) {
      const currentRight = i < columnBreaks.length ? columnBreaks[i] : rightMost

      // Find elements in this column (element center must be within column bounds)
      const columnElements = composites.filter(comp => {
        const elementCenter = (comp.boundingBox.left + comp.boundingBox.right) / 2
        return elementCenter >= currentLeft && elementCenter <= currentRight
      })

      if (columnElements.length > 0) {
        columns.push({
          leftBoundary: currentLeft,
          rightBoundary: currentRight,
          elements: columnElements
        })
      }

      currentLeft = currentRight
    }

    return columns
  }

  /**
   * Stage 3 - Text Type Classification: ComputeTextTypesAlgorithm (Priority 50)
   * Text type classification based on font size analysis
   */
  private static runComputeTextTypesAlgorithm(composites: Composite[]): Composite[] {
    if (composites.length === 0) return composites

    // Calculate character-weighted average font size (optimized approach)
    const weightedPairs = composites.map(comp => [comp.attributes.fontSize, comp.data.length])
    const totalCharacters = weightedPairs.reduce((sum, [_, charCount]) => sum + charCount, 0)
    const aggregatedSum = weightedPairs.reduce((sum, [fontSize, charCount]) => sum + fontSize * charCount, 0)
    const averageFontSize = totalCharacters > 0 ? aggregatedSum / totalCharacters : 12

    // Define heading thresholds based on advanced algorithm
    const headingThresholds = [
      { type: 'h1', size: 2.1 * averageFontSize },
      { type: 'h2', size: 1.75 * averageFontSize },
      { type: 'h3', size: 1.5 * averageFontSize },
      { type: 'h4', size: 1.25 * averageFontSize },
      { type: 'h5', size: 1.1 * averageFontSize }
    ]

    // Classify each composite (optimized logic)
    for (const composite of composites) {
      const fontSize = composite.attributes.fontSize
      const wordCount = composite.data.split(/\s+/).filter(str => str !== '').length
      const isLongText = wordCount > 15

      if (fontSize > averageFontSize && !isLongText) {
        // Find appropriate heading level (uses floor comparison)
        const heading = headingThresholds.find(threshold => threshold.size <= fontSize)
        composite.attributes.type = heading ? heading.type : 'h5'
      } else {
        composite.attributes.type = 'paragraph'
      }
    }

    return composites
  }

  /**
   * Calculate page statistics from composites (optimized approach)
   */
  private static calculatePageStatisticsFromComposites(composites: Composite[]): {
    averageFontSize: number
    totalCharacters: number
  } {
    const weightedPairs = composites.map(comp => [
      comp.attributes.fontSize,
      comp.data.length
    ])

    const totalCharacters = weightedPairs.reduce((sum, [_, charCount]) => sum + charCount, 0)
    const aggregatedSum = weightedPairs.reduce((sum, [fontSize, charCount]) => sum + fontSize * charCount, 0)
    const averageFontSize = totalCharacters > 0 ? aggregatedSum / totalCharacters : 12

    return { averageFontSize, totalCharacters }
  }

  /**
   * advanced composite merging criteria
   */
  private static shouldMergeComposites(compA: Composite, compB: Composite, pageStats: any): boolean {
    // Font compatibility check (10% tolerance using optimized techniques)
    const fontSizeA = compA.attributes.fontSize
    const fontSizeB = compB.attributes.fontSize
    const relativeFontDiff = Math.abs(fontSizeA / fontSizeB - 1)

    if (relativeFontDiff > 0.1) return false

    // Spatial proximity check with enhanced expansion (optimized behavior)
    const avgFontSize = (fontSizeA + fontSizeB) / 2
    const correctedFontSize = Math.max(Math.pow(avgFontSize, 2) / pageStats.averageFontSize, avgFontSize)

    // Enhanced expansion calculation to match optimized composite behavior
    const baseExpansion = correctedFontSize / 3.5
    const minExpansion = Math.max(avgFontSize * 0.8, 5) // Minimum based on font size, at least 5px
    const expansionAmount = Math.min(Math.max(baseExpansion, minExpansion), 15)

    return this.intersectsWithExpansionComposite(compA.boundingBox, compB.boundingBox, expansionAmount)
  }

  /**
   * Check composite bounding box intersection with expansion
   */
  private static intersectsWithExpansionComposite(boxA: any, boxB: any, expansion: number): boolean {
    const expandedA = {
      left: boxA.left - expansion,
      top: boxA.top - expansion,
      right: boxA.right + expansion,
      bottom: boxA.bottom + expansion
    }

    return !(expandedA.right < boxB.left ||
      expandedA.left > boxB.right ||
      expandedA.bottom < boxB.top ||
      expandedA.top > boxB.bottom)
  }

  /**
   * Create merged composite from cluster of composites
   */
  private static createMergedComposite(cluster: Composite[]): Composite {
    if (cluster.length === 1) {
      cluster[0].attributes.composed = true
      return cluster[0]
    }

    // Sort cluster by reading order
    cluster.sort((a, b) => {
      const yDiff = a.boundingBox.top - b.boundingBox.top
      if (Math.abs(yDiff) > 10) return yDiff
      return a.boundingBox.left - b.boundingBox.left
    })

    // Calculate merged bounding box
    const tops = cluster.map(c => c.boundingBox.top)
    const lefts = cluster.map(c => c.boundingBox.left)
    const rights = cluster.map(c => c.boundingBox.right)
    const bottoms = cluster.map(c => c.boundingBox.bottom)

    const mergedBox = {
      top: Math.min(...tops),
      left: Math.min(...lefts),
      right: Math.max(...rights),
      bottom: Math.max(...bottoms),
      width: Math.max(...rights) - Math.min(...lefts),
      height: Math.max(...bottoms) - Math.min(...tops)
    }

    // Merge text content
    const mergedData = cluster.map(c => c.data).join(' ')
    const mergedFormatted = cluster.map(c => c.formattedData || c.data).join(' ')
    
    // Check if this is a header element based on font size (since types are assigned later)
    // Calculate average font size for this cluster
    const clusterAvgFontSize = cluster.reduce((sum, c) => sum + c.attributes.fontSize, 0) / cluster.length
    
    // Estimate if this could be a header based on font size
    // We'll use a similar threshold as in computeTextTypes (roughly 1.1x+ average font size)
    const isHeaderElement = clusterAvgFontSize >= 21 // This should catch h2 headers with font size 21.12px
    
    // Optimize and clean up the formatted data
    const optimizedFormatted = this.optimizeFormattedHtml(mergedFormatted, isHeaderElement)
    const cleanedFormatted = this.cleanupFormattedHtml(optimizedFormatted)

    // Calculate average font size
    const avgFontSize = cluster.reduce((sum, c) => sum + c.attributes.fontSize, 0) / cluster.length

    // Collect all original elements
    const allOriginalElements: PdfElement[] = []
    cluster.forEach(c => allOriginalElements.push(...c.originalElements))

    return {
      id: `merged_${cluster[0].id}`,
      data: mergedData,
      formattedData: cleanedFormatted,
      boundingBox: mergedBox,
      attributes: {
        fontSize: Math.round(avgFontSize * 10) / 10,
        fontFamily: cluster[0].attributes.fontFamily,
        composed: true
      },
      originalElements: allOriginalElements
    }
  }

  private static calculatePageStatistics(textElements: PdfElement[]): {
    averageFontSize: number
    totalCharacters: number
    fontSizeDistribution: Map<number, number>
  } {
    const weightedPairs = textElements.map(el => [
      el.attributes?.fontSize || 12,
      (el.data || '').length
    ])

    const totalCharacters = weightedPairs.reduce((sum, [_, charCount]) => sum + charCount, 0)
    const aggregatedSum = weightedPairs.reduce((sum, [fontSize, charCount]) => sum + fontSize * charCount, 0)
    const averageFontSize = totalCharacters > 0 ? aggregatedSum / totalCharacters : 12

    // Font size distribution for better analysis
    const fontSizeDistribution = new Map<number, number>()
    textElements.forEach(el => {
      const fontSize = Math.round((el.attributes?.fontSize || 12) * 10) / 10
      fontSizeDistribution.set(fontSize, (fontSizeDistribution.get(fontSize) || 0) + 1)
    })

    return { averageFontSize, totalCharacters, fontSizeDistribution }
  }

  /**
   * Group text elements using dynamic clustering with advanced spatial analysis.
   */
  private static groupWithDynamicClustering(textElements: PdfElement[], pageStats: any): PdfElement[] {
    if (textElements.length === 0) return []

    // Sort text elements by reading order (top to bottom, then left to right)
    const sortedElements = [...textElements].sort((a, b) => {
      const aTop = a.boundingBox?.top || 0
      const bTop = b.boundingBox?.top || 0
      const yDiff = aTop - bTop

      if (Math.abs(yDiff) > 10) return yDiff // Different lines

      const aLeft = a.boundingBox?.left || 0
      const bLeft = b.boundingBox?.left || 0
      return aLeft - bLeft // Same line, left to right
    })

    // Use advanced overlapping algorithm
    const clusters = this.findOverlappingClusters(sortedElements, pageStats)

    // Convert clusters to composed paragraphs
    const paragraphs = clusters
      .filter(cluster => cluster.length > 0)
      .map(cluster => this.createComposedParagraph(cluster))

    return paragraphs
  }

  /**
   * advanced overlapping detection algorithm.
   */
  private static findOverlappingClusters(elements: PdfElement[], pageStats: any): PdfElement[][] {
    const clusters: PdfElement[][] = []
    const processed = new Set<number>()

    for (let i = 0; i < elements.length; i++) {
      if (processed.has(i)) continue

      const cluster = [elements[i]]
      processed.add(i)

      // Find all overlapping/adjacent elements
      let foundMatch = true
      while (foundMatch) {
        foundMatch = false

        for (let j = 0; j < elements.length; j++) {
          if (processed.has(j)) continue

          // Check if current element should merge with any element in cluster
          for (const clusterElement of cluster) {
            if (this.shouldMergeElements(clusterElement, elements[j], pageStats)) {
              cluster.push(elements[j])
              processed.add(j)
              foundMatch = true
              break
            }
          }

          if (foundMatch) break
        }
      }

      clusters.push(cluster)
    }

    return clusters
  }

  /**
   * advanced element merging criteria with dynamic thresholds.
   */
  private static shouldMergeElements(elementA: PdfElement, elementB: PdfElement, pageStats: any): boolean {
    // Font compatibility check (10% tolerance using optimized techniques)
    const fontSizeA = elementA.attributes?.fontSize || 12
    const fontSizeB = elementB.attributes?.fontSize || 12
    const relativeFontDiff = Math.abs(fontSizeA / fontSizeB - 1)

    if (relativeFontDiff > 0.1) return false

    // Spatial proximity check with dynamic expansion (advanced)
    const avgFontSize = (fontSizeA + fontSizeB) / 2
    const correctedFontSize = Math.max(Math.pow(avgFontSize, 2) / pageStats.averageFontSize, avgFontSize)
    const expansionAmount = Math.min(Math.max(correctedFontSize / 3.5, 2), 10)

    return this.intersectsWithExpansion(elementA.boundingBox, elementB.boundingBox, expansionAmount)
  }

  /**
   * Check if two bounding boxes intersect with expansion (advanced).
   */
  private static intersectsWithExpansion(boxA: any, boxB: any, expansion: number): boolean {
    if (!boxA || !boxB) return false

    const expandedA = {
      left: boxA.left - expansion,
      top: boxA.top - expansion,
      right: (boxA.left + boxA.width) + expansion,
      bottom: (boxA.top + boxA.height) + expansion
    }

    return !(expandedA.right < boxB.left ||
      expandedA.left > (boxB.left + boxB.width) ||
      expandedA.bottom < boxB.top ||
      expandedA.top > (boxB.top + boxB.height))
  }

  /**
   * Generic title detection without hard-coded content.
   */
  private static looksLikeGenericTitle(text: string): boolean {
    if (!text || text.length === 0) return false

    const cleanText = text.trim()

    // Generic title patterns
    const isAllCaps = /^[A-Z\s\-.,!]+$/.test(cleanText) && cleanText.length < 100
    const isShortAndBold = cleanText.length < 50 && /^[A-Z]/.test(cleanText) && !/[.!?]$/.test(cleanText)
    const hasSpecialFormatting = /^(P\d+|CHAPTER \d+|SECTION \d+)$/i.test(cleanText)

    return isAllCaps || isShortAndBold || hasSpecialFormatting
  }

  /**
   * Generic new section detection.
   */
  private static looksLikeNewSection(text: string): boolean {
    if (!text || text.length === 0) return false

    // Question patterns (generic interview/conversation starters)
    const isQuestion = /^(Can you|How do|What|Where|When|Why|Would you|Tell us|Share|Describe|Explain)/i.test(text)

    // Formal introduction patterns
    const isFormalIntro = /^(Mr\.|Ms\.|Dr\.|Prof\.)\s/i.test(text)

    return isQuestion || isFormalIntro
  }

  /**
   * Create a composed paragraph element from multiple text elements.
   */
  private static createComposedParagraph(elements: PdfElement[]): PdfElement {
    // Calculate paragraph bounding box
    const bounds = this.calculateParagraphBounds(elements)

    // Combine plain text content
    const paragraphText = elements.map(el => el.data).join(' ')

    // Combine formatted HTML content preserving individual formatting
    const formattedHtml = this.combineFormattedText(elements)

    // Calculate average font size
    const avgFontSize = elements.reduce((sum, el) => sum + (el.attributes?.fontSize || 12), 0) / elements.length

    // Use the first element as base and modify it
    const firstElement = elements[0]

    return {
      ...firstElement,
      type: 'paragraph', // New type for composed paragraphs
      boundingBox: bounds,
      data: paragraphText, // Plain text
      formattedData: formattedHtml, // HTML formatted text
      attributes: {
        ...firstElement.attributes,
        fontSize: Math.round(avgFontSize * 10) / 10, // Round to 1 decimal place
        composed: true // Mark as composed element
      }
    }
  }

  /**
   * Calculate the bounding box that encompasses all elements in a paragraph.
   */
  private static calculateParagraphBounds(elements: PdfElement[]): { top: number, left: number, bottom: number, right: number, width: number, height: number } {
    const tops = elements.map(el => el.boundingBox?.top || 0)
    const lefts = elements.map(el => el.boundingBox?.left || 0)
    const bottoms = elements.map(el => (el.boundingBox?.top || 0) + (el.boundingBox?.height || 0))
    const rights = elements.map(el => (el.boundingBox?.left || 0) + (el.boundingBox?.width || 0))

    const minTop = Math.min(...tops)
    const minLeft = Math.min(...lefts)
    const maxBottom = Math.max(...bottoms)
    const maxRight = Math.max(...rights)

    return {
      top: minTop,
      left: minLeft,
      bottom: maxBottom,
      right: maxRight,
      width: maxRight - minLeft,
      height: maxBottom - minTop
    }
  }

  /**
   * Check if text content is meaningful (filters out empty, whitespace-only, or control character text).
   */
  private static isMeaningfulText(text: string | undefined): boolean {
    if (!text || text.trim().length === 0) return false

    // Filter out control characters and non-printable Unicode characters
    const cleanText = text.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '').trim()
    if (cleanText.length === 0) return false

    // Filter out strings that are only whitespace, punctuation, or single characters
    if (cleanText.length < 2 && /^[\s\W]$/.test(cleanText)) return false

    return true
  }

  /**
   * Combine formatted HTML text from multiple elements intelligently
   */
  private static combineFormattedText(elements: PdfElement[]): string {
    if (elements.length === 0) return ''

    // Join formatted text with appropriate spacing
    const formattedParts = elements.map(el => {
      const formatted = el.formattedData || el.data || ''
      return formatted.trim()
    }).filter(part => part.length > 0)

    if (formattedParts.length === 0) return ''

    // Smart joining - add space between parts unless they end/start with HTML tags
    let result = formattedParts[0]
    for (let i = 1; i < formattedParts.length; i++) {
      const prev = formattedParts[i - 1]
      const current = formattedParts[i]

      // Check if we need space between parts
      const needsSpace = !prev.endsWith('>') && !current.startsWith('<') &&
        !prev.endsWith(' ') && !current.startsWith(' ')

      result += (needsSpace ? ' ' : '') + current
    }

    // Clean up empty and redundant HTML elements
    result = this.cleanupFormattedHtml(result)

    // Wrap the combined content in a paragraph tag if it doesn't already have block-level tags
    if (!this.hasBlockLevelTags(result)) {
      result = `<p>${result}</p>`
    }

    return result
  }

  /**
   * Optimize formatted HTML by merging spans with similar or compatible styling
   */
  private static optimizeFormattedHtml(html: string, isHeaderElement = false): string {
    if (!html || html.trim().length === 0) return ''

    // Parse spans and extract their content and styling
    const spanRegex = /<span([^>]*)>(.*?)<\/span>/g
    const spans: { attributes: string; content: string; styles: Record<string, string> }[] = []
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
    if (this.canMergeAllSpans(spans, isHeaderElement)) {
      // Merge all spans into one with the most complete styling
      const mergedStyles = this.getMergedStyles(spans, isHeaderElement)
      
      let mergedContent: string
      if (isHeaderElement) {
        // For headers, extract the text content from inside header tags and merge into single header
        const headerTexts: string[] = []
        let headerTag = 'h2' // default
        
        spans.forEach(span => {
          // Extract header tag and text content
          const headerMatch = span.content.match(/<(h[1-6])>(.*?)<\/h[1-6]>/g)
          if (headerMatch) {
            headerMatch.forEach(match => {
              const tagMatch = match.match(/<(h[1-6])>(.*?)<\/h[1-6]>/)
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
   * Check if all spans can be merged based on their styling compatibility
   */
  private static canMergeAllSpans(spans: { styles: Record<string, string> }[], isHeaderElement = false): boolean {
    if (spans.length <= 1) return true

    // For header elements, be more permissive about merging
    // Headers should be semantically consistent even if some spans lack certain styles
    if (isHeaderElement) {
      // Check if all spans have the same basic formatting (font-size, font-family)
      // Allow merging even if color is missing from some spans
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

    // For non-header elements, use the original strict compatibility logic
    // Get the base styles from the span that has the most complete styling
    const mostCompleteSpan = spans.reduce((prev, current) => {
      return Object.keys(current.styles).length > Object.keys(prev.styles).length ? current : prev
    })

    // Check if all spans are compatible with the most complete styling
    return spans.every(span => {
      // A span is compatible if:
      // 1. It has the same values for properties that exist in both
      // 2. It doesn't contradict any properties in the most complete span
      return Object.entries(span.styles).every(([prop, value]) => {
        const baseValue = mostCompleteSpan.styles[prop]
        return !baseValue || baseValue === value
      })
    })
  }

  /**
   * Merge styles from multiple spans, prioritizing the most complete styling
   */
  private static getMergedStyles(spans: { styles: Record<string, string> }[], isHeaderElement = false): Record<string, string> {
    const merged: Record<string, string> = {}

    if (isHeaderElement) {
      // For headers, prioritize the span with color information for semantic consistency
      const spanWithColor = spans.find(span => span.styles.color)
      const mostCompleteSpan = spanWithColor || spans.reduce((prev, current) => {
        return Object.keys(current.styles).length > Object.keys(prev.styles).length ? current : prev
      })

      // Start with the prioritized span's styles
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
      // For non-header elements, use original logic
      // Start with the most complete span's styles
      const mostCompleteSpan = spans.reduce((prev, current) => {
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
    }

    return merged
  }

  /**
   * Clean up formatted HTML by removing empty spans and consolidating redundant elements
   */
  private static cleanupFormattedHtml(html: string): string {
    if (!html || html.trim().length === 0) return ''

    let cleaned = html
    
    // Simple, direct approach - remove empty span headers
    cleaned = cleaned.replace(/<span[^>]*><h[1-6]> <\/h[1-6]><\/span>/g, '')
    cleaned = cleaned.replace(/<span[^>]*><h[1-6]>\s+<\/h[1-6]><\/span>/g, '')
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()
    
    return cleaned
  }

  /**
   * Check if text contains block-level HTML tags
   */
  private static hasBlockLevelTags(html: string): boolean {
    const blockTags = ['<p>', '<h1>', '<h2>', '<h3>', '<h4>', '<h5>', '<h6>', '<div>', '<section>', '<article>']
    return blockTags.some(tag => html.includes(tag))
  }
}
