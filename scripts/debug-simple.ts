#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { decomposePdf } from '../dist/index'

async function debugSimpleImage() {
  console.log('🔍 Debug Simple Image with Small Test')

  const pdfPath = join(__dirname, 'test-input', 'demo.pdf')
  const pdfBuffer = readFileSync(pdfPath)

  console.log('📄 Running decomposePdf with single page...')
  const result = await decomposePdf(pdfBuffer, {
    generateImages: false,
    extractEmbeddedImages: true,
    elementComposer: false,
    pageComposer: false,
    minify: false,
    startPage: 1,
    endPage: 1
  })

  if (result.length > 0) {
    const page = result[0] as any
    const imageElements = page.elements?.filter((e: any) => e.type === 'image') || []

    if (imageElements.length > 0) {
      const firstImage = imageElements[0]
      console.log('\n🔍 Image analysis:')
      console.log(`- Dimensions: ${firstImage.attributes?.width}x${firstImage.attributes?.height}`)

      if (firstImage.data && firstImage.data.startsWith('data:image/png;base64,')) {
        const base64Data = firstImage.data.split(',')[1]
        const decoded = Buffer.from(base64Data, 'base64')

        console.log(`- PNG size: ${decoded.length} bytes`)
        console.log(`- Expected uncompressed size for RGB: ${firstImage.attributes?.width * firstImage.attributes?.height * 3} bytes`)
        console.log(`- Expected uncompressed size for RGBA: ${firstImage.attributes?.width * firstImage.attributes?.height * 4} bytes`)

        // Check PNG structure
        const hasValidSignature = decoded[0] === 0x89 && decoded[1] === 0x50 &&
          decoded[2] === 0x4E && decoded[3] === 0x47
        console.log(`- Valid PNG signature: ${hasValidSignature}`)

        // Save the actual image data for inspection
        writeFileSync('debug-actual-image.png', decoded)
        console.log('� Saved debug-actual-image.png')

        // Also save just first 10KB for inspection
        writeFileSync('debug-image-header.bin', decoded.slice(0, 10240))
        console.log('💾 Saved debug-image-header.bin (first 10KB)')
      }
    }
  }
}

debugSimpleImage().catch(console.error)
