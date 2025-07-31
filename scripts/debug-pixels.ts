#!/usr/bin/env node

import { readFileSync } from 'fs'
import { join } from 'path'
import { decomposePdf } from '../dist/index'

async function debugPixelData() {
  console.log('🔍 Debug Pixel Data Processing')

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
    endPage: 1  // Just first page for debugging
  })

  console.log(`\n📊 Found ${result.length} pages`)

  if (result.length > 0) {
    const page = result[0] as any
    const imageElements = page.elements?.filter((e: any) => e.type === 'image') || []

    console.log(`🖼️ Found ${imageElements.length} image elements on page 1`)

    if (imageElements.length > 0) {
      const firstImage = imageElements[0]
      console.log('\n🔍 First image details:')
      console.log(`- ID: ${firstImage.id}`)
      console.log(`- Dimensions: ${firstImage.attributes?.width}x${firstImage.attributes?.height}`)
      console.log(`- Format: ${firstImage.attributes?.format}`)
      console.log(`- Data type: ${typeof firstImage.data}`)
      console.log(`- Data length: ${firstImage.data?.length || 'N/A'}`)

      if (firstImage.data && typeof firstImage.data === 'string') {
        if (firstImage.data.startsWith('data:image/')) {
          console.log('✅ Data URL format detected')
          const parts = firstImage.data.split(',')
          if (parts.length === 2) {
            const header = parts[0]
            const base64Data = parts[1]
            console.log(`- Header: ${header}`)
            console.log(`- Base64 length: ${base64Data.length}`)

            // Check first few bytes of decoded data
            try {
              const decoded = Buffer.from(base64Data, 'base64')
              console.log(`- Decoded size: ${decoded.length} bytes`)
              console.log(`- First 20 bytes: [${Array.from(decoded.slice(0, 20)).join(', ')}]`)

              // Check PNG signature
              const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
              const hasPngSignature = pngSignature.every((byte, index) => decoded[index] === byte)
              console.log(`- Valid PNG signature: ${hasPngSignature}`)

            } catch (error) {
              console.log(`❌ Failed to decode base64: ${error}`)
            }
          }
        } else {
          console.log(`- Data content (first 100 chars): ${firstImage.data.substring(0, 100)}...`)
        }
      }
    }
  }
}

debugPixelData().catch(console.error)
