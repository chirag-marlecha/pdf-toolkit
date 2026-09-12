import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Annotation, CompressLevel, PageRef, PdfSource, Workspace } from './types'
import { uid } from './types'
import { getSourcePageCount, renderPageToCanvas } from './pdfjs'

export async function createSourceFromFile(file: File): Promise<PdfSource> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return { id: uid(), name: file.name, bytes }
}

export async function pagesForSource(source: PdfSource): Promise<PageRef[]> {
  const count = await getSourcePageCount(source.id, source.bytes)
  return Array.from({ length: count }, (_, i) => ({
    id: uid(),
    kind: 'pdf',
    sourceId: source.id,
    pageIndex: i,
    rotation: 0,
    annotations: [],
  }))
}

export async function imageFileToPageRef(file: File): Promise<PageRef> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const dims = await getImageDimensions(file)
  return {
    id: uid(),
    kind: 'image',
    imageBytes: bytes,
    mime,
    width: dims.width,
    height: dims.height,
    rotation: 0,
    annotations: [],
  }
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

/** displayed (post-rotation) width/height for a native page size + rotation delta */
function displayedSize(nativeW: number, nativeH: number, rotation: number) {
  return rotation % 180 === 0 ? { w: nativeW, h: nativeH } : { w: nativeH, h: nativeW }
}

/** Maps a fractional point in *displayed* (rotated) space to native pdf-lib point space (origin bottom-left). */
function mapPointToNative(xPct: number, yPct: number, nativeW: number, nativeH: number, rotation: number) {
  const { w: dispW, h: dispH } = displayedSize(nativeW, nativeH, rotation)
  const Xd = xPct * dispW
  const Yd = yPct * dispH
  let X: number, Y: number // native top-down coords
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      X = Yd
      Y = nativeH - Xd
      break
    case 180:
      X = nativeW - Xd
      Y = nativeH - Yd
      break
    case 270:
      X = nativeW - Yd
      Y = Xd
      break
    default:
      X = Xd
      Y = Yd
  }
  return { x: X, y: nativeH - Y }
}

async function drawAnnotations(outDoc: PDFDocument, page: PDFPage, annotations: Annotation[], font: PDFFont, rotation: number) {
  const { width: nativeW, height: nativeH } = page.getSize()
  for (const ann of annotations) {
    if (ann.type === 'text') {
      const { h: dispH } = displayedSize(nativeW, nativeH, rotation)
      const size = Math.max(4, ann.sizePct * dispH)
      const anchor = mapPointToNative(ann.xPct, ann.yPct, nativeW, nativeH, rotation)
      const color = hexToRgb(ann.color)
      page.drawText(ann.text, {
        x: anchor.x,
        y: anchor.y - size, // treat anchor as top of text box
        size,
        font,
        color: rgb(color.r, color.g, color.b),
        rotate: degrees(rotation),
      })
    } else if (ann.type === 'ink') {
      const { w: dispW } = displayedSize(nativeW, nativeH, rotation)
      const thickness = Math.max(0.5, ann.widthPct * dispW)
      const color = hexToRgb(ann.color)
      for (const stroke of ann.strokes) {
        for (let i = 1; i < stroke.length; i++) {
          const a = mapPointToNative(stroke[i - 1].x, stroke[i - 1].y, nativeW, nativeH, rotation)
          const b = mapPointToNative(stroke[i].x, stroke[i].y, nativeW, nativeH, rotation)
          page.drawLine({ start: a, end: b, thickness, color: rgb(color.r, color.g, color.b) })
        }
      }
    } else if (ann.type === 'image') {
      const img = ann.mime === 'image/png' ? await outDoc.embedPng(ann.bytes) : await outDoc.embedJpg(ann.bytes)
      const { w: dispW, h: dispH } = displayedSize(nativeW, nativeH, rotation)
      const w = ann.wPct * dispW
      const h = ann.hPct * dispH
      // anchor is the top-left of the image box in displayed space; find its native mapping,
      // then the "bottom-left for drawImage" also depends on rotation.
      const topLeft = mapPointToNative(ann.xPct, ann.yPct, nativeW, nativeH, rotation)
      const bottomLeftForRotation = ((rotation % 360) + 360) % 360
      let drawX = topLeft.x
      let drawY = topLeft.y - h
      if (bottomLeftForRotation === 90) {
        drawX = topLeft.x
        drawY = topLeft.y - w
      } else if (bottomLeftForRotation === 270) {
        drawX = topLeft.x - h
        drawY = topLeft.y
      } else if (bottomLeftForRotation === 180) {
        drawX = topLeft.x - w
        drawY = topLeft.y
      }
      page.drawImage(img, { x: drawX, y: drawY, width: w, height: h, rotate: degrees(rotation) })
    }
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16)
  return { r: ((bigint >> 16) & 255) / 255, g: ((bigint >> 8) & 255) / 255, b: (bigint & 255) / 255 }
}

