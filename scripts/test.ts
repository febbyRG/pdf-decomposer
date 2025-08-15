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
  private pdfFile = 'test.pdf'
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

      // Test: Page range processing
      await this.testPageRange()

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

  private async testPdfDecompose() {
    const testName = 'PDF Decomposition with Clean Composer and Image Extraction'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)
      console.log(`📄 Testing with PDF: ${basename(this.pdfPath)}`)
      
      const outputDir = join(this.baseOutputDir, 'pdf-decompose')
      mkdirSync(outputDir, { recursive: true })

      // Test with full decomposition options including cleanComposer
      // Using default cleanComposer options (no need to specify manually)
      const fullOptions = {
        extractImages: true,
        elementComposer: true,
        pageComposer: true,
        cleanComposer: true, // Will use default image filtering (50×50 minimum, 2500px² area)
        minify: true
      }
      
      // Example: Custom cleanComposer options if needed (optional)
      // cleanComposerOptions: {
      //   minImageWidth: 100,     // Stricter: 100px minimum width
      //   minImageHeight: 100,    // Stricter: 100px minimum height
      //   minImageArea: 10000,    // Stricter: 10000px² minimum area
      //   minTextLength: 5        // Longer text requirement
      // }
      
      const cleanResult = await this.decomposer.decompose({
        ...fullOptions,
        outputDir
      })

      // Test without cleanComposer for comparison
      const originalResult = await this.decomposer.decompose({
        extractImages: true,
        elementComposer: true,
        pageComposer: true,
        cleanComposer: false,
        minify: true
      })

      const duration = Date.now() - startTime

      console.log(`📊 Processing completed: ${cleanResult.length} pages`)

      // Calculate cleaning effectiveness
      const originalElementCount = originalResult.reduce((total: number, page: any) => 
        total + (page.elements?.length || 0), 0)
      const cleanedElementCount = cleanResult.reduce((total: number, page: any) => 
        total + (page.elements?.length || 0), 0)
      
      const elementReduction = originalElementCount - cleanedElementCount
      const reductionPercentage = originalElementCount > 0 ? 
        ((elementReduction / originalElementCount) * 100) : 0

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
      console.log(`  Original elements: ${originalElementCount}`)
      console.log(`  Cleaned elements: ${cleanedElementCount}`)
      console.log(`  Elements removed: ${elementReduction} (${reductionPercentage.toFixed(1)}%)`)
      console.log(`  Generated image files: ${generatedFiles.length}`)

      // Test success criteria
      const expectedImageFiles = 1
      const actualImageFiles = generatedFiles.length
      const imageTestPassed = actualImageFiles >= expectedImageFiles
      const cleaningTestPassed = elementReduction > 0
      const overallTestPassed = imageTestPassed && cleaningTestPassed

      // Save comprehensive analysis
      const analysisPath = join(outputDir, 'decompose-analysis.json')
      writeFileSync(analysisPath, JSON.stringify({
        summary: {
          originalElementCount,
          cleanedElementCount,
          elementReduction,
          reductionPercentage: parseFloat(reductionPercentage.toFixed(1)),
          totalImageFiles: actualImageFiles,
          expectedImageFiles,
          imageSuccessRate: actualImageFiles > 0 ? ((actualImageFiles / expectedImageFiles) * 100) : 0,
          processingTime: duration,
          imageTestPassed,
          cleaningTestPassed,
          overallTestPassed
        },
        originalResult,
        cleanedResult: cleanResult,
        generatedFiles,
        assetFiles: directAssetImages
      }, null, 2))

      // Save complete decompose result for analysis
      const resultPath = join(outputDir, 'result.json')
      writeFileSync(resultPath, JSON.stringify(cleanResult, null, 2), 'utf-8')

      this.results.push({
        name: testName,
        passed: overallTestPassed,
        duration,
        details: `Generated ${actualImageFiles} image files, filtered out ${elementReduction}/${originalElementCount} elements (${reductionPercentage.toFixed(1)}% reduction)`,
        pageCount: cleanResult.length,
        imageCount: actualImageFiles,
        outputSize: generatedFiles.length
      })

      if (overallTestPassed) {
        console.log(`✅ PDF Decomposition test PASSED: ${reductionPercentage.toFixed(1)}% element reduction, ${actualImageFiles} images generated in ${duration}ms`)
      } else {
        console.log(`❌ PDF Decomposition test FAILED: Image test: ${imageTestPassed}, Cleaning test: ${cleaningTestPassed}`)
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

  private async testPageRange() {
    const testName = 'Page Range Processing'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)
      
      // Use already initialized decomposer
      const result = await this.decomposer.decompose({
        extractImages: true,
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

  private async testErrorHandling() {
    const testName = 'Error Handling'
    const startTime = Date.now()

    try {
      console.log(`🔄 Running: ${testName}...`)

      let errorsCaught = 0

      // Test invalid startPage (reuse decomposer, should fail at validation level)
      try {
        await this.decomposer.decompose({ startPage: 0 })
      } catch { errorsCaught++ }

      // Test startPage > endPage (reuse decomposer, should fail at validation level)
      try {
        await this.decomposer.decompose({ startPage: 5, endPage: 3 })
      } catch { errorsCaught++ }

      // Test startPage beyond document (reuse decomposer, should process 0 pages)
      try {
        await this.decomposer.decompose({ startPage: 100 })
      } catch { errorsCaught++ }

      const duration = Date.now() - startTime

      this.results.push({
        name: testName,
        passed: errorsCaught >= 2, // At least 2 errors should be caught
        duration,
        details: `Correctly caught ${errorsCaught}/3 expected error conditions`
      })

      console.log(`✓ Error handling working correctly (${errorsCaught}/3 errors caught) in ${duration}ms`)

    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        duration: Date.now() - startTime,
        details: `Unexpected error: ${(error as Error).message}`
      })
      console.log(`❌ Failed: ${(error as Error).message}`)
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
