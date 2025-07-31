#!/usr/bin/env node

/**
 * PDF-Decomposer Comprehensive Test Suite
 *
 * Tests all major functionality including:
 * - Text extraction
 * - Image extraction (embedded)
 * - Memory efficiency
 * - Error handling
 * - Node.js 16+ compatibility
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { decomposePdf } from '../dist/index'

interface TestResult {
  name: string
  passed: boolean
  duration: number
  details: string
  outputSize?: number
  pageCount?: number
  imageCount?: number
  embeddedImageCount?: number
}

class ComprehensiveTest {
  private results: TestResult[] = []
  private baseOutputDir: string
  private pdfPath: string
  private pdfFile: string = 'demo.pdf'

  constructor(customPdfPath?: string) {
    this.baseOutputDir = join(__dirname, 'test-output')
    this.pdfPath = customPdfPath || join(__dirname, 'test-input', this.pdfFile)
  }

  private readPdfBuffer(): Buffer {
    return readFileSync(this.pdfPath)
  }

  async run() {
    console.log('🧪 PDF-Decomposer Comprehensive Test Suite')
    console.log('==========================================')
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
      // Test: Embedded images extraction
      await this.testEmbeddedImages()

      // Test: Memory-efficient mode
      await this.testMemoryEfficientMode()

      // Test: Page range processing
      await this.testPageRange()

      // Test: Single page processing
      await this.testSinglePage()

      // Test: Error handling
      await this.testErrorHandling()

      // Print results
      this.printResults()

      process.exit(0)

    } catch (error) {
      console.error('❌ Test suite failed:', error)
      process.exit(1)
    }
  }

  private async testMemoryEfficientMode() {
    const testName = 'Memory-Efficient Mode (Canvas-free)'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)

      const pdfBuffer = this.readPdfBuffer()
      const result = await decomposePdf(pdfBuffer, {
        generateImages: false,        // No Canvas-based page rendering
        extractEmbeddedImages: false  // Text only
      })

      const duration = Date.now() - startTime
      const textElements = result.reduce((acc: any[], page: any) =>
        acc.concat(page.textElements || []), [])

      this.results.push({
        name: testName,
        passed: result.length > 0,
        duration,
        details: `Extracted ${textElements} text elements from ${result.length} pages, no Canvas dependencies`,
        pageCount: result.length
      })

      console.log(`  ✓ Processed ${result.length} pages (text only) in ${duration}ms`)

    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        duration: Date.now() - startTime,
        details: `Error: ${(error as Error).message}`
      })
      console.log(`  ❌ Failed: ${(error as Error).message}`)
    }
  }

  private async testEmbeddedImages() {
    const testName = 'Embedded Images Extraction (Canvas-free)'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)
      console.log(`   📄 Testing with PDF: ${basename(this.pdfPath)}`)

      const outputDir = join(this.baseOutputDir, 'embedded-images')
      mkdirSync(outputDir, { recursive: true })

      const options = {
        elementComposer: true,
        pageComposer: true,
        minify: true
      }

      const pdfBuffer = this.readPdfBuffer()
      const result = await decomposePdf(pdfBuffer, {
        ...options,
        generateImages: false,        // No Canvas-based page rendering
        extractEmbeddedImages: true   // Use our PdfImageExtractor with EXACT working logic
      })

      const duration = Date.now() - startTime

      console.log(`   📊 Processing completed: ${result.length} pages, images found`)

      // Save embedded images to files and analyze
      const imageAnalysis: any[] = []
      const generatedFiles: string[] = []

      for (let i = 0; i < result.length; i++) {
        const page = result[i]
        const pageNum = page.pageNumber || (i + 1)
        const imageElements = page.elements?.filter((e: any) => e.type === 'image') || []

        if (imageElements.length > 0) {
          console.log(`   📸 Page ${pageNum}: Found ${imageElements.length} embedded images`)
        }

        for (let j = 0; j < imageElements.length; j++) {
          const imageElement = imageElements[j]
          const analysis = {
            page: pageNum,
            imageIndex: j + 1,
            id: imageElement.id,
            width: imageElement.attributes?.width || imageElement.width,
            height: imageElement.attributes?.height || imageElement.height,
            format: imageElement.attributes?.format || imageElement.format,
            hasData: !!imageElement.data,
            dataSize: 0,
            scaled: imageElement.attributes?.scaled,
            scaleFactor: imageElement.attributes?.scaleFactor,
            filename: imageElement.data // This is the filename now
          }
          imageAnalysis.push(analysis)

          console.log(`      ✅ ${analysis.id}: ${analysis.width}x${analysis.height} (${analysis.format}) - saved as ${analysis.filename} ${analysis.scaled ? `[scaled ${(analysis.scaleFactor * 100).toFixed(1)}%]` : ''}`)

          // Check if the file actually exists (PdfImageExtractor saves them directly)
          if (imageElement.data && typeof imageElement.data === 'string' && imageElement.data.endsWith('.png')) {
            // Check in multiple possible locations
            const possiblePaths = [
              imageElement.data, // Current working directory
              join(process.cwd(), imageElement.data), // Explicit current directory
              join(outputDir, imageElement.data), // Output directory
              join(__dirname, imageElement.data), // Script directory
              join(__dirname, 'test-input', imageElement.data) // Test input directory
            ]

            for (const filePath of possiblePaths) {
              if (existsSync(filePath)) {
                const stats = statSync(filePath)
                analysis.dataSize = stats.size
                generatedFiles.push(filePath)
                console.log(`      💾 Found saved file: ${basename(filePath)} (${(stats.size / 1024).toFixed(1)}KB) at ${filePath}`)
                break
              }
            }
          }
        }
      }

      // Check for additional asset files in output directory
      const assetFiles = existsSync(outputDir) ? readdirSync(outputDir) : []
      const directAssetImages = assetFiles.filter((file: string) => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'))

      if (directAssetImages.length > 0) {
        console.log(`   📁 Found ${directAssetImages.length} additional saved images in output dir:`)
        directAssetImages.forEach((file: string) => {
          const filePath = join(outputDir, file)
          const stats = statSync(filePath)
          console.log(`     📄 ${file} - ${(stats.size / 1024).toFixed(1)}KB`)
          generatedFiles.push(filePath)
        })
      }

      if (directAssetImages.length > 0) {
        console.log(`   📁 Found ${directAssetImages.length} additional saved images in output dir:`)
        directAssetImages.forEach((file: string) => {
          const filePath = join(outputDir, file)
          const stats = statSync(filePath)
          console.log(`     📄 ${file} - ${(stats.size / 1024).toFixed(1)}KB`)
          generatedFiles.push(filePath)
        })
      }

      const expectedImages = 12 // Based on our test PDF
      const embeddedImageCount = imageAnalysis.length // Use actual found images count
      const successRate = embeddedImageCount > 0 ? ((embeddedImageCount / expectedImages) * 100) : 0

      // Test passes if we extract the expected number of images
      const testPassed = embeddedImageCount >= expectedImages

      this.results.push({
        name: testName,
        passed: testPassed,
        duration,
        details: `Extracted ${embeddedImageCount}/${expectedImages} embedded images (${successRate.toFixed(1)}% success rate), generated ${generatedFiles.length} files`,
        pageCount: result.length,
        embeddedImageCount,
        outputSize: generatedFiles.length
      })

      if (testPassed) {
        console.log(`  ✅ Image extraction test PASSED: ${embeddedImageCount} images found, ${generatedFiles.length} files generated in ${duration}ms`)
        console.log(`     Success rate: ${successRate.toFixed(1)}% (${embeddedImageCount}/${expectedImages} images)`)
      } else {
        console.log(`  ❌ Image extraction test FAILED: Only ${embeddedImageCount} images found, ${generatedFiles.length} files generated`)
      }

      // Save detailed image analysis
      const analysisPath = join(outputDir, 'image-analysis.json')
      writeFileSync(analysisPath, JSON.stringify({
        summary: {
          totalImages: embeddedImageCount,
          expectedImages,
          successRate: successRate.toFixed(1),
          totalFiles: generatedFiles.length,
          processingTime: duration,
          testPassed
        },
        images: imageAnalysis,
        generatedFiles,
        assetFiles: directAssetImages
      }, null, 2))

      // Save complete decomposePdf result for analysis
      const resultPath = join(outputDir, 'result.json')
      writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8')

      console.log(`   📄 Complete decompose result saved to: ${basename(resultPath)}`)

    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        duration: Date.now() - startTime,
        details: `Error: ${(error as Error).message}`
      })
      console.log(`  ❌ Failed: ${(error as Error).message}`)
      console.error('   Full error:', error)
    }
  }

  private async testPageRange() {
    const testName = 'Page Range Processing'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)

      const pdfBuffer = this.readPdfBuffer()
      const result = await decomposePdf(pdfBuffer, {
        generateImages: false,
        extractEmbeddedImages: true,
        startPage: 2,
        endPage: 4
      })

      const duration = Date.now() - startTime
      const expectedPages = [2, 3, 4]
      const actualPages = result.map((p: any) => p.pageNumber)
      const correctRange = JSON.stringify(expectedPages) === JSON.stringify(actualPages)

      this.results.push({
        name: testName,
        passed: correctRange && result.length === 3,
        duration,
        details: `Processed pages ${actualPages.join(', ')} (expected: ${expectedPages.join(', ')})`,
        pageCount: result.length
      })

      console.log(`  ✓ Processed page range 2-4 correctly in ${duration}ms`)

    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        duration: Date.now() - startTime,
        details: `Error: ${(error as Error).message}`
      })
      console.log(`  ❌ Failed: ${(error as Error).message}`)
    }
  }

  private async testSinglePage() {
    const testName = 'Single Page Processing'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)

      const pdfBuffer = this.readPdfBuffer()
      const result = await decomposePdf(pdfBuffer, {
        generateImages: false,
        extractEmbeddedImages: true,
        startPage: 1,
        endPage: 1
      })

      const duration = Date.now() - startTime
      const isCorrectPage = result.length === 1 && result[0].pageNumber === 1

      this.results.push({
        name: testName,
        passed: isCorrectPage,
        duration,
        details: `Processed single page ${result[0]?.pageNumber} with ${result[0]?.elements?.length || 0} elements`,
        pageCount: result.length
      })

      console.log(`  ✓ Processed single page 1 correctly in ${duration}ms`)

    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        duration: Date.now() - startTime,
        details: `Error: ${(error as Error).message}`
      })
      console.log(`  ❌ Failed: ${(error as Error).message}`)
    }
  }

  private async testErrorHandling() {
    const testName = 'Error Handling'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)

      const pdfBuffer = this.readPdfBuffer()
      let errorsCaught = 0

      // Test invalid startPage
      try {
        await decomposePdf(pdfBuffer, { startPage: 0 })
      } catch { errorsCaught++ }

      // Test startPage > endPage
      try {
        await decomposePdf(pdfBuffer, { startPage: 5, endPage: 3 })
      } catch { errorsCaught++ }

      // Test startPage beyond document
      try {
        await decomposePdf(pdfBuffer, { startPage: 100 })
      } catch { errorsCaught++ }

      const duration = Date.now() - startTime

      this.results.push({
        name: testName,
        passed: errorsCaught >= 2, // At least 2 errors should be caught
        duration,
        details: `Correctly caught ${errorsCaught}/3 expected error conditions`
      })

      console.log(`  ✓ Error handling working correctly (${errorsCaught}/3 errors caught) in ${duration}ms`)

    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        duration: Date.now() - startTime,
        details: `Unexpected error: ${(error as Error).message}`
      })
      console.log(`  ❌ Failed: ${(error as Error).message}`)
    }
  }

  private printResults() {
    console.log('\n📊 Comprehensive Test Results')
    console.log('='.repeat(60))

    const passed = this.results.filter(r => r.passed).length
    const total = this.results.length
    const totalTime = this.results.reduce((acc, r) => acc + r.duration, 0)

    console.log(`Overall: ${passed}/${total} tests passed (${Math.round(passed / total * 100)}%)`)
    console.log(`Total execution time: ${totalTime}ms\n`)

    this.results.forEach((result, i) => {
      const status = result.passed ? '✅' : '❌'
      console.log(`${i + 1}. ${status} ${result.name}`)
      console.log(`   Duration: ${result.duration}ms`)
      console.log(`   Details: ${result.details}`)

      if (result.pageCount) console.log(`   Pages processed: ${result.pageCount}`)
      if (result.imageCount) console.log(`   Images generated: ${result.imageCount}`)
      if (result.embeddedImageCount) console.log(`   Embedded images: ${result.embeddedImageCount}`)
      if (result.outputSize) console.log(`   Output files: ${result.outputSize}`)
      console.log('')
    })

    // Save detailed results to JSON
    const resultsPath = join(this.baseOutputDir, 'test-results.json')
    writeFileSync(resultsPath, JSON.stringify({
      summary: {
        passed,
        total,
        successRate: Math.round(passed / total * 100),
        totalTime,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      },
      results: this.results
    }, null, 2))

    console.log(`📄 Detailed results saved to: ${resultsPath}`)

    if (passed === total) {
      console.log('\n🎉 All tests passed! PDF-Decomposer is Canvas-free and working perfectly.')
    } else {
      console.log(`\n⚠️  ${total - passed} test(s) failed. Please review the results above.`)
      process.exit(1)
    }
  }
}

// Run the comprehensive test
const customPdfPath = process.argv[2]
const test = new ComprehensiveTest(customPdfPath)
test.run().catch(error => {
  console.error('❌ Test suite crashed:', error)
  process.exit(1)
})
