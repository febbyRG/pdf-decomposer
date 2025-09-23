#!/usr/bin/env node

/**
 * PDF-Decomposer Slice Function Test
 * 
 * Tests the slice functionality by creating a smaller PDF file
 * from the first 3 pages of the original demo.pdf
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { basename, join } from 'path'
import { PdfDecomposer } from '../dist/index'

interface SliceTestResult {
  name: string
  passed: boolean
  duration: number
  details: string
  originalPages: number
  slicedPages: number
  fileSize: number
  outputFile: string
}

class SliceTest {
  private results: SliceTestResult[] = []
  private baseOutputDir: string
  private pdfPath: string
  private pdfFile = 'achievers.pdf'
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
    console.log('🚀 PDF decomposer initialized and ready for slice tests')
  }

  async run() {
    console.log('🧪 PDF-Decomposer Slice Function Test')
    console.log('====================================')
    console.log(`📊 Node.js version: ${process.version}`)
    console.log(`📄 Test PDF: ${basename(this.pdfPath)}`)
    console.log(`📁 PDF Full Path: ${this.pdfPath}`)
    console.log(`📁 Output directory: ${this.baseOutputDir}\n`)

    // Verify PDF file exists
    if (!existsSync(this.pdfPath)) {
      console.error(`❌ PDF file not found: ${this.pdfPath}`)
      process.exit(1)
    }

    const pdfStats = readFileSync(this.pdfPath)
    console.log(`📏 PDF file size: ${Math.round(pdfStats.length / 1024)} KB`)

    try {
      // Clean up previous slice test results only
      const sliceOutputDir = join(this.baseOutputDir, 'slice-tests')
      if (existsSync(sliceOutputDir)) {
        console.log('🧹 Cleaning up previous slice test results...')
        rmSync(sliceOutputDir, { recursive: true, force: true })
      }

      // Create output directory
      if (!existsSync(this.baseOutputDir)) {
        mkdirSync(this.baseOutputDir, { recursive: true })
      }

      // Initialize decomposer once for all tests
      await this.initializeDecomposer()

      // Run slice test
      await this.testSlice()

      this.printResults()

    } catch (error) {
      console.error('❌ Test suite failed:', error)
      process.exit(1)
    }
  }

  private async testSlice() {
    const testName = 'PDF Slice Test'
    console.log(`🔄 Running: ${testName}...`)
    
    const startTime = Date.now()
    
    try {
      // Reinitialize decomposer to get fresh PDF state
      await this.initializeDecomposer()
      
      const outputDir = join(this.baseOutputDir, 'slice-tests')
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true })
      }
      
      const totalPages = this.decomposer.numPages
      
      // Adjust the number of pages based on actual page count
      const numberPages = Math.min(42, totalPages)
      
      const sliceResult = await this.decomposer.slice({
        startPage: 22,
        numberPages: numberPages
      })

      const outputFile = join(outputDir, 'sliced-pages.pdf')
      writeFileSync(outputFile, sliceResult.pdfBytes)
      
      const duration = Date.now() - startTime
      const fileSizeKB = Math.round(sliceResult.fileSize / 1024)

      const result: SliceTestResult = {
        name: testName,
        passed: sliceResult.slicedPageCount === numberPages,
        duration,
        details: `Created PDF with first ${numberPages} pages (${fileSizeKB}KB)`,
        originalPages: sliceResult.originalPageCount,
        slicedPages: sliceResult.slicedPageCount,
        fileSize: sliceResult.fileSize,
        outputFile
      }

      this.results.push(result)
      console.log(`✅ ${testName} PASSED: ${result.details} in ${duration}ms`)

    } catch (error) {
      const duration = Date.now() - startTime
      const result: SliceTestResult = {
        name: testName,
        passed: false,
        duration,
        details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        originalPages: 0,
        slicedPages: 0,
        fileSize: 0,
        outputFile: 'N/A'
      }
      this.results.push(result)
      console.log(`❌ ${testName} FAILED: ${result.details}`)
    }
  }

  private printResults() {
    console.log('\n📊 Slice Test Results')
    console.log('============================================================')
    
    const passed = this.results.filter(r => r.passed).length
    const total = this.results.length
    console.log(`Overall: ${passed}/${total} tests passed (${Math.round(passed/total*100)}%)`)
    
    const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0)
    console.log(`Total execution time: ${totalTime}ms\n`)

    this.results.forEach((result, index) => {
      const status = result.passed ? '✅' : '❌'
      console.log(`${index + 1}. ${status} ${result.name}`)
      console.log(`Duration: ${result.duration}ms`)
      console.log(`Details: ${result.details}`)
      if (result.passed) {
        console.log(`Original pages: ${result.originalPages}`)
        console.log(`Sliced pages: ${result.slicedPages}`)
        console.log(`Output file: ${result.outputFile}`)
      }
      console.log('')
    })

    // Summary of generated files
    const successfulTests = this.results.filter(r => r.passed)
    if (successfulTests.length > 0) {
      console.log('📁 Generated PDF Files:')
      successfulTests.forEach(result => {
        const fileSizeKB = Math.round(result.fileSize / 1024)
        console.log(`📄 ${basename(result.outputFile)} - ${fileSizeKB}KB (${result.slicedPages} pages)`)
      })
    }

    console.log('\n🎉 Slice test completed!')
  }
}

// Run tests if called directly
if (require.main === module) {
  const test = new SliceTest()
  test.run().catch(error => {
    console.error('❌ Test execution failed:', error)
    process.exit(1)
  })
}

export { SliceTest }