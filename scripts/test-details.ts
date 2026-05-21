#!/usr/bin/env node

/**
 * PDF-Decomposer drone-jobs flow replication
 *
 * Reproduces the exact two-phase flow that drone-jobs
 * `conversion-ai-basic` runs in production, so the 182MB / 124-page OOM
 * scenario can be exercised (or proven fixed) on a developer machine.
 *
 * Phase 1 mirrors `generateAndUploadScreenshots()` in
 * drone-jobs/functions/conversion-ai-basic/src/index.ts:236-287 :
 *   - decomposer.data({ startPage: p, endPage: p, skipScreenshots: true, ... })
 *   - decomposer.screenshot({ startPage: p, endPage: p, ... })
 *   - NO REINIT_INTERVAL workaround — that workaround is what the
 *     pdf-decomposer improvements (releasePage / cleanup / streaming JPEG)
 *     are meant to replace.
 *
 * Phase 2 mirrors `decomposeAndProcessPages()` in
 * drone-jobs/functions/conversion-ai-basic/src/index.ts:313-334 :
 *   - decomposer.decompose({ extractImages, extractLinks, elementComposer,
 *                            pageComposer, cleanComposer, ... })
 *
 * Memory is logged every 5 pages so RSS growth (or its absence) is visible
 * in the test output and can be compared against production logs.
 *
 * Recommended invocation (mirrors drone-jobs production NODE_OPTIONS):
 *   node --max-old-space-size=8192 --expose-gc -r ts-node/register \
 *     scripts/test-details.ts
 *
 * Without --max-old-space-size, V8's external-memory pressure threshold
 * stays at the default (tied to ~4GB heap) and big PDFs can trip
 * `v8::ArrayBuffer::New` during JPEG encoding even when physical RAM is
 * plentiful. The library improvements bound accumulation; the flag bounds
 * V8's allocator behavior.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { PdfDecomposer } from '../dist/index'

interface PhaseResult {
  name: string
  passed: boolean
  duration: number
  details: string
  pageCount?: number
  imageCount?: number
  outputSize?: number
}

class DroneJobsReplicationTest {
  private results: PhaseResult[] = []
  private baseOutputDir: string
  private pdfPath: string
  private pdfFile = 'mivision.pdf'
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
    console.log('🚀 PDF decomposer initialized')
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

  private forceGC(): void {
    const globalWithGC = global as typeof globalThis & { gc?: () => void }
    globalWithGC.gc?.()
  }

  async run() {
    console.log('🧪 PDF-Decomposer — drone-jobs flow replication')
    console.log('================================================')
    console.log(`📊 Node.js version: ${process.version}`)
    console.log(`📄 Test PDF: ${basename(this.pdfPath)}`)
    console.log(`📁 PDF path: ${this.pdfPath}`)
    console.log(`📁 Output dir: ${this.baseOutputDir}`)

    const hasGC = typeof (global as typeof globalThis & { gc?: () => void }).gc === 'function'
    const oldSpace = process.execArgv.find(a => a.includes('max-old-space-size'))
    if (!hasGC || !oldSpace) {
      console.log('\n⚠️  Recommended Node flags not detected.')
      console.log('   Rerun with:')
      console.log('     node --max-old-space-size=8192 --expose-gc -r ts-node/register scripts/test-details.ts')
      console.log(`   Currently:  --expose-gc=${hasGC}, ${oldSpace ?? '--max-old-space-size=<default>'}\n`)
    } else {
      console.log(`   Flags OK:  --expose-gc, ${oldSpace}\n`)
    }

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
      this.logMemoryUsage('Start')
      await this.initializeDecomposer()
      this.logMemoryUsage('After PDF initialization')

      await this.phase1PerPageDataAndScreenshot()
      await this.phase2FullDecompose()

      this.printResults()
      process.exit(0)
    } catch (error) {
      console.error('❌ Test suite failed:', error)
      this.logMemoryUsage('Crash')
      process.exit(1)
    }
  }

  /**
   * Phase 1: per-page loop, mirrors drone-jobs `generateAndUploadScreenshots`.
   *
   * For each page p in 1..N:
   *   1. decomposer.data({ startPage: p, endPage: p, skipScreenshots: true })
   *      → captures pdfData (areas) for the page
   *   2. decomposer.screenshot({ startPage: p, endPage: p })
   *      → renders a JPEG to disk
   *
   * Production also forces GC between steps; we replicate that here so the
   * memory trajectory is comparable. Memory is logged every 5 pages.
   */
  private async phase1PerPageDataAndScreenshot() {
    const phaseName = 'Phase 1: per-page data() + screenshot() loop'
    const startTime = Date.now()

    try {
      console.log(`\n🔄 ${phaseName}`)
      const outputDir = join(this.baseOutputDir, 'phase1-per-page')
      mkdirSync(outputDir, { recursive: true })

      const totalPages = this.decomposer.numPages
      console.log(`📄 Looping over ${totalPages} pages (drone-jobs Step 6 equivalent)`)
      this.logMemoryUsage('Phase 1 start')

      let dataSuccess = 0
      let screenshotSuccess = 0
      let totalAreas = 0
      const pdfDataAggregate: any[] = []

      for (let page = 1; page <= totalPages; page++) {
        try {
          // Step 1: pdfData for this single page (skip rendering)
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
            pdfDataAggregate.push(dataResult.data[0])
            totalAreas += dataResult.data[0].areas?.length ?? 0
            dataSuccess++
          }

          this.forceGC()

          // Step 2: rendered JPEG screenshot for this page
          const screenshotResult = await this.decomposer.screenshot({
            startPage: page,
            endPage: page,
            imageWidth: 1024,
            imageQuality: 85,
            outputDir
          })

          if (screenshotResult.screenshots?.length > 0 && !screenshotResult.screenshots[0].error) {
            screenshotSuccess++
          }

          this.forceGC()
        } catch (pageError) {
          console.error(`   ❌ Page ${page} failed: ${(pageError as Error).message}`)
        }

        if (page % 5 === 0 || page === totalPages) {
          console.log(`   ✓ Processed ${page}/${totalPages}`)
          this.logMemoryUsage(`Page ${page}/${totalPages}`)
        }
      }

      const duration = Date.now() - startTime

      writeFileSync(
        join(outputDir, 'pdf-data-aggregate.json'),
        JSON.stringify(pdfDataAggregate, null, 2)
      )

      const files = readdirSync(outputDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'))
      const passed = dataSuccess === totalPages && screenshotSuccess === totalPages

      console.log(`📊 Phase 1 summary: data ${dataSuccess}/${totalPages}, screenshots ${screenshotSuccess}/${totalPages}, ${totalAreas} areas, ${files.length} files on disk`)

      this.results.push({
        name: phaseName,
        passed,
        duration,
        details: `data ${dataSuccess}/${totalPages}, screenshots ${screenshotSuccess}/${totalPages}, ${totalAreas} areas`,
        pageCount: totalPages,
        imageCount: files.length,
        outputSize: files.length
      })

      console.log(passed
        ? `✅ Phase 1 PASSED in ${duration}ms`
        : `❌ Phase 1 FAILED — data ${dataSuccess}/${totalPages}, screenshots ${screenshotSuccess}/${totalPages}`)

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

  /**
   * Phase 2: full-document decompose, mirrors drone-jobs
   * `decomposeAndProcessPages` exactly.
   */
  private async phase2FullDecompose() {
    const phaseName = 'Phase 2: full-document decompose()'
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
        imageCount: assetFiles.length,
        outputSize: assetFiles.length
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
    console.log('\n📊 drone-jobs flow replication — results')
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
      if (result.outputSize) console.log(`   Output files: ${result.outputSize}`)
      console.log('')
    })

    const resultsPath = join(this.baseOutputDir, 'results.json')
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

    if (passed !== total) {
      process.exit(1)
    }
  }
}

const customPdfPath = process.argv[2]
const test = new DroneJobsReplicationTest(customPdfPath)
test.run().catch(error => {
  console.error('❌ Test suite crashed:', error)
  process.exit(1)
})
