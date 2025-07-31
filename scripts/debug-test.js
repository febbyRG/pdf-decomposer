#!/usr/bin/env node

/**
 * JavaScript Test untuk PDF.js ES5 Build
 * No TypeScript checking, direct JavaScript test
 */

const { readFileSync } = require('fs')
const { join } = require('path')

async function debugTestJS() {
  console.log('🧪 Debug PDF-Decomposer Test (JavaScript)')
  console.log('=========================================')

  try {
    // Step 1: Test PDF.js ES5 build
    console.log('🔧 Step 1: Testing PDF.js ES5 build...')
    const pdfjsLib = require('pdfjs-dist/es5/build/pdf.js')
    console.log('✅ PDF.js ES5 loaded')

    const pdfPath = join(__dirname, 'test-input', 'demo.pdf')
    const pdfBuffer = readFileSync(pdfPath)
    console.log('✅ PDF buffer loaded:', pdfBuffer.length, 'bytes')

    // Step 2: Load PDF document
    console.log('🔧 Step 2: Loading PDF document...')
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      disableFontFace: false,
      verbosity: 0
    })

    const pdfDoc = await loadingTask.promise
    console.log('✅ PDF document loaded:', pdfDoc.numPages, 'pages')

    // Step 3: Test getPage
    console.log('🔧 Step 3: Testing getPage(1)...')
    const page1 = await pdfDoc.getPage(1)
    console.log('✅ Page 1 loaded')

    // Step 4: Test getOperatorList
    console.log('🔧 Step 4: Testing getOperatorList...')
    const operators = await page1.getOperatorList({ intent: 'display' })
    console.log('✅ Operator list loaded:', operators.fnArray.length, 'operations')

    // Step 5: Test getTextContent
    console.log('🔧 Step 5: Testing getTextContent...')
    const textContent = await page1.getTextContent({ normalizeWhitespace: false })
    console.log('✅ Text content loaded:', textContent.items.length, 'text items')

    console.log('🎉 All PDF.js ES5 operations working!')

  } catch (error) {
    console.error('❌ Debug test failed:', error.message)
    console.error('Full error:', error)
  }
}

debugTestJS()
