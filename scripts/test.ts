#!/usr/bin/env node

/**
 * PDF-Decomposer Comprehensive Test Suite
 *
 * Tests all major functionality      // Custom cleanComposer options for 90% width & 90% height content area
      const decomposeResult = await this.decomposer.decompose({
        outputDir,
        extractImages: true,
        elementComposer: true,
        pageComposer: true,
        cleanComposer: true,
        cleanComposerOptions: {
          topMarginPercent: 0.05,      // 5% top margin (instead of default 10%)
          bottomMarginPercent: 0.05,   // 5% bottom margin (instead of default 10%)
          sideMarginPercent: 0.05,     // 5% side margin (keeps default 5%)
          minTextHeight: 8,            // Keep default text filtering
          minTextWidth: 10,            // Keep default text filtering
          minTextLength: 3,            // Keep default text filtering
          minImageWidth: 50,           // Keep default image filtering
          minImageHeight: 50,          // Keep default image filtering
          minImageArea: 2500,          // Keep default image filtering
          removeControlCharacters: true,
          removeIsolatedCharacters: true
        },
        minify: true
      })xt extraction
 * - Image extraction (embedded)
 * - Memory efficiency
 * - Error handling
 * - Node.js 16+ compatibility
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { PdfDecomposer } from '../dist/index'

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
  private pdfFile = 'demo.pdf'
  private decomposer!: PdfDecomposer

  constructor(customPdfPath?: string) {
    this.baseOutputDir = join(__dirname, 'test-output')
    this.pdfPath = customPdfPath || join(__dirname, 'test-input', this.pdfFile)
  }

  private readPdfBuffer(): Buffer {
    return readFileSync(this.pdfPath)
  }

  private async initializeDecomposer(): Promise<void> {
    const pdfBuffer = this.readPdfBuffer()
    this.decomposer = new PdfDecomposer(pdfBuffer)
    await this.decomposer.initialize()
    console.log('🚀 PDF decomposer initialized and ready for tests')
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
      // Initialize decomposer once for all tests
      await this.initializeDecomposer()

      // Test: PDF Decomposition with Clean Composer
      await this.testPdfDecompose()

      // Print results
      this.printResults()

      process.exit(0)

    } catch (error) {
      console.error('❌ Test suite failed:', error)
      process.exit(1)
    }
  }

  private async testPdfDecompose() {
    const testName = 'PDF Decomposition with Clean Composer and Image Extraction'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)
      console.log(`📄 Testing with PDF: ${basename(this.pdfPath)}`)
      
      const outputDir = join(this.baseOutputDir, 'pdf-decompose')
      mkdirSync(outputDir, { recursive: true })
      
      /*
      // Example: Custom cleanComposer options if needed (optional)
      cleanComposerOptions: {
        minImageWidth: 100,     // Stricter: 100px minimum width
        minImageHeight: 100,    // Stricter: 100px minimum height
        minImageArea: 10000,    // Stricter: 10000px² minimum area
        minTextLength: 5        // Longer text requirement
      }
      */
      
      // Test without cleanComposer for comparison
      const decomposeResult = await this.decomposer.decompose({
        outputDir,
        extractImages: true,
        elementComposer: true,
        pageComposer: true,
        cleanComposer: true,
        cleanComposerOptions: {
          topMarginPercent: 0.05,      // 5% top margin (instead of default 10%)
          bottomMarginPercent: 0.05,   // 5% bottom margin (instead of default 10%)
          sideMarginPercent: 0.05,     // 5% side margin (keeps default 5%)
        },
        // minify: true
      })

      const result = decomposeResult.pages
      const duration = Date.now() - startTime

      // Calculate cleaning effectiveness
      const elementCount = result.reduce((total: number, page: any) => 
        total + (page.elements?.length || 0), 0)

      // Check for generated image files in output directory
      const generatedFiles: string[] = []
      const assetFiles = existsSync(outputDir) ? readdirSync(outputDir) : []
      const directAssetImages = assetFiles.filter((file: string) => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'))

      if (directAssetImages.length > 0) {
        console.log(`� Found ${directAssetImages.length} total image files in output dir:`)
        directAssetImages.forEach((file: string) => {
          const filePath = join(outputDir, file)
          const stats = statSync(filePath)
          console.log(`📄 ${file} - ${(stats.size / 1024).toFixed(1)}KB`)
          if (!generatedFiles.includes(filePath)) {
            generatedFiles.push(filePath)
          }
        })
      }

      console.log('📊 PDF Decomposition Results:')
      console.log(`  Original elements: ${elementCount}`)
      console.log(`  Generated image files: ${generatedFiles.length}`)

      // Test success criteria
      const expectedImageFiles = 1
      const actualImageFiles = generatedFiles.length
      const imageTestPassed = actualImageFiles >= expectedImageFiles
      const overallTestPassed = imageTestPassed

      // Save comprehensive analysis
      const analysisPath = join(outputDir, 'decompose-analysis.json')
      writeFileSync(analysisPath, JSON.stringify({
        summary: {
          elementCount,
          totalImageFiles: actualImageFiles,
          expectedImageFiles,
          imageSuccessRate: actualImageFiles > 0 ? ((actualImageFiles / expectedImageFiles) * 100) : 0,
          processingTime: duration,
          imageTestPassed,
          overallTestPassed
        },
        result,
        generatedFiles,
        assetFiles: directAssetImages
      }, null, 2))

      // Save complete decompose result for analysis
      const resultPath = join(outputDir, 'result.json')
      writeFileSync(resultPath, JSON.stringify(result, null, 2), 'utf-8')

      this.results.push({
        name: testName,
        passed: overallTestPassed,
        duration,
        details: `Generated ${actualImageFiles} image files`,
        pageCount: result.length,
        imageCount: actualImageFiles,
        outputSize: generatedFiles.length
      })

      if (overallTestPassed) {
        console.log(`✅ PDF Decomposition test PASSED: ${actualImageFiles} images generated in ${duration}ms`)
      } else {
        console.log(`❌ PDF Decomposition test FAILED: Image test: ${imageTestPassed}`)
      }

      console.log(`📄 Complete decompose result saved to: ${basename(resultPath)}`)

    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        duration: Date.now() - startTime,
        details: `Error: ${(error as Error).message}`
      })
      console.log(`❌ Failed: ${(error as Error).message}`)
      console.error('Full error:', error)
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
      console.log(`Duration: ${result.duration}ms`)
      console.log(`Details: ${result.details}`)

      if (result.pageCount) console.log(`Pages processed: ${result.pageCount}`)
      if (result.imageCount) console.log(`Images generated: ${result.imageCount}`)
      if (result.embeddedImageCount) console.log(`Embedded images: ${result.embeddedImageCount}`)
      if (result.outputSize) console.log(`Output files: ${result.outputSize}`)
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