export async function buildExportDoc(ws: Workspace, pageIds?: string[]): Promise<PDFDocument> {
  const pagesToExport = pageIds ? ws.pages.filter((p) => pageIds.includes(p.id)) : ws.pages
  const outDoc = await PDFDocument.create()
  const srcDocCache = new Map<string, PDFDocument>()
  const font = await outDoc.embedFont(StandardFonts.Helvetica)

  for (const pageRef of pagesToExport) {
    let newPage: PDFPage

    if (pageRef.kind === 'pdf') {
      let srcDoc = srcDocCache.get(pageRef.sourceId)
      if (!srcDoc) {
        srcDoc = await PDFDocument.load(ws.sources[pageRef.sourceId].bytes, { ignoreEncryption: true })
        srcDocCache.set(pageRef.sourceId, srcDoc)
      }
      const [copied] = await outDoc.copyPages(srcDoc, [pageRef.pageIndex])
      outDoc.addPage(copied)
      newPage = copied
    } else {
      const img = pageRef.mime === 'image/png' ? await outDoc.embedPng(pageRef.imageBytes) : await outDoc.embedJpg(pageRef.imageBytes)
      newPage = outDoc.addPage([pageRef.width, pageRef.height])
      newPage.drawImage(img, { x: 0, y: 0, width: pageRef.width, height: pageRef.height })
    }

    if (pageRef.rotation) {
      const current = newPage.getRotation().angle
      newPage.setRotation(degrees(((current + pageRef.rotation) % 360 + 360) % 360))
    }

    if (pageRef.annotations.length) {
      // Annotation coordinates were captured against the page as the user saw it — i.e. the page's
      // own inherent rotation plus our delta — so use the page's final combined rotation here,
      // not just the delta, or annotations on already-rotated (e.g. scanned) PDFs land wrong.
      await drawAnnotations(outDoc, newPage, pageRef.annotations, font, newPage.getRotation().angle)
    }
  }

  return outDoc
}

export async function exportWorkspace(ws: Workspace, pageIds?: string[]): Promise<Uint8Array> {
  const doc = await buildExportDoc(ws, pageIds)
  return doc.save()
}

const COMPRESS_SETTINGS: Record<CompressLevel, { scale: number; quality: number }> = {
  low: { scale: 2.0, quality: 0.82 },
  medium: { scale: 1.4, quality: 0.65 },
  high: { scale: 1.0, quality: 0.45 },
}

