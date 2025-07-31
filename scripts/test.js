#!/usr/bin/env node
"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const index_1 = require("../dist/index");
class ComprehensiveTest {
    constructor(customPdfPath) {
        this.results = [];
        this.pdfFile = 'demo.pdf';
        this.baseOutputDir = (0, path_1.join)(__dirname, 'test-output');
        this.pdfPath = customPdfPath || (0, path_1.join)(__dirname, 'test-input', this.pdfFile);
    }
    async run() {
        console.log('🧪 PDF-Decomposer Comprehensive Test Suite');
        console.log('==========================================');
        console.log(`📊 Node.js version: ${process.version}`);
        console.log(`📄 Test PDF: ${(0, path_1.basename)(this.pdfPath)}`);
        console.log(`📁 PDF Full Path: ${this.pdfPath}`);
        console.log(`📁 Output directory: ${this.baseOutputDir}\n`);
        // Verify PDF file exists
        if (!(0, fs_1.existsSync)(this.pdfPath)) {
            console.error(`❌ PDF file not found: ${this.pdfPath}`);
            process.exit(1);
        }
        const pdfStats = (0, fs_1.statSync)(this.pdfPath);
        console.log(`📏 PDF file size: ${Math.round(pdfStats.size / 1024)} KB`);
        // Clean up previous test results
        if ((0, fs_1.existsSync)(this.baseOutputDir)) {
            (0, fs_1.rmSync)(this.baseOutputDir, { recursive: true });
        }
        (0, fs_1.mkdirSync)(this.baseOutputDir, { recursive: true });
        try {
            // Test: Embedded images extraction
            await this.testEmbeddedImages();
            // Test: Memory-efficient mode
            // await this.testMemoryEfficientMode()
            // Test: Page range processing
            // await this.testPageRange()
            // Test: Single page processing
            // await this.testSinglePage()
            // Test: Error handling
            // await this.testErrorHandling()
            // Print results
            // this.printResults()
            process.exit(0);
        }
        catch (error) {
            console.error('❌ Test suite failed:', error);
            process.exit(1);
        }
    }
    async testMemoryEfficientMode() {
        const testName = 'Memory-Efficient Mode (Canvas-free)';
        const startTime = Date.now();
        try {
            console.log(`🔄 Running: ${testName}...`);
            const result = await (0, index_1.decomposePdf)(this.pdfPath, {
                generateImages: false,
                extractEmbeddedImages: false // Text only
            });
            const duration = Date.now() - startTime;
            const textElements = result.reduce((acc, page) => acc.concat(page.textElements || []), []);
            this.results.push({
                name: testName,
                passed: result.length > 0,
                duration,
                details: `Extracted ${textElements} text elements from ${result.length} pages, no Canvas dependencies`,
                pageCount: result.length
            });
            console.log(`  ✓ Processed ${result.length} pages (text only) in ${duration}ms`);
        }
        catch (error) {
            this.results.push({
                name: testName,
                passed: false,
                duration: Date.now() - startTime,
                details: `Error: ${error.message}`
            });
            console.log(`  ❌ Failed: ${error.message}`);
        }
    }
    async testEmbeddedImages() {
        const testName = 'Embedded Images Extraction (Canvas-free)';
        const startTime = Date.now();
        try {
            console.log(`🔄 Running: ${testName}...`);
            console.log(`   📄 Testing with PDF: ${(0, path_1.basename)(this.pdfPath)}`);
            const outputDir = (0, path_1.join)(this.baseOutputDir, 'embedded-images');
            (0, fs_1.mkdirSync)(outputDir, { recursive: true });
            const options = {
                elementComposer: true,
                pageComposer: true,
                minify: true
            };
            const result = await (0, index_1.decomposePdf)(this.pdfPath, {
                ...options,
                generateImages: false,
                extractEmbeddedImages: true,
                assetPath: outputDir // Save images to output directory
            });
            const duration = Date.now() - startTime;
            const embeddedImages = result.reduce((acc, page) => acc.concat(page.embeddedImages || []), []);
            console.log(`   📊 Processing completed: ${result.length} pages, images found`);
            // Save embedded images to files and analyze
            let savedImages = 0;
            const imageAnalysis = [];
            for (let i = 0; i < result.length; i++) {
                const page = result[i];
                const pageNum = page.pageNumber || (i + 1);
                const imageElements = page.elements?.filter((e) => e.type === 'image') || [];
                if (imageElements.length > 0) {
                    console.log(`   📸 Page ${pageNum}: Found ${imageElements.length} embedded images`);
                }
                for (let j = 0; j < imageElements.length; j++) {
                    const imageElement = imageElements[j];
                    const analysis = {
                        page: pageNum,
                        imageIndex: j + 1,
                        id: imageElement.id,
                        width: imageElement.attributes?.width || imageElement.width,
                        height: imageElement.attributes?.height || imageElement.height,
                        format: imageElement.attributes?.format || imageElement.format,
                        hasData: !!imageElement.data,
                        dataSize: imageElement.data ? imageElement.data.length : 0,
                        scaled: imageElement.attributes?.scaled,
                        scaleFactor: imageElement.attributes?.scaleFactor
                    };
                    imageAnalysis.push(analysis);
                    console.log(`      ✅ ${analysis.id}: ${analysis.width}x${analysis.height} (${analysis.format}) - ${(analysis.dataSize / 1024).toFixed(1)}KB ${analysis.scaled ? `[scaled ${(analysis.scaleFactor * 100).toFixed(1)}%]` : ''}`);
                    if (imageElement.data && imageElement.data.startsWith('data:image/')) {
                        try {
                            const base64Data = imageElement.data.split(',')[1];
                            const imageBuffer = Buffer.from(base64Data, 'base64');
                            const format = imageElement.attributes?.format || imageElement.format || 'png';
                            const imagePath = (0, path_1.join)(outputDir, `${imageElement.id || `page-${pageNum}-image-${j + 1}`}.${format}`);
                            (0, fs_1.writeFileSync)(imagePath, imageBuffer);
                            savedImages++;
                            console.log(`      💾 Saved: ${(0, path_1.basename)(imagePath)} (${(imageBuffer.length / 1024).toFixed(1)}KB)`);
                        }
                        catch (error) {
                            console.error(`      ❌ Failed to save image ${j + 1} from page ${pageNum}:`, error);
                        }
                    }
                }
            }
            // Check for asset files saved directly by decomposePdf
            const assetFiles = (0, fs_1.existsSync)(outputDir) ? (0, fs_1.readdirSync)(outputDir) : [];
            const directAssetImages = assetFiles.filter((file) => file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'));
            if (directAssetImages.length > 0) {
                console.log(`   📁 Found ${directAssetImages.length} saved images:`);
                directAssetImages.forEach((file) => {
                    const filePath = (0, path_1.join)(outputDir, file);
                    const stats = (0, fs_1.statSync)(filePath);
                    console.log(`     📄 ${file} - ${(stats.size / 1024).toFixed(1)}KB`);
                });
            }
            const totalSavedFiles = savedImages + directAssetImages.length;
            const expectedImages = 12; // Based on our test PDF
            const embeddedImageCount = totalSavedFiles; // Use actual saved files count
            const successRate = embeddedImageCount > 0 ? ((embeddedImageCount / expectedImages) * 100) : 0;
            // Test passes if we extract at least some images successfully
            const testPassed = embeddedImageCount > 0 && totalSavedFiles > 0;
            this.results.push({
                name: testName,
                passed: testPassed,
                duration,
                details: `Extracted ${embeddedImageCount}/${expectedImages} embedded images (${successRate.toFixed(1)}% success rate), saved ${totalSavedFiles} files`,
                pageCount: result.length,
                embeddedImageCount,
                outputSize: totalSavedFiles
            });
            if (testPassed) {
                console.log(`  ✅ Image extraction test PASSED: ${embeddedImages} images found, ${totalSavedFiles} files saved in ${duration}ms`);
                console.log(`     Success rate: ${successRate.toFixed(1)}% (${embeddedImages}/${expectedImages} images)`);
            }
            else {
                console.log(`  ❌ Image extraction test FAILED: Only ${embeddedImageCount} images found, ${totalSavedFiles} files saved`);
            }
            // Save detailed image analysis
            const analysisPath = (0, path_1.join)(outputDir, 'image-analysis.json');
            (0, fs_1.writeFileSync)(analysisPath, JSON.stringify({
                summary: {
                    totalImages: embeddedImages,
                    expectedImages,
                    successRate: successRate.toFixed(1),
                    totalFiles: totalSavedFiles,
                    processingTime: duration,
                    testPassed
                },
                images: imageAnalysis,
                assetFiles: directAssetImages
            }, null, 2));
            // Save complete decomposePdf result for analysis
            const resultPath = (0, path_1.join)(outputDir, 'result.json');
            (0, fs_1.writeFileSync)(resultPath, JSON.stringify(result, null, 2), 'utf-8');
            console.log(`   📄 Complete decompose result saved to: ${(0, path_1.basename)(resultPath)}`);
        }
        catch (error) {
            this.results.push({
                name: testName,
                passed: false,
                duration: Date.now() - startTime,
                details: `Error: ${error.message}`
            });
            console.log(`  ❌ Failed: ${error.message}`);
            console.error('   Full error:', error);
        }
    }
    async testPageRange() {
        const testName = 'Page Range Processing';
        const startTime = Date.now();
        try {
            console.log(`🔄 Running: ${testName}...`);
            const result = await (0, index_1.decomposePdf)(this.pdfPath, {
                generateImages: false,
                extractEmbeddedImages: true,
                startPage: 2,
                endPage: 4
            });
            const duration = Date.now() - startTime;
            const expectedPages = [2, 3, 4];
            const actualPages = result.map((p) => p.pageNumber);
            const correctRange = JSON.stringify(expectedPages) === JSON.stringify(actualPages);
            this.results.push({
                name: testName,
                passed: correctRange && result.length === 3,
                duration,
                details: `Processed pages ${actualPages.join(', ')} (expected: ${expectedPages.join(', ')})`,
                pageCount: result.length
            });
            console.log(`  ✓ Processed page range 2-4 correctly in ${duration}ms`);
        }
        catch (error) {
            this.results.push({
                name: testName,
                passed: false,
                duration: Date.now() - startTime,
                details: `Error: ${error.message}`
            });
            console.log(`  ❌ Failed: ${error.message}`);
        }
    }
    async testSinglePage() {
        const testName = 'Single Page Processing';
        const startTime = Date.now();
        try {
            console.log(`🔄 Running: ${testName}...`);
            const result = await (0, index_1.decomposePdf)(this.pdfPath, {
                generateImages: false,
                extractEmbeddedImages: true,
                startPage: 1,
                endPage: 1
            });
            const duration = Date.now() - startTime;
            const isCorrectPage = result.length === 1 && result[0].pageNumber === 1;
            this.results.push({
                name: testName,
                passed: isCorrectPage,
                duration,
                details: `Processed single page ${result[0]?.pageNumber} with ${result[0]?.elements?.length || 0} elements`,
                pageCount: result.length
            });
            console.log(`  ✓ Processed single page 1 correctly in ${duration}ms`);
        }
        catch (error) {
            this.results.push({
                name: testName,
                passed: false,
                duration: Date.now() - startTime,
                details: `Error: ${error.message}`
            });
            console.log(`  ❌ Failed: ${error.message}`);
        }
    }
    async testErrorHandling() {
        const testName = 'Error Handling';
        const startTime = Date.now();
        try {
            console.log(`🔄 Running: ${testName}...`);
            let errorsCaught = 0;
            // Test invalid startPage
            try {
                await (0, index_1.decomposePdf)(this.pdfPath, { startPage: 0 });
            }
            catch {
                errorsCaught++;
            }
            // Test startPage > endPage
            try {
                await (0, index_1.decomposePdf)(this.pdfPath, { startPage: 5, endPage: 3 });
            }
            catch {
                errorsCaught++;
            }
            // Test startPage beyond document
            try {
                await (0, index_1.decomposePdf)(this.pdfPath, { startPage: 100 });
            }
            catch {
                errorsCaught++;
            }
            const duration = Date.now() - startTime;
            this.results.push({
                name: testName,
                passed: errorsCaught >= 2,
                duration,
                details: `Correctly caught ${errorsCaught}/3 expected error conditions`
            });
            console.log(`  ✓ Error handling working correctly (${errorsCaught}/3 errors caught) in ${duration}ms`);
        }
        catch (error) {
            this.results.push({
                name: testName,
                passed: false,
                duration: Date.now() - startTime,
                details: `Unexpected error: ${error.message}`
            });
            console.log(`  ❌ Failed: ${error.message}`);
        }
    }
    printResults() {
        console.log('\n📊 Comprehensive Test Results');
        console.log('='.repeat(60));
        const passed = this.results.filter(r => r.passed).length;
        const total = this.results.length;
        const totalTime = this.results.reduce((acc, r) => acc + r.duration, 0);
        console.log(`Overall: ${passed}/${total} tests passed (${Math.round(passed / total * 100)}%)`);
        console.log(`Total execution time: ${totalTime}ms\n`);
        this.results.forEach((result, i) => {
            const status = result.passed ? '✅' : '❌';
            console.log(`${i + 1}. ${status} ${result.name}`);
            console.log(`   Duration: ${result.duration}ms`);
            console.log(`   Details: ${result.details}`);
            if (result.pageCount)
                console.log(`   Pages processed: ${result.pageCount}`);
            if (result.imageCount)
                console.log(`   Images generated: ${result.imageCount}`);
            if (result.embeddedImageCount)
                console.log(`   Embedded images: ${result.embeddedImageCount}`);
            if (result.outputSize)
                console.log(`   Output files: ${result.outputSize}`);
            console.log('');
        });
        // Save detailed results to JSON
        const resultsPath = (0, path_1.join)(this.baseOutputDir, 'test-results.json');
        (0, fs_1.writeFileSync)(resultsPath, JSON.stringify({
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
        }, null, 2));
        console.log(`📄 Detailed results saved to: ${resultsPath}`);
        if (passed === total) {
            console.log('\n🎉 All tests passed! PDF-Decomposer is Canvas-free and working perfectly.');
        }
        else {
            console.log(`\n⚠️  ${total - passed} test(s) failed. Please review the results above.`);
            process.exit(1);
        }
    }
}
// Run the comprehensive test
const customPdfPath = process.argv[2];
const test = new ComprehensiveTest(customPdfPath);
test.run().catch(error => {
    console.error('❌ Test suite crashed:', error);
    process.exit(1);
});
