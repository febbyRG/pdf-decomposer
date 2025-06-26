import fs from 'fs'
import { PDFDocument as PdfLibDocument, PDFName, PDFRawStream } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PdfElement } from '../models/PdfElement.js'
import type { PdfPageContent } from '../models/PdfPageContent.js'
// Use 'any' for PDFPageProxy if type import fails
type PDFPageProxy = any

/**
 * Decompose a PDF file and extract all page content (text, images, annotations, etc.) into JSON format.
 * Optionally extract embedded images to assetPath.
 * @param filePath Path to the PDF file
 * @param options Optional: { assetPath?: string }
 * @returns Object with document metadata and array of PDFPageContent objects for each page
 * @throws Error if the file cannot be read or parsed
 */
export async function decomposePdf(filePath: string, options?: { assetPath?: string }): Promise<PdfPageContent[]> {
  let data: Uint8Array
  try {
    data = new Uint8Array(await fs.promises.readFile(filePath))
  } catch (err) {
    throw new Error(`Failed to read file: ${filePath}. ${(err as Error).message}`)
  }
  let pdf: any
  try {
    pdf = await pdfjs.getDocument({ data }).promise
  } catch (err) {
    throw new Error(`Failed to parse PDF: ${(err as Error).message}`)
  }
  const numPages = pdf.numPages
  const pages: PdfPageContent[] = []

  // Robust image extraction with pdf-lib: always use a fresh buffer
  let imageMap: Record<string, string> = {}
  if (options?.assetPath) {
    try {
      const freshData = new Uint8Array(await fs.promises.readFile(filePath))
      imageMap = await extractImagesWithPdfLib(freshData, options.assetPath)
    } catch (err) {
      console.warn('[pdf-lib] Failed to extract images:', (err as Error).message)
      imageMap = {}
    }
  }

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i)
    const [elements, annotations] = await Promise.all([
      extractElements(page, imageMap),
      page.getAnnotations()
    ])
    pages.push({
      pageNumber: i,
      elements,
      annotations
    })
  }
  return pages
}

/**
 * Extracts all embedded images from a PDF using pdf-lib and writes them to assetPath.
 * Returns a map of image object number to file path.
 */
async function extractImagesWithPdfLib(data: Uint8Array, assetPath: string): Promise<Record<string, string>> {
  // Debug: log PDF buffer info before parsing
  console.log('[pdf-lib debug] Buffer length:', data.length)
  console.log('[pdf-lib debug] First 32 bytes:', Array.from(data.slice(0, 32)))
  console.log('[pdf-lib debug] First 32 chars:', Buffer.from(data.slice(0, 32)).toString('utf8'))
  try {
    const pdfDoc = await PdfLibDocument.load(data)
    const fsPromises = fs.promises
    await fsPromises.mkdir(assetPath, { recursive: true })
    let imageMap: Record<string, string> = {}
    let imageCount = 0
    for (const [ref, obj] of pdfDoc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFRawStream) {
        const subtypeObj = obj.dict.get(PDFName.of('Subtype'))
        const subtype = (subtypeObj && 'value' in subtypeObj) ? subtypeObj.value : undefined
        if (subtype === 'Image') {
          const imgBytes = obj.getContents()
          const ext = getImageExtension(obj.dict)
          const imgPath = `${assetPath}/img_${String(ref.objectNumber)}.${ext}`
          await fsPromises.writeFile(imgPath, imgBytes)
          imageMap[String(ref.objectNumber)] = imgPath
          imageCount++
          console.log(`[pdf-lib] Wrote image: ${imgPath} (${imgBytes.length} bytes)`)
        }
      }
    }
    if (imageCount === 0) {
      console.log('[pdf-lib] No images found in PDF.')
    }
    return imageMap
  } catch (err) {
    console.error('[pdf-lib debug] Error stack:', (err as Error).stack)
    throw err
  }
}

function getImageExtension(dict: any): string {
  const filter = dict.get('Filter')?.name || ''
  if (filter === 'DCTDecode') return 'jpg'
  if (filter === 'JPXDecode') return 'jp2'
  if (filter === 'FlateDecode') return 'png' // heuristic
  return 'bin'
}

/**
 * Extracts all elements (text and images) from a PDF page.
 * @param page PDFPageProxy
 * @returns Array of PdfElement objects
 */
export async function extractElements(page: PDFPageProxy, imageMap?: Record<string, string>): Promise<PdfElement[]> {
  // Extract text
  const content = await page.getTextContent()
  const textItems: PdfElement[] = content.items.map((item: any) => {
    if ('str' in item) {
      // TextItem
      const { str, fontName, transform, width, height, dir, hasEOL, ...rest } = item as any
      return {
        type: 'text',
        str,
        fontName,
        transform,
        width,
        height,
        dir,
        hasEOL,
        ...rest
      }
    } else {
      // TextMarkedContent
      const { type, ...rest } = item as any
      return {
        type: 'text-marked',
        ...rest
      }
    }
  })

  // Extract images (with more details if possible)
  const opList = await page.getOperatorList()
  const images: PdfElement[] = []
  for (let i = 0; i < opList.fnArray.length; i++) {
    if (opList.fnArray[i] === 92) { // paintImageXObject
      const args = opList.argsArray[i]
      let assetFile: string | undefined
      if (imageMap && args && args[0] && typeof args[0].objectNumber === 'number') {
        assetFile = imageMap[String(args[0].objectNumber)]
      }
      images.push({
        type: 'image',
        imageIndex: i,
        args,
        assetFile,
        // Note: Actual image data extraction requires custom canvas rendering
        // and is not directly available from PDF.js API in Node.js
      })
    }
  }

  // Extract vector paths (with more details)
  const paths: PdfElement[] = []
  for (let i = 0; i < opList.fnArray.length; i++) {
    if (
      opList.fnArray[i] === 84 || // constructPath
      opList.fnArray[i] === 85    // endPath
    ) {
      paths.push({
        type: 'path',
        pathOps: opList.argsArray[i],
        opIndex: i,
        op: opList.fnArray[i]
      })
    }
  }

  // Extract annotations (with more details)
  const annotationsRaw = await page.getAnnotations()
  const annotations: PdfElement[] = annotationsRaw.map((a: any) => ({
    type: 'annotation',
    annotationSubtype: a.subtype,
    annotationData: a,
    rect: a.rect,
    color: a.color,
    contents: a.contents,
    title: a.title,
    modificationDate: a.modificationDate
  }))

  return [...textItems, ...images, ...paths, ...annotations]
}
