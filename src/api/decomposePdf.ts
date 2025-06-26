import fs from 'fs'
import { Package, PdfDecomposer } from '../core/PdfDecomposer.js'
import { PdfDecomposerPage } from '../core/PdfDecomposerPage.js'
import { PdfDocument } from '../core/PdfDocument.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'


/**
 * Decompose a PDF file and extract all page content (text, images, annotations, etc.) into JSON format.
 * Optionally extract embedded images to assetPath.
 * @param filePath Path to the PDF file
 * @param options Optional: { assetPath?: string }
 * @returns Array of PDFPageContent objects for each page
 * @throws Error if the file cannot be read or parsed
 */
export async function decomposePdf(filePath: string, options?: { assetPath?: string }): Promise<PdfPageContent[]> {

  const pdfDoc = await loadPdfDocument(filePath)

  // Prepare output package
  const outDir = options?.assetPath || filePath
  const pkg: Package = { pkgDir: new LocalPackageDir(outDir), pages: [] };

  // Attach the real PdfDecomposerPage to global for compatibility
  (globalThis as any).PdfDecomposerPage = PdfDecomposerPage

  const composer = new PdfDecomposer(pdfDoc, pkg)
  composer.subscribe((state) => {
    console.log(`[${state.progress}%] ${state.message}`)
  })
  composer.decomposeError.push((err: any) => {
    console.error('Import error:', err)
  })
  await composer.decompose()

  return composer.pkg.pages

  // let data: Uint8Array
  // try {
  //   data = new Uint8Array(await fs.promises.readFile(filePath))
  // } catch (err) {
  //   throw new Error(`Failed to read file: ${filePath}. ${(err as Error).message}`)
  // }

  // // Dynamically import pdfjs-dist and get the correct getDocument function
  // let pdfjsLib: any
  // let getDocument: any
  // try {
  //   pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js')
  //   getDocument = pdfjsLib.default?.getDocument || pdfjsLib.getDocument
  //   if (!getDocument) throw new Error('getDocument not found in pdfjs-dist')
  // } catch (err) {
  //   throw new Error(`Failed to load pdfjs-dist: ${(err as Error).message}`)
  // }

  // // Load PDF.js document proxy
  // let pdfProxy: any
  // try {
  //   const loadingTask = getDocument({ data })
  //   pdfProxy = await loadingTask.promise
  // } catch (err) {
  //   throw new Error(`Failed to parse PDF: ${(err as Error).message}`)
  // }

  // // Create and process PdfDocument
  // const pdfDoc = new PdfDocument(pdfProxy)
  // await pdfDoc.process()

  // const numPages = pdfDoc.numPages
  // const pages: PdfPageContent[] = []

  // // Prepare asset path for images if needed
  // let assetPath: string | undefined = options?.assetPath
  // if (assetPath) {
  //   await fs.promises.mkdir(assetPath, { recursive: true })
  // }

  // for (let i = 0; i < numPages; i++) {
  //   const page: PdfPage = pdfDoc.getPage(i + 1)
  //   // Extract text and images
  //   const [rawTextElements, imageElementsRaw, annotations] = await Promise.all([
  //     page.extractText(),
  //     page.extractImages(),
  //     page.getAnnotations()
  //   ])

  //   // Map text elements to PdfElement with type: 'text'
  //   const textElements: PdfElement[] = rawTextElements.map((el: any) => ({ ...el, type: 'text' }))

  //   // Save images to disk if assetPath is provided, and add assetFile property
  //   let imageElements: PdfElement[] = []
  //   if (assetPath && imageElementsRaw.length > 0) {
  //     imageElements = await Promise.all(imageElementsRaw.map(async (img: any) => {
  //       const fileName = `${img.objectId || `img_${i + 1}`}.png`
  //       const imgPath = path.join(assetPath!, fileName)
  //       await fs.promises.writeFile(imgPath, img.data)
  //       return { ...img, type: 'image', assetFile: imgPath }
  //     }))
  //   } else {
  //     imageElements = imageElementsRaw.map((img: any) => ({ ...img, type: 'image' }))
  //   }

  //   // Compose all elements for this page
  //   const elements: PdfElement[] = [
  //     ...textElements,
  //     ...imageElements
  //   ]

  //   pages.push({
  //     pageNumber: i + 1,
  //     elements,
  //     annotations
  //   })
  // }
  // return pages
}

class LocalPackageDir {
  dir: string
  constructor(dir: string) { this.dir = dir }
  async create() { if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true }) }
}

async function loadPdfDocument(filePath: string): Promise<PdfDocument> {
  // @ts-ignore
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js')
  const { getDocument } = pdfjsLib.default || pdfjsLib
  const data = new Uint8Array(fs.readFileSync(filePath))
  const loadingTask = getDocument({ data })
  const doc = await loadingTask.promise
  // Use the custom PdfDocument class, which will create PdfPage instances
  const customDoc = new PdfDocument(doc as any)
  await customDoc.process()
  return customDoc
}

