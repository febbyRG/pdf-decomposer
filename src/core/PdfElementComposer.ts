import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'

/**
 * Internal composite type for FlexPDF algorithm processing
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
 * Enhanced PdfElementComposer with complete FlexPDF algorithm system.
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
   * Compose elements for a single page using complete FlexPDF algorithm system.
   */
  private static composePageElements(elements: PdfElement[]): PdfElement[] {
    // Separate text and non-text elements
    const textElements = elements.filter(el => el.type === 'text' && this.isMeaningfulText(el.formattedData || el.data))
    const nonTextElements = elements.filter(el => el.type !== 'text')

    if (textElements.length === 0) return elements

    // FlexPDF 3-stage algorithm system
    let composites = this.convertToComposites(textElements)
    
    // Stage 1: OverlappingTextAlgorithm (Priority 30) - Spatial merging
    composites = this.runOverlappingTextAlgorithm(composites)
    
    // Stage 2: OrderCompositesAlgorithm (Priority 40) - Reading order detection  
    composites = this.runOrderCompositesAlgorithm(composites)
    
    // Stage 3: ComputeTextTypesAlgorithm (Priority 50) - Text type classification
    composites = this.runComputeTextTypesAlgorithm(composites)

    // Convert back to PdfElements
    const processedElements = this.convertToElements(composites)

    // Combine with non-text elements and sort by reading order
    const allElements = [...processedElements, ...nonTextElements].sort((a, b) => {
      const aTop = a.boundingBox?.top || 0
      const bTop = b.boundingBox?.top || 0
      const yDiff = aTop - bTop

      if (Math.abs(yDiff) > 10) return yDiff
      
      const aLeft = a.boundingBox?.left || 0
      const bLeft = b.boundingBox?.left || 0
      return aLeft - bLeft
    })

    return allElements
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
      
      return {
        ...firstOriginal,
        type: composite.attributes.type === 'paragraph' ? 'paragraph' : firstOriginal.type,
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
   * FlexPDF Stage 1: OverlappingTextAlgorithm (Priority 30)
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
   * FlexPDF Stage 2: OrderCompositesAlgorithm (Priority 40) 
   * Reading order detection with beam scanning
   */
  private static runOrderCompositesAlgorithm(composites: Composite[]): Composite[] {
    if (composites.length === 0) return composites

    // Sort by reading order: top to bottom, then left to right
    return composites.sort((a, b) => {
      const yDiff = a.boundingBox.top - b.boundingBox.top
      if (Math.abs(yDiff) > 10) return yDiff
      return a.boundingBox.left - b.boundingBox.left
    })
  }

  /**
   * FlexPDF Stage 3: ComputeTextTypesAlgorithm (Priority 50)
   * Text type classification based on font size analysis
   */
  private static runComputeTextTypesAlgorithm(composites: Composite[]): Composite[] {
    if (composites.length === 0) return composites

    // Calculate character-weighted average font size
    const weightedPairs = composites.map(comp => [comp.attributes.fontSize, comp.data.length])
    const totalCharacters = weightedPairs.reduce((sum, [_, charCount]) => sum + charCount, 0)
    const aggregatedSum = weightedPairs.reduce((sum, [fontSize, charCount]) => sum + fontSize * charCount, 0)
    const averageFontSize = totalCharacters > 0 ? aggregatedSum / totalCharacters : 12

    // Define heading thresholds based on FlexPDF algorithm
    const headingThresholds = [
      { type: 'h1', size: 2.1 * averageFontSize },
      { type: 'h2', size: 1.75 * averageFontSize },
      { type: 'h3', size: 1.5 * averageFontSize },
      { type: 'h4', size: 1.25 * averageFontSize },
      { type: 'h5', size: 1.1 * averageFontSize }
    ]

    // Classify each composite
    for (const composite of composites) {
      const fontSize = composite.attributes.fontSize
      const wordCount = composite.data.split(/\s+/).filter(str => str !== '').length
      const isLongText = wordCount > 15

      if (fontSize > averageFontSize && !isLongText) {
        // Find appropriate heading level
        const heading = headingThresholds.find(threshold => Math.floor(threshold.size) <= fontSize)
        composite.attributes.type = heading ? heading.type : 'h5'
      } else {
        composite.attributes.type = 'paragraph'
      }
    }

    return composites
  }

  /**
   * Calculate page statistics from composites (FlexPDF approach)
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
   * FlexPDF composite merging criteria
   */
  private static shouldMergeComposites(compA: Composite, compB: Composite, pageStats: any): boolean {
    // Font compatibility check (10% tolerance like FlexPDF)
    const fontSizeA = compA.attributes.fontSize
    const fontSizeB = compB.attributes.fontSize
    const relativeFontDiff = Math.abs(fontSizeA / fontSizeB - 1)
    
    if (relativeFontDiff > 0.1) return false
    
    // Spatial proximity check with enhanced expansion (FlexPDF frontend behavior)
    const avgFontSize = (fontSizeA + fontSizeB) / 2
    const correctedFontSize = Math.max(Math.pow(avgFontSize, 2) / pageStats.averageFontSize, avgFontSize)
    
    // Enhanced expansion calculation to match FlexPDF frontend composite behavior
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

    // Calculate average font size
    const avgFontSize = cluster.reduce((sum, c) => sum + c.attributes.fontSize, 0) / cluster.length

    // Collect all original elements
    const allOriginalElements: PdfElement[] = []
    cluster.forEach(c => allOriginalElements.push(...c.originalElements))

    return {
      id: `merged_${cluster[0].id}`,
      data: mergedData,
      formattedData: mergedFormatted,
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
   * Group text elements using dynamic clustering with FlexPDF-inspired spatial analysis.
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

    // Use FlexPDF-inspired overlapping algorithm
    const clusters = this.findOverlappingClusters(sortedElements, pageStats)
    
    // Convert clusters to composed paragraphs
    const paragraphs = clusters
      .filter(cluster => cluster.length > 0)
      .map(cluster => this.createComposedParagraph(cluster))

    return paragraphs
  }

  /**
   * FlexPDF-inspired overlapping detection algorithm.
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
   * FlexPDF-inspired element merging criteria with dynamic thresholds.
   */
  private static shouldMergeElements(elementA: PdfElement, elementB: PdfElement, pageStats: any): boolean {
    // Font compatibility check (10% tolerance like FlexPDF)
    const fontSizeA = elementA.attributes?.fontSize || 12
    const fontSizeB = elementB.attributes?.fontSize || 12
    const relativeFontDiff = Math.abs(fontSizeA / fontSizeB - 1)
    
    if (relativeFontDiff > 0.1) return false
    
    // Spatial proximity check with dynamic expansion (FlexPDF-inspired)
    const avgFontSize = (fontSizeA + fontSizeB) / 2
    const correctedFontSize = Math.max(Math.pow(avgFontSize, 2) / pageStats.averageFontSize, avgFontSize)
    const expansionAmount = Math.min(Math.max(correctedFontSize / 3.5, 2), 10)
    
    return this.intersectsWithExpansion(elementA.boundingBox, elementB.boundingBox, expansionAmount)
  }

  /**
   * Check if two bounding boxes intersect with expansion (FlexPDF-inspired).
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

    // Wrap the combined content in a paragraph tag if it doesn't already have block-level tags
    if (!this.hasBlockLevelTags(result)) {
      result = `<p>${result}</p>`
    }

    return result
  }

  /**
   * Check if text contains block-level HTML tags
   */
  private static hasBlockLevelTags(html: string): boolean {
    const blockTags = ['<p>', '<h1>', '<h2>', '<h3>', '<h4>', '<h5>', '<h6>', '<div>', '<section>', '<article>']
    return blockTags.some(tag => html.includes(tag))
  }
}