/** Rasterizes every page (after rotation + annotations are baked in) and rebuilds a JPEG-backed PDF for a much smaller file. */
export async function compressWorkspace(ws: Workspace, level: CompressLevel, pageIds?: string[]): Promise<Uint8Array> {
  const built = await buildExportDoc(ws, pageIds)
  const builtBytes = await built.save()
  const { scale, quality } = COMPRESS_SETTINGS[level]
  const outDoc = await PDFDocument.create()
  const tmpSourceId = `compress-${uid()}`

  const pageCount = await getSourcePageCount(tmpSourceId, builtBytes)
  for (let i = 0; i < pageCount; i++) {
    const canvas = await renderPageToCanvas(tmpSourceId, builtBytes, i, scale)
    const jpegUrl = canvas.toDataURL('image/jpeg', quality)
    const jpegBytes = dataUrlToBytes(jpegUrl)
    const img = await outDoc.embedJpg(jpegBytes)
    const page = outDoc.addPage([canvas.width / scale, canvas.height / scale])
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
  }

  return outDoc.save()
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export interface ExportedImage {
  name: string
  bytes: Uint8Array
  mime: string
}

export async function pagesToImages(
  ws: Workspace,
  pageIds: string[] | undefined,
  format: 'png' | 'jpeg',
  scale: number,
): Promise<ExportedImage[]> {
  const pages = pageIds ? ws.pages.filter((p) => pageIds.includes(p.id)) : ws.pages
  const results: ExportedImage[] = []
  let n = 1
  for (const pageRef of pages) {
    let canvas: HTMLCanvasElement
    if (pageRef.kind === 'pdf') {
      const source = ws.sources[pageRef.sourceId]
      canvas = await renderPageToCanvas(pageRef.sourceId, source.bytes, pageRef.pageIndex, scale, pageRef.rotation)
    } else {
      canvas = document.createElement('canvas')
      canvas.width = pageRef.width * scale
      canvas.height = pageRef.height * scale
      const ctx = canvas.getContext('2d')!
      const bitmap = await createImageBitmap(new Blob([pageRef.imageBytes as BlobPart]))
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    }
    const mime = format === 'png' ? 'image/png' : 'image/jpeg'
    const url = canvas.toDataURL(mime, format === 'jpeg' ? 0.9 : undefined)
    results.push({ name: `page-${String(n).padStart(2, '0')}.${format === 'png' ? 'png' : 'jpg'}`, bytes: dataUrlToBytes(url), mime })
    n++
  }
  return results
}

export async function imagesToPdfBytes(files: { bytes: Uint8Array; mime: string; width: number; height: number }[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const f of files) {
    const img = f.mime === 'image/png' ? await doc.embedPng(f.bytes) : await doc.embedJpg(f.bytes)
    const page = doc.addPage([f.width, f.height])
    page.drawImage(img, { x: 0, y: 0, width: f.width, height: f.height })
  }
  return doc.save()
}

export type FormFieldKind = 'text' | 'checkbox' | 'dropdown' | 'radio' | 'unsupported'

export interface FormFieldInfo {
  name: string
  kind: FormFieldKind
  value: string
  options?: string[]
}

export async function listFormFields(bytes: Uint8Array): Promise<FormFieldInfo[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const form = doc.getForm()
  const fields = form.getFields()
  const out: FormFieldInfo[] = []
  for (const field of fields) {
    const name = field.constructor.name
    if (name === 'PDFTextField') {
      const f = field as import('pdf-lib').PDFTextField
      out.push({ name: f.getName(), kind: 'text', value: f.getText() ?? '' })
    } else if (name === 'PDFCheckBox') {
      const f = field as import('pdf-lib').PDFCheckBox
      out.push({ name: f.getName(), kind: 'checkbox', value: f.isChecked() ? 'true' : 'false' })
    } else if (name === 'PDFDropdown') {
      const f = field as import('pdf-lib').PDFDropdown
      out.push({ name: f.getName(), kind: 'dropdown', value: f.getSelected()?.[0] ?? '', options: f.getOptions() })
    } else if (name === 'PDFRadioGroup') {
      const f = field as import('pdf-lib').PDFRadioGroup
      out.push({ name: f.getName(), kind: 'radio', value: f.getSelected() ?? '', options: f.getOptions() })
    } else {
      out.push({ name: field.getName(), kind: 'unsupported', value: '' })
    }
  }
  return out
}

export async function fillForm(bytes: Uint8Array, values: Record<string, string>, flatten: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const form = doc.getForm()
  for (const field of form.getFields()) {
    const name = field.constructor.name
    const value = values[field.getName()]
    if (value === undefined) continue
    if (name === 'PDFTextField') {
      ;(field as import('pdf-lib').PDFTextField).setText(value)
    } else if (name === 'PDFCheckBox') {
      const cb = field as import('pdf-lib').PDFCheckBox
      if (value === 'true') cb.check()
      else cb.uncheck()
    } else if (name === 'PDFDropdown') {
      ;(field as import('pdf-lib').PDFDropdown).select(value)
    } else if (name === 'PDFRadioGroup') {
      ;(field as import('pdf-lib').PDFRadioGroup).select(value)
    }
  }
  if (flatten) form.flatten()
  return doc.save()
}
