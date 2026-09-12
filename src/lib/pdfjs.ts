import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

export type PdfjsDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>
type LoadingTask = ReturnType<typeof pdfjsLib.getDocument>

// Each parsed document owns a dedicated Worker. Left uncapped, a long session (opening several
// files, compressing, exporting — each of which parses bytes via a throwaway sourceId) accumulates
// workers without bound, which is especially costly on memory-constrained phones. Cap concurrent
// parses and evict the least-recently-used one when a new source needs a slot.
const MAX_CACHED_DOCS = 4
const taskCache = new Map<string, LoadingTask>()

function touch(sourceId: string, task: LoadingTask) {
  taskCache.delete(sourceId)
  taskCache.set(sourceId, task)
  while (taskCache.size > MAX_CACHED_DOCS) {
    const oldestKey = taskCache.keys().next().value
    if (oldestKey === undefined || oldestKey === sourceId) break
    taskCache.get(oldestKey)?.destroy()
    taskCache.delete(oldestKey)
  }
}

/** Parses (or returns the cached parse of) a source PDF for rendering. Keyed by source id. */
export function getPdfjsDoc(sourceId: string, bytes: Uint8Array): Promise<PdfjsDoc> {
  const existing = taskCache.get(sourceId)
  if (existing) {
    touch(sourceId, existing)
    return existing.promise
  }
  // pdf.js detaches/transfers the buffer it's given, so hand it a copy.
  const copy = bytes.slice()
  const task = pdfjsLib.getDocument({ data: copy })
  touch(sourceId, task)
  return task.promise
}

export function dropPdfjsDoc(sourceId: string) {
  taskCache.get(sourceId)?.destroy()
  taskCache.delete(sourceId)
}

// pdf.js's PDFPageProxy does not robustly support two overlapping render() calls on the same
// page instance (e.g. React effects re-firing, or a thumbnail and the editor rendering the same
// page at once) — it can leave the page's internal render-intent state stuck so a *later* render
// of that page hangs forever. Serialize renders per (source, page) so only one is ever in flight.
const renderQueues = new Map<string, Promise<unknown>>()

function runSerialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = renderQueues.get(key) ?? Promise.resolve()
  const settledPrevious = previous.then(
    () => undefined,
    () => undefined,
  )
  const run = settledPrevious.then(fn)
  renderQueues.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}

/**
 * Renders one page of a source PDF to a canvas and returns a PNG/JPEG data URL.
 * `targetWidth` is the desired CSS pixel width of the output raster.
 */
export function renderPageToDataUrl(
  sourceId: string,
  bytes: Uint8Array,
  pageIndex: number,
  targetWidth: number,
  extraRotation: number = 0,
): Promise<{ url: string; width: number; height: number }> {
  return runSerialized(`${sourceId}#${pageIndex}`, async () => {
    const doc = await getPdfjsDoc(sourceId, bytes)
    const page = await doc.getPage(pageIndex + 1)
    // `rotation` in getViewport is absolute, not additive — combine with the page's own
    // inherent /Rotate (common on scanned PDFs) so we don't silently discard it.
    const totalRotation = (page.rotate + extraRotation + 360) % 360
    const baseViewport = page.getViewport({ scale: 1, rotation: totalRotation })
    const scale = targetWidth / baseViewport.width
    const viewport = page.getViewport({ scale, rotation: totalRotation })

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    const url = canvas.toDataURL('image/png')
    return { url, width: canvas.width, height: canvas.height }
  })
}

/** Renders a page to a canvas at a given scale and returns the raw canvas (for image export / compression). */
export function renderPageToCanvas(
  sourceId: string,
  bytes: Uint8Array,
  pageIndex: number,
  scale: number,
  extraRotation: number = 0,
): Promise<HTMLCanvasElement> {
  return runSerialized(`${sourceId}#${pageIndex}`, async () => {
    const doc = await getPdfjsDoc(sourceId, bytes)
    const page = await doc.getPage(pageIndex + 1)
    const totalRotation = (page.rotate + extraRotation + 360) % 360
    const viewport = page.getViewport({ scale, rotation: totalRotation })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport, canvas }).promise
    return canvas
  })
}

export async function getSourcePageCount(sourceId: string, bytes: Uint8Array): Promise<number> {
  const doc = await getPdfjsDoc(sourceId, bytes)
  return doc.numPages
}
