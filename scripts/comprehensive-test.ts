#!/usr/bin/env tsx

import * as fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { decomposePdf } from '../src/api/decomposePdf.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

  constructor() {
    this.baseOutputDir = path.join(__dirname, 'comprehensive-test-output')
    this.pdfPath = path.join(__dirname, 'pdf-test-input', 'demo.pdf')
  }

  async run() {
    console.log('🧪 PDF-Decomposer Comprehensive Test Suite')
    console.log('==========================================')
    console.log(`📊 Node.js version: ${process.version}`)
    console.log(`📄 Test PDF: ${path.basename(this.pdfPath)}`)
    console.log(`📁 Output directory: ${this.baseOutputDir}\n`)

    // Clean up previous test results
    if (fs.existsSync(this.baseOutputDir)) {
      fs.rmSync(this.baseOutputDir, { recursive: true })
    }
    fs.mkdirSync(this.baseOutputDir, { recursive: true })

    try {
      // Test 1: Basic functionality with images
      await this.testBasicWithImages()

      // Test 2: Memory-efficient mode (no images)
      await this.testMemoryEfficientMode()

      // Test 3: Embedded images extraction
      await this.testEmbeddedImages()

      // Test 4: Page range processing
      await this.testPageRange()

      // Test 5: Single page processing
      await this.testSinglePage()

      // Test 6: High-quality images
      await this.testHighQualityImages()

      // Test 7: Error handling
      await this.testErrorHandling()

      // Print comprehensive results
      this.printResults()

      process.exit(0)

    } catch (error) {
      console.error('❌ Test suite failed:', error)
      process.exit(1)
    }
  }

  private async testBasicWithImages() {
    const testName = 'Basic Processing with Images'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)
      const outputDir = path.join(this.baseOutputDir, 'basic-with-images')

      const result = await decomposePdf(this.pdfPath, {
        assetPath: outputDir,
        generateImages: true,
        imageWidth: 800,
        imageQuality: 85
      })

      const duration = Date.now() - startTime
      const outputFiles = this.countFiles(outputDir)

      this.results.push({
        name: testName,
        passed: result.length > 0 && result.every(p => p.image && p.thumbnail),
        duration,
        details: `Generated page images and thumbnails for all ${result.length} pages`,
        outputSize: outputFiles,
        pageCount: result.length,
        imageCount: result.filter(p => p.image).length
      })

      console.log(`  ✓ Processed ${result.length} pages with images in ${duration}ms`)

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

  private async testMemoryEfficientMode() {
    const testName = 'Memory-Efficient Mode (No Images)'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)
      const outputDir = path.join(this.baseOutputDir, 'memory-efficient')

      const result = await decomposePdf(this.pdfPath, {
        assetPath: outputDir
        // generateImages defaults to false - memory efficient
      })

      const duration = Date.now() - startTime
      const textElements = result.reduce((acc, page) =>
        acc + page.elements.filter((el: any) => el.type === 'text').length, 0)

      this.results.push({
        name: testName,
        passed: result.length > 0 && result.every(p => !p.image && !p.thumbnail),
        duration,
        details: `Extracted ${textElements} text elements, no images generated`,
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
    const testName = 'Embedded Images Extraction'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)
      const outputDir = path.join(this.baseOutputDir, 'embedded-images')

      const result = await decomposePdf(this.pdfPath, {
        assetPath: outputDir,
        extractEmbeddedImages: true,
        endPage: 3  // Test first 3 pages
      })

      const duration = Date.now() - startTime
      const embeddedImages = result.reduce((acc, page) =>
        acc + page.elements.filter((el: any) => el.type === 'image').length, 0)
      const imageFiles = this.countImageFiles(outputDir)

      this.results.push({
        name: testName,
        passed: embeddedImages > 0,
        duration,
        details: `Extracted ${embeddedImages} embedded images from ${result.length} pages`,
        pageCount: result.length,
        embeddedImageCount: embeddedImages,
        outputSize: imageFiles
      })

      console.log(`  ✓ Extracted ${embeddedImages} embedded images in ${duration}ms`)

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

  private async testPageRange() {
    const testName = 'Page Range Processing'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)
      const outputDir = path.join(this.baseOutputDir, 'page-range')

      const result = await decomposePdf(this.pdfPath, {
        assetPath: outputDir,
        startPage: 2,
        endPage: 4,
        generateImages: true
      })

      const duration = Date.now() - startTime
      const expectedPages = [2, 3, 4]
      const actualPages = result.map(p => p.pageNumber)
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
      const outputDir = path.join(this.baseOutputDir, 'single-page')

      const result = await decomposePdf(this.pdfPath, {
        assetPath: outputDir,
        startPage: 3,
        endPage: 3,
        generateImages: true,
        extractEmbeddedImages: true
      })

      const duration = Date.now() - startTime
      const isCorrectPage = result.length === 1 && result[0].pageNumber === 3

      this.results.push({
        name: testName,
        passed: isCorrectPage,
        duration,
        details: `Processed single page ${result[0]?.pageNumber} with ${result[0]?.elements.length} elements`,
        pageCount: result.length
      })

      console.log(`  ✓ Processed single page 3 correctly in ${duration}ms`)

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

  private async testHighQualityImages() {
    const testName = 'High-Quality Images'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)
      const outputDir = path.join(this.baseOutputDir, 'high-quality')

      const result = await decomposePdf(this.pdfPath, {
        assetPath: outputDir,
        endPage: 2,  // Test first 2 pages
        generateImages: true,
        imageWidth: 1600,
        imageQuality: 95
      })

      const duration = Date.now() - startTime
      const allHaveImages = result.every(p => p.image && p.thumbnail)

      this.results.push({
        name: testName,
        passed: allHaveImages,
        duration,
        details: `Generated high-quality images (1600px, 95% quality) for ${result.length} pages`,
        pageCount: result.length,
        imageCount: result.filter(p => p.image).length
      })

      console.log(`  ✓ Generated high-quality images in ${duration}ms`)

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

      let errorsCaught = 0

      // Test invalid startPage
      try {
        await decomposePdf(this.pdfPath, { startPage: 0 })
      } catch { errorsCaught++ }

      // Test startPage > endPage
      try {
        await decomposePdf(this.pdfPath, { startPage: 5, endPage: 3 })
      } catch { errorsCaught++ }

      // Test startPage beyond document
      try {
        await decomposePdf(this.pdfPath, { startPage: 100 })
      } catch { errorsCaught++ }

      const duration = Date.now() - startTime

      this.results.push({
        name: testName,
        passed: errorsCaught === 3,
        duration,
        details: `Correctly caught ${errorsCaught}/3 expected error conditions`
      })

      console.log(`  ✓ Error handling working correctly in ${duration}ms`)

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

  private countFiles(dir: string): number {
    if (!fs.existsSync(dir)) return 0
    return fs.readdirSync(dir).length
  }

  private countImageFiles(dir: string): number {
    if (!fs.existsSync(dir)) return 0
    return fs.readdirSync(dir).filter(f =>
      f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg')
    ).length
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
    const resultsPath = path.join(this.baseOutputDir, 'test-results.json')
    fs.writeFileSync(resultsPath, JSON.stringify({
      summary: {
        passed,
        total,
        successRate: Math.round(passed / total * 100),
        totalTime,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version
      },
      results: this.results
    }, null, 2))

    console.log(`📄 Detailed results saved to: ${resultsPath}`)

    if (passed === total) {
      console.log('\n🎉 All tests passed! PDF-Decomposer is working perfectly.')
    } else {
      console.log(`\n⚠️  ${total - passed} test(s) failed. Please review the results above.`)
      process.exit(1)
    }
  }
}

// Run the comprehensive test
const test = new ComprehensiveTest()
test.run().catch(error => {
  console.error('❌ Test suite crashed:', error)
  process.exit(1)
})
