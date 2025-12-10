#!/usr/bin/env node

/**
 * PDF Screenshot Generation Test
 *
 * Tests the new screenshotPdf() API for generating page screenshots
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { PdfDecomposer } from '../dist/index'

class ScreenshotTest {
  private baseOutputDir: string
  private pdfPath: string
  private pdfFile = 'kandy.pdf'

  constructor(customPdfPath?: string) {
    const outputDir = join(__dirname, 'test-output')
    this.baseOutputDir = join(outputDir, 'screeshots')
    this.pdfPath = customPdfPath || join(__dirname, 'test-input', this.pdfFile)
  }

  private readPdfBuffer(): Buffer {
    return readFileSync(this.pdfPath)
  }

  async run() {
    console.log('📸 PDF Screenshot Generation Test')
    console.log('==================================')
    console.log(`📊 Node.js version: ${process.version}`)
    console.log(`📄 Test PDF: ${basename(this.pdfPath)}`)
    console.log(`📁 PDF Full Path: ${this.pdfPath}`)
    console.log(`📁 Output directory: ${this.baseOutputDir}\n`)

    // Verify PDF file exists
    if (!existsSync(this.pdfPath)) {
      console.error(`❌ PDF file not found: ${this.pdfPath}`)
      process.exit(1)
    }

    const pdfStats = statSync(this.pdfPath)
    console.log(`📏 PDF file size: ${Math.round(pdfStats.size / 1024)} KB`)

    // Clean up previous test results
    if (existsSync(this.baseOutputDir)) {
      rmSync(this.baseOutputDir, { recursive: true })
    }
    mkdirSync(this.baseOutputDir, { recursive: true })

    try {
      await this.testScreenshotGeneration()
      // await this.testBase64OnlyMode()
      console.log('\n🎉 Screenshot test completed successfully!')
      process.exit(0)

    } catch (error) {
      console.error('❌ Screenshot test failed:', error)
      process.exit(1)
    }
  }

  private async testScreenshotGeneration() {
    const testName = 'Page Screenshot Generation'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)

      const pdfBuffer = this.readPdfBuffer()
      
      // Create decomposer instance  
      const decomposer = new PdfDecomposer(pdfBuffer)
      await decomposer.initialize()
      
      // Limit pages for local testing to prevent OOM
      // node-canvas has memory issues with large PDFs
      const totalPages = decomposer.numPages
      const maxPagesForTest = 20 // Limit to first 20 pages for local testing
      const endPage = Math.min(totalPages, maxPagesForTest)
      
      console.log(`📄 Total pages: ${totalPages}, Testing first ${endPage} pages (limited for memory safety)`)

      const options = {
        outputDir: this.baseOutputDir,
        imageWidth: 800, // Reduced from 1024 for memory safety
        imageQuality: 80, // Reduced from 90 for smaller output
        startPage: 1,
        endPage: endPage
      }
      
      // Generate screenshots
      const result = await decomposer.screenshot(options)

      const resultPath = join(this.baseOutputDir, 'result.json')
      writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8')

      const duration = Date.now() - startTime

      let totalFiles = 0

      for (const pageResult of result.screenshots) {
        console.log(`   ✅ Page ${pageResult.pageNumber}: ${pageResult.width}x${pageResult.height}`)

        // Check if file was written (when outputDir is provided)
        if (pageResult.filePath) {
          if (existsSync(pageResult.filePath)) {
            const stats = statSync(pageResult.filePath)
            console.log(`      💾 File saved: ${pageResult.filePath}`)
            console.log(`      💾 File size: ${(stats.size / 1024).toFixed(1)}KB`)
            totalFiles++
          } else {
            console.log(`      ⚠️ File path provided but file not found: ${pageResult.filePath}`)
          }
        } else {
          console.log('      📱 Base64 only (no file written)')
        }
      }

      console.log('\n📈 Summary:')
      console.log(`   Total files generated: ${totalFiles}`)
      console.log(`   Processing time: ${duration}ms`)

    } catch (error) {
      console.error(`❌ Failed: ${(error as Error).message}`)
      throw error
    }
  }

  private async testBase64OnlyMode() {
    const testName = 'Base64 Only Mode (No File Writing)'
    const startTime = Date.now()

    try {
      console.log(`\n🔄 Running: ${testName}...`)

      const options = {
        startPage: 1,
        endPage: 1, // Test just first page
        imageWidth: 512,
        imageQuality: 80
        // No outputDir - should only return base64
      }

      const pdfBuffer = this.readPdfBuffer()
      
      // Create decomposer instance  
      const decomposer = new PdfDecomposer(pdfBuffer)
      await decomposer.initialize()
      
      // Generate screenshots (base64 only)
      const result = await decomposer.screenshot(options)

      const duration = Date.now() - startTime

      console.log(`   📊 Pages processed: ${result.screenshots.length}`)

      for (const pageResult of result.screenshots) {
        console.log(`   ✅ Page ${pageResult.pageNumber}: ${pageResult.width}x${pageResult.height}`)

        if (pageResult.filePath) {
          console.log('      ⚠️ Unexpected: filePath provided when no outputDir specified')
        } else {
          console.log('      ✅ Correctly returns base64 only (no file path)')
        }

        // Verify base64 format
        if (pageResult.screenshot.startsWith('data:image/')) {
          console.log('      ✅ Valid data URL format detected')
        } else {
          console.log('      ⚠️ Data URL format may be invalid - missing data:image/ prefix')
        }
      }

      console.log(`   Processing time: ${duration}ms`)

    } catch (error) {
      console.error(`❌ Failed: ${(error as Error).message}`)
      throw error
    }
  }
}

// Run the screenshot test
const customPdfPath = process.argv[2]
const test = new ScreenshotTest(customPdfPath)
test.run().catch(error => {
  console.error('❌ Screenshot test crashed:', error)
  process.exit(1)
})
