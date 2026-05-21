#!/usr/bin/env node

/**
 * PDF-Decomposer Puppeteer-renderer validation
 *
 * Same drone-jobs flow as test-details.ts (per-page data() + screenshot loop,
 * then full decompose()), but with screenshots routed through PuppeteerRenderer
 * instead of node-canvas.
 *
 * Goal: prove that PuppeteerRenderer
 *   (a) doesn't OOM on the 182MB / 124-page fixture, and
 *   (b) produces non-blank screenshots (the failure mode from past attempts).
 *
 * Run:
 *   npm install puppeteer   # one-time, in this repo
 *   npm run test:puppeteer  # uses scripts/test-input/mivision.pdf
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { PdfDecomposer, PuppeteerRenderer } from '../dist/index'

interface PhaseResult {
  name: string
  passed: boolean
  duration: number
  details: string
  pageCount?: number
  imageCount?: number
}

class PuppeteerRendererTest {
  private results: PhaseResult[] = []
  private baseOutputDir: string
  private pdfPath: string
  private pdfFile = 'mivision.pdf'
  private decomposer!: PdfDecomposer

  constructor(customPdfPath?: string) {
    this.baseOutputDir = join(__dirname, 'test-output')
    this.pdfPath = customPdfPath || join(__dirname, 'test-input', this.pdfFile)
  }

  private logMemoryUsage(label: string): void {
    const usage = process.memoryUsage?.()
    if (usage) {
      const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024)
      const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024)
      const rssMB = Math.round(usage.rss / 1024 / 1024)
      const externalMB = Math.round(usage.external / 1024 / 1024)
      console.log(`💾 [${label}] heap ${heapUsedMB}/${heapTotalMB} MB, rss ${rssMB} MB, external ${externalMB} MB`)
    }
  }

  async run() {
    console.log('🧪 PDF-Decomposer — PuppeteerRenderer validation')
    console.log('================================================')
    console.log(`📊 Node.js version: ${process.version}`)
    console.log(`📄 Test PDF: ${basename(this.pdfPath)}`)
    console.log(`📁 PDF path: ${this.pdfPath}`)
    console.log(`📁 Output dir: ${this.baseOutputDir}\n`)

    if (!existsSync(this.pdfPath)) {
      console.error(`❌ PDF file not found: ${this.pdfPath}`)
      process.exit(1)
    }
    const pdfStats = statSync(this.pdfPath)
    console.log(`📏 PDF file size: ${Math.round(pdfStats.size / 1024)} KB`)

    if (existsSync(this.baseOutputDir)) {
      rmSync(this.baseOutputDir, { recursive: true })
    }
    mkdirSync(this.baseOutputDir, { recursive: true })

    try {
      this.logMemoryUsage('Start')

      const renderer = new PuppeteerRenderer({
        // Set debug to see browser-side console output if a render misbehaves.
        debug: false
      })

      const pdfBuffer = readFileSync(this.pdfPath)
      this.decomposer = new PdfDecomposer(pdfBuffer, { renderer })
      await this.decomposer.initialize()
      this.logMemoryUsage('After PDF + Chromium initialization')

      await this.phase1PerPageDataAndScreenshot()
      await this.phase2FullDecompose()

      // Always dispose — closes Chromium and releases pdf.js doc resources.
      await this.decomposer.dispose()
      this.logMemoryUsage('After dispose')

      this.printResults()
      process.exit(0)
    } catch (error) {
      console.error('❌ Test suite failed:', error)
      this.logMemoryUsage('Crash')
      try { await this.decomposer?.dispose() } catch { /* ignore */ }
      process.exit(1)
    }
  }

  private async phase1PerPageDataAndScreenshot() {
    const phaseName = 'Phase 1: per-page data() + screenshot() via PuppeteerRenderer'
    const startTime = Date.now()

    try {
      console.log(`\n🔄 ${phaseName}`)
      const outputDir = join(this.baseOutputDir, 'phase1-per-page')
      mkdirSync(outputDir, { recursive: true })

      const totalPages = this.decomposer.numPages
      console.log(`📄 Looping over ${totalPages} pages`)
      this.logMemoryUsage('Phase 1 start')

      let dataSuccess = 0
      let screenshotSuccess = 0
      let nonBlankCount = 0
      let totalAreas = 0

      for (let page = 1; page <= totalPages; page++) {
        try {
          const dataResult = await this.decomposer.data({
            startPage: page,
            endPage: page,
            imageWidth: 1024,
            extractImages: true,
            elementComposer: true,
            cleanComposer: true,
            skipScreenshots: true
          })
          if (dataResult.data?.length > 0) {
            totalAreas += dataResult.data[0].areas?.length ?? 0
            dataSuccess++
          }

          const screenshotResult = await this.decomposer.screenshot({
            startPage: page,
            endPage: page,
            imageWidth: 1024,
            imageQuality: 85,
            outputDir
          })

          if (screenshotResult.screenshots?.length > 0 && !screenshotResult.screenshots[0].error) {
            screenshotSuccess++
            // Non-blank check: a typical 1024-wide JPEG of meaningful content
            // is at least ~5 KB. Smaller usually means blank/solid color.
            const fp = screenshotResult.screenshots[0].filePath
            if (fp && existsSync(fp)) {
              const size = statSync(fp).size
              if (size > 5 * 1024) nonBlankCount++
            }
          }
        } catch (pageError) {
          console.error(`   ❌ Page ${page} failed: ${(pageError as Error).message}`)
        }

        if (page % 5 === 0 || page === totalPages) {
          console.log(`   ✓ Processed ${page}/${totalPages}`)
          this.logMemoryUsage(`Page ${page}/${totalPages}`)
        }
      }

      const duration = Date.now() - startTime
      const files = readdirSync(outputDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'))

      const passed = dataSuccess === totalPages
        && screenshotSuccess === totalPages
        && nonBlankCount === totalPages

      console.log(`📊 Phase 1 summary: data ${dataSuccess}/${totalPages}, screenshots ${screenshotSuccess}/${totalPages}, non-blank ${nonBlankCount}/${totalPages}, ${totalAreas} areas, ${files.length} files on disk`)

      this.results.push({
        name: phaseName,
        passed,
        duration,
        details: `data ${dataSuccess}/${totalPages}, screenshots ${screenshotSuccess}/${totalPages}, non-blank ${nonBlankCount}/${totalPages}, ${totalAreas} areas`,
        pageCount: totalPages,
        imageCount: files.length
      })

      console.log(passed
        ? `✅ Phase 1 PASSED in ${duration}ms`
        : `❌ Phase 1 FAILED — data ${dataSuccess}/${totalPages}, screenshots ${screenshotSuccess}/${totalPages}, non-blank ${nonBlankCount}/${totalPages}`)

      this.logMemoryUsage('Phase 1 complete')
    } catch (error) {
      this.results.push({
        name: phaseName,
        passed: false,
        duration: Date.now() - startTime,
        details: `Error: ${(error as Error).message}`
      })
      console.error(`❌ ${phaseName} crashed: ${(error as Error).message}`)
      throw error
    }
  }

  private async phase2FullDecompose() {
    const phaseName = 'Phase 2: full-document decompose() (Node-side pdf.js, unchanged)'
    const startTime = Date.now()

    try {
      console.log(`\n🔄 ${phaseName}`)
      const outputDir = join(this.baseOutputDir, 'phase2-full-decompose')
      mkdirSync(outputDir, { recursive: true })
      this.logMemoryUsage('Phase 2 start')

      const decomposeResult = await this.decomposer.decompose({
        outputDir,
        extractImages: true,
        extractLinks: true,
        elementComposer: true,
        pageComposer: true,
        cleanComposer: true,
        cleanComposerOptions: {
          topMarginPercent: 0.05,
          bottomMarginPercent: 0.05,
          sideMarginPercent: 0.15
        },
        minify: true,
        minifyOptions: {
          format: 'plain',
          elementAttributes: true
        }
      })

      const pages = decomposeResult.pages
      const duration = Date.now() - startTime
      const elementCount = pages.reduce((total: number, page: any) =>
        total + (page.elements?.length || 0), 0)
      const assetFiles = readdirSync(outputDir).filter((file: string) =>
        file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'))

      console.log(`📊 Phase 2 summary: ${pages.length} composed pages, ${elementCount} elements, ${assetFiles.length} image files`)

      writeFileSync(
        join(outputDir, 'decompose-result.json'),
        JSON.stringify(pages, null, 2),
        'utf-8'
      )

      const passed = pages.length > 0 && elementCount > 0
      this.results.push({
        name: phaseName,
        passed,
        duration,
        details: `${pages.length} composed pages, ${elementCount} elements, ${assetFiles.length} image files`,
        pageCount: pages.length,
        imageCount: assetFiles.length
      })

      console.log(passed
        ? `✅ Phase 2 PASSED in ${duration}ms`
        : '❌ Phase 2 FAILED')

      this.logMemoryUsage('Phase 2 complete')
    } catch (error) {
      this.results.push({
        name: phaseName,
        passed: false,
        duration: Date.now() - startTime,
        details: `Error: ${(error as Error).message}`
      })
      console.error(`❌ ${phaseName} crashed: ${(error as Error).message}`)
      throw error
    }
  }

  private printResults() {
    console.log('\n📊 PuppeteerRenderer validation results')
    console.log('='.repeat(60))

    const passed = this.results.filter(r => r.passed).length
    const total = this.results.length
    const totalTime = this.results.reduce((acc, r) => acc + r.duration, 0)

    console.log(`Overall: ${passed}/${total} phases passed (${Math.round(passed / total * 100)}%)`)
    console.log(`Total execution time: ${totalTime}ms\n`)

    this.results.forEach((result, i) => {
      const status = result.passed ? '✅' : '❌'
      console.log(`${i + 1}. ${status} ${result.name}`)
      console.log(`   Duration: ${result.duration}ms`)
      console.log(`   Details: ${result.details}`)
      if (result.pageCount) console.log(`   Pages: ${result.pageCount}`)
      if (result.imageCount) console.log(`   Images: ${result.imageCount}`)
      console.log('')
    })

    writeFileSync(
      join(this.baseOutputDir, 'results.json'),
      JSON.stringify({
        summary: { passed, total, successRate: Math.round(passed / total * 100), totalTime },
        results: this.results
      }, null, 2)
    )

    if (passed !== total) process.exit(1)
  }
}

const customPdfPath = process.argv[2]
const test = new PuppeteerRendererTest(customPdfPath)
test.run().catch(error => {
  console.error('❌ Test suite crashed:', error)
  process.exit(1)
})
