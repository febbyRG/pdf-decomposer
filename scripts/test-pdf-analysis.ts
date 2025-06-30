#!/usr/bin/env tsx

import * as fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { decomposePdf } from '../src/api/decomposePdf.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function analyzePdf() {
  const pdfPath = '/Volumes/Data/Febby/GFamily/projects/pdf-decomposer/scripts/pdf-test-input/test.pdf'
  const outputDir = path.join(__dirname, 'test-analysis-output')

  // Clean up previous output
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true })
  }
  fs.mkdirSync(outputDir, { recursive: true })

  console.log('🔍 Analyzing test.pdf with page composition...')
  console.log(`📄 PDF: ${path.basename(pdfPath)}`)
  console.log(`📁 Output: ${outputDir}\n`)

  try {
    // Test with page composition enabled
    const result = await decomposePdf(pdfPath, {
      assetPath: outputDir,
      generateImages: false, // Skip images for faster analysis
      pageComposer: true // Enable page composition
    })

    console.log(`✅ Successfully processed ${result.length} logical pages`)

    // Save the results
    const outputFile = path.join(outputDir, 'composed-pages.json')
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2))
    console.log(`📄 Results saved to: ${outputFile}`)

    // Show summary of composition
    console.log('\n📊 Page Composition Summary:')
    result.forEach((page, index) => {
      const composedPages = page.metadata?.composedFromPages || [page.pageNumber]
      console.log(`  Logical Page ${index + 1}: Composed from PDF pages ${composedPages.join(', ')}`)
      if (composedPages.length > 1) {
        console.log('    ✨ Multi-page composition detected!')
      }
    })

    // Save text output for quick review
    const textOutput = result.map((page, index) => {
      const composedPages = page.metadata?.composedFromPages || [page.pageNumber]
      const sourcePages = composedPages.join(', ')
      const textContent = page.elements
        .filter(el => el.type === 'text')
        .map(el => el.content)
        .join(' ')
        .substring(0, 200) + '...'

      return `=== Logical Page ${index + 1} (PDF pages: ${sourcePages}) ===\n${textContent}\n`
    }).join('\n')

    const textFile = path.join(outputDir, 'composed-text-preview.txt')
    fs.writeFileSync(textFile, textOutput)
    console.log(`📝 Text preview saved to: ${textFile}`)

  } catch (error) {
    console.error('❌ Analysis failed:', error)
    process.exit(1)
  }
}

analyzePdf().catch(error => {
  console.error('❌ Script failed:', error)
  process.exit(1)
})
