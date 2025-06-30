import * as fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { decomposePdf } from '../src/api/decomposePdf.js'
import type { PdfPageContent } from '../src/models/PdfPageContent.js'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))

// Function to preprocess pages into a compact text format
function preprocessToText(pages: PdfPageContent[]): string {
  let result = ''

  for (const page of pages) {
    result += `<!-- page ${page.pageNumber} -->\n`

    // Sort elements by vertical position (top to bottom)
    const sortedElements = [...page.elements].sort(
      (a, b) => (a.boundingBox?.top || 0) - (b.boundingBox?.top || 0)
    )

    for (const el of sortedElements) {
      if (el.type === 'text' && el.formattedData) {
        const text = el.formattedData.trim()
        const fontSize = el.attributes?.fontSize?.toFixed(2) ?? '?'
        const top = (el.boundingBox?.top || 0).toFixed(2)
        const left = (el.boundingBox?.left || 0).toFixed(2)
        result += `[text] ${text} (${fontSize}) at top: ${top}, left: ${left}\n`
      } else if (el.type === 'image' && el.data) {
        const top = (el.boundingBox?.top || 0).toFixed(2)
        const left = (el.boundingBox?.left || 0).toFixed(2)
        result += `[image] ${el.data} at top: ${top}, left: ${left}\n`
      }
    }

    result += '\n'
  }

  return result
}

// Function to create a ultra-slim output for AI/HTML conversion
// Format: {w: pageWidth, h: pageHeight, els: [{t: type, x: left, y: top, w: width, h: height, d: content, fs?: fontSize}]}
// - w/h: Page dimensions (integers)
// - els: Elements array with paragraphs ('para') and images ('img')
// - t: Type ('para' for paragraphs, 'img' for images)
// - x/y/w/h: Position and size (integers, rounded)
// - d: Content (text content or image filename)
// - fs: Font size (optional, only for text, 1 decimal place)
function createSlimOutput(pages: PdfPageContent[]): any[] {
  return pages.map(page => ({
    w: Math.round(page.width), // Page width (rounded to integer)
    h: Math.round(page.height), // Page height (rounded to integer)
    els: page.elements
      .filter(el => {
        // Keep paragraph and image elements
        if (el.type === 'paragraph' || el.type === 'image') return true
        // Keep meaningful individual text elements that weren't composed
        if (el.type === 'text') return el.formattedData && el.formattedData.trim().length > 0
        return false
      })
      .map(el => {
        const element: any = {
          t: el.type === 'paragraph' ? 'para' : el.type === 'image' ? 'img' : 'txt', // Type mapping
          x: Math.round(el.boundingBox?.left || 0), // Left position (integer)
          y: Math.round(el.boundingBox?.top || 0), // Top position (integer)
          w: Math.round(el.boundingBox?.width || 0), // Width (integer)
          h: Math.round(el.boundingBox?.height || 0), // Height (integer)
          d: el.type === 'image' ? el.data : (el.formattedData || el.data) // Content/path
        }

        // Add font size for text/paragraph elements (rounded to 1 decimal)
        if ((el.type === 'text' || el.type === 'paragraph') && el.attributes?.fontSize) {
          element.fs = Math.round(el.attributes.fontSize * 10) / 10
        }

        return element
      })
      .filter(el => el.d && el.d.trim().length > 0) // Filter out empty content
  }))
}

; (async () => {
  // Use the correct path for the demo PDF
  const pdfPath = path.join(scriptDir, 'pdf-test-input', 'demo.pdf')
  const usageTestDir = path.join(scriptDir, 'usage-test-output')
  const outputPath = path.join(usageTestDir, 'test.output.json')
  const outputSlimPath = path.join(usageTestDir, 'test.slim.output.json')
  const outputTxt = path.join(usageTestDir, 'test.output.txt')

  try {
    // Create usage-test directory if it doesn't exist
    if (!fs.existsSync(usageTestDir)) {
      fs.mkdirSync(usageTestDir, { recursive: true })
    }

    const result = await decomposePdf(pdfPath, {
      assetPath: usageTestDir,
      extractEmbeddedImages: true, // Extract embedded images
      elementComposer: true, // Group text elements into paragraphs
    })

    // Write output JSON
    await fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8')
    console.log(`PDF decomposition result written to ${outputPath}`)

    // Generate and write slim JSON format for AI processing
    const slimOutput = createSlimOutput(result)
    await fs.writeFileSync(outputSlimPath, JSON.stringify(slimOutput, null, 0), 'utf-8')
    console.log(`Slim JSON format written to ${outputSlimPath}`)

    // Generate and write compact text format
    const textOutput = preprocessToText(result)
    await fs.writeFileSync(outputTxt, textOutput, 'utf-8')
    console.log(`Compact text format written to ${outputTxt}`)

    process.exit(0)

  } catch (err) {
    console.error('Failed to parse PDF:')
    if (err instanceof Error) {
      console.error('Error message:', err.message)
      console.error('Error stack:', err.stack)
    }
    // Print the full error object, including non-Error types
    console.dir(err, { depth: 10 })
  }
})()
