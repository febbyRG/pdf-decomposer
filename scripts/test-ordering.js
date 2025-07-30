#!/usr/bin/env node

/**
 * Test script to check element ordering in pageComposer output
 */

import { existsSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { decomposePdf } from '../dist/index.js'

const require = createRequire(import.meta.url)
const __dirname = dirname(require.resolve('../package.json'))

async function testElementOrdering() {
  console.log('🔍 Testing Element Ordering in Page Composer')
  console.log('============================================')

  const pdfPath = join(__dirname, 'scripts', 'test-input', 'demo.pdf')
  const outputDir = join(__dirname, 'scripts', 'test-output', 'ordering-test')

  try {
    const result = await decomposePdf(pdfPath, {
      outputDir,
      debug: true,
      elementComposer: true,  // Enable element composition first
      pageComposer: true,     // Then enable page composition
      embeddedImages: false
    })

    console.log('📊 Result structure:', Object.keys(result))
    console.log('Result type:', typeof result)
    
    let pages
    if (Array.isArray(result)) {
      pages = result
      console.log(`📊 Results: ${pages.length} pages (direct array)`)
    } else if (result && result.pages) {
      pages = result.pages
      console.log(`📊 Results: ${pages.length} pages (from result.pages)`)
    } else {
      console.log('❌ Unable to find pages in result')
      console.log('Result:', result)
      return
    }
    // Check ordering in composed pages
    pages.forEach((page, index) => {
      console.log(`\n📄 Page ${index + 1} (Original: ${page.pageNumber})`)
      console.log(`   Title: "${page.title}"`)
      console.log(`   Elements: ${page.elements.length}`)
      
      // Show first 10 elements with their positions and types
      const textElements = page.elements
        .filter(el => ['text', 'paragraph', 'header'].includes(el.type))
        .slice(0, 10)
      
      console.log('   📋 Element Order (first 10 text elements):')
      textElements.forEach((el, i) => {
        const top = el.boundingBox?.top || 0
        const left = el.boundingBox?.left || 0
        const data = (el.data || '').substring(0, 50).replace(/\n/g, ' ')
        const type = el.type === 'header' ? `header(${el.attributes?.type || 'h'})` : el.type
        console.log(`     ${i + 1}. [${type}] @(${left.toFixed(0)}, ${top.toFixed(0)}) "${data}..."`)
      })

      // Check for ordering issues
      let orderingIssues = 0
      for (let i = 1; i < textElements.length; i++) {
        const prev = textElements[i - 1]
        const curr = textElements[i]
        const prevTop = prev.boundingBox?.top || 0
        const currTop = curr.boundingBox?.top || 0
        
        // If current element is significantly higher than previous (>20pt), it's likely a ordering issue
        if (currTop + 20 < prevTop) {
          orderingIssues++
          console.log(`     ⚠️  Ordering issue: Element ${i + 1} (${currTop.toFixed(0)}) appears above element ${i} (${prevTop.toFixed(0)})`)
        }
      }

      if (orderingIssues === 0) {
        console.log('   ✅ Element ordering looks correct')
      } else {
        console.log(`   ❌ Found ${orderingIssues} potential ordering issues`)
      }
    })

    // Save detailed output for inspection
    const detailedOutput = {
      originalPages: pages.length,
      pages: pages.map(page => ({
        pageNumber: page.pageNumber,
        title: page.title,
        elementCount: page.elements.length,
        elements: page.elements.map(el => ({
          id: el.id,
          type: el.type,
          headerType: el.attributes?.type,
          boundingBox: el.boundingBox,
          data: (el.data || '').substring(0, 100),
          position: {
            top: el.boundingBox?.top || 0,
            left: el.boundingBox?.left || 0
          }
        }))
      }))
    }

    writeFileSync(
      join(outputDir, 'ordering-analysis.json'),
      JSON.stringify(detailedOutput, null, 2)
    )

    console.log(`\n💾 Detailed analysis saved to: ${join(outputDir, 'ordering-analysis.json')}`)

  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

testElementOrdering()
