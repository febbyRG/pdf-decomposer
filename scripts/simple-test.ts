#!/usr/bin/env node

/**
 * Simple PDF-Decomposer Test
 * Quick test to debug why main test hangs
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { decomposePdf } from '../dist/index'

async function simpleTest() {
  console.log('🧪 Simple PDF-Decomposer Test')
  console.log('=============================')

  try {
    // Load PDF
    const pdfPath = join(__dirname, 'test-input', 'demo.pdf')
    console.log('📄 Loading PDF:', pdfPath)

    const pdfBuffer = readFileSync(pdfPath)
    console.log('✅ PDF loaded, size:', pdfBuffer.length, 'bytes')

    // Simple decompose with minimal options
    console.log('🔄 Starting decompose with minimal options...')

    const result = await decomposePdf(pdfBuffer, {
      elementComposer: false,     // Disable for simplicity
      pageComposer: false,        // Disable for simplicity
      extractEmbeddedImages: false, // Disable for simplicity
      generateImages: false,      // Disable for simplicity
      minify: false,             // Disable for simplicity
      startPage: 1,
      endPage: 1                 // Just test 1 page
    })

    console.log('✅ Decompose completed!')
    console.log('📊 Result:', {
      pages: result.length,
      firstPage: result[0] ? {
        pageNumber: result[0].pageNumber,
        elementCount: result[0].elements?.length || 0,
        width: result[0].width,
        height: result[0].height
      } : null
    })

    console.log('🎉 Simple test PASSED!')

  } catch (error) {
    console.error('❌ Simple test FAILED:', error)
    process.exit(1)
  }
}

simpleTest()
