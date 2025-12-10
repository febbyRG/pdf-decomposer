#!/usr/bin/env tsx

/**
 * PDF Data Generator Test
 * 
 * Tests the new clean data() method for pwa-admin integration
 * Uses the refactored API with separate functions
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'fs'
import { join } from 'path'
// Import using relative path from scripts directory to dist  
import { PdfDecomposer } from '../dist/index.js'

async function testPdfDataGeneration() {
  console.log('🧪 Testing Clean PDF Data API for pwa-admin')
  console.log('='.repeat(50))

  const testDir = join(__dirname, 'test-output', 'pdf-data-test')
  const pdfPath = join(__dirname, 'test-input', 'kandy.pdf')
  
  // Clean up previous test results
  if (existsSync(testDir)) {
    console.log('🧹 Cleaning up previous test results...')
    rmSync(testDir, { recursive: true })
  }
  
  // Ensure output directory exists
  mkdirSync(testDir, { recursive: true })
  console.log(`📁 Output directory ready: ${testDir}`)
  
  if (!existsSync(pdfPath)) {
    console.error(`❌ Test PDF not found: ${pdfPath}`)
    return
  }

  // Show PDF file stats
  const pdfStats = statSync(pdfPath)
  console.log(`📏 PDF file size: ${Math.round(pdfStats.size / 1024)} KB`)

  try {
    // Initialize PDF decomposer
    const pdfBuffer = readFileSync(pdfPath)
    const decomposer = new PdfDecomposer(pdfBuffer)
    await decomposer.initialize()
    
    const totalPages = decomposer.numPages
    console.log(`📄 PDF loaded: ${totalPages} pages`)
    
    // Limit pages for local testing to prevent OOM
    // node-canvas has memory issues with large PDFs in Node.js 16
    const maxPagesForTest = 15 // Limit to first 15 pages for local testing
    const endPage = Math.min(totalPages, maxPagesForTest)
    console.log(`⚠️ Testing first ${endPage} pages only (limited for memory safety in local env)`)
    
    // Test: Generate pdfData using new dedicated data() method
    console.log('\n🔄 Generating pdfData using new data() method...')
    
    // Ensure data output directory exists (required when outputDir is specified)
    const dataOutputDir = join(testDir, 'data')
    mkdirSync(dataOutputDir, { recursive: true })
    
    const dataResult = await decomposer.data({
      extractImages: false,  // Disable image extraction for local testing (causes OOM)
      elementComposer: true,
      cleanComposer: false,  // Disable cleanComposer to avoid screenshot generation (causes OOM)
      skipScreenshots: true, // Skip page screenshots for local testing (causes OOM with node-canvas)
      outputDir: dataOutputDir,
      startPage: 1,
      endPage: endPage
    })
    
    const pdfDataResult = dataResult.data
    if (!pdfDataResult) {
      throw new Error('pdfData not generated')
    }
    
    console.log(`✅ Generated pdfData: ${pdfDataResult.length} pages, ${pdfDataResult.reduce((total: number, page: any) => total + page.areas.length, 0)} total areas`)
    
    // Save result
    const resultPath = join(testDir, 'pdf-data-result.json')
    writeFileSync(resultPath, JSON.stringify(pdfDataResult, null, 2))
    console.log(`📄 Saved to: ${resultPath}`)
    
    // Show sample structures
    if (pdfDataResult.length > 0) {
      console.log('\n� Sample PdfData structure (first page):')
      const samplePage = {
        ...pdfDataResult[0],
        areas: pdfDataResult[0].areas.slice(0, 2) // Show only first 2 areas
      }
      console.log(JSON.stringify(samplePage, null, 2))
    }
    
    if (pdfDataResult.length > 0 && pdfDataResult[0].areas.length > 0) {
      console.log('\n📝 Sample PdfArea structure:')
      console.log(JSON.stringify(pdfDataResult[0].areas[0], null, 2))
    }
    
    // Print results summary
    console.log('\n📊 Results Summary:')
    console.log(`📄 Total pages: ${pdfDataResult.length}`)
    console.log(`🎯 Total areas: ${pdfDataResult.reduce((total: any, page: any) => total + page.areas.length, 0)}`)
    
    // Print areas breakdown by widget type
    const widgetTypeCounts: Record<string, number> = {}
    pdfDataResult.forEach(page => {
      page.areas.forEach(area => {
        const type = area.widgetId.split(':')[0]
        widgetTypeCounts[type] = (widgetTypeCounts[type] || 0) + 1
      })
    })
    
    console.log('\n🔍 Widget Type Breakdown:')
    Object.entries(widgetTypeCounts).forEach(([type, count]) => {
      const typeName = { T: 'Text', P: 'Picture', G: 'Graphics', A: 'Annotation', E: 'Element' }[type] || type
      console.log(`  ${type} (${typeName}): ${count}`)
    })
    
    console.log('\n🎉 PDF Data generation completed successfully!')
    console.log('\n💡 Clean API Usage example:')
    console.log('```typescript')
    console.log('const decomposer = new PdfDecomposer(buffer)')
    console.log('await decomposer.initialize()')
    console.log('const result = await decomposer.data({ elementComposer: true })')
    console.log('const pdfData = result.data // pwa-admin compatible format')
    console.log('const pages = result.pages // reference pages')
    console.log('// Ready to use in pwa-admin!')
    console.log('```')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error(error)
  }
}

// Run the test
testPdfDataGeneration().catch(console.error)
