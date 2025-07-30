#!/usr/bin/env node

/**
 * Test PDF Decomposer - Integration with Exact Working Logic
 * This tests using the pdf-decomposer library with embedded image extraction
 */

console.log('🚀 Testing PDF Decomposer with Embedded Image Extraction')

async function testPdfDecomposer() {
  try {
    // Import pdf-decomposer
    const { decomposePdf } = await import('./dist/index.js')
    
    // Test file path
    const testFile = './scripts/test-input/demo.pdf'
    const fs = await import('fs')
    
    if (!fs.existsSync(testFile)) {
      console.error('❌ Test file not found:', testFile)
      return
    }
    
    console.log('📁 Reading PDF file:', testFile)
    const pdfBuffer = fs.readFileSync(testFile)
    
    console.log('🔧 Starting PDF decomposition with embedded image extraction...')
    
    // Test with embedded image extraction enabled
    const result = await decomposePdf(testFile, {
      extractEmbeddedImages: true,
      generateImages: false, // Disable page rendering
      assetPath: './scripts/test-output/decomposer-assets'
    })
    
    console.log('📊 Decomposition Results:')
    console.log('- Total Pages:', result.pages?.length || 0)
    
    // Check for extracted images
    let totalImages = 0
    result.pages?.forEach((page, pageIndex) => {
      const imageElements = page.elements?.filter(el => el.type === 'image') || []
      if (imageElements.length > 0) {
        console.log(`📸 Page ${pageIndex + 1}: Found ${imageElements.length} embedded images`)
        imageElements.forEach((img, imgIndex) => {
          console.log(`  ✅ Image ${imgIndex + 1}: ${img.attributes?.width}x${img.attributes?.height} (${img.attributes?.format})`)
          totalImages++
        })
      }
    })
    
    console.log(`🎉 TOTAL EMBEDDED IMAGES EXTRACTED: ${totalImages}`)
    
    if (totalImages > 0) {
      console.log('✅ PDF Decomposer embedded image extraction is WORKING!')
    } else {
      console.log('⚠️ No embedded images found - may need debugging')
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    console.error('Stack:', error.stack)
  }
}

// Run test
testPdfDecomposer()
