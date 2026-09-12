export type Rotation = 0 | 90 | 180 | 270

export interface AnnotationText {
  id: string
  type: 'text'
  /** All coordinates are fractions (0..1) of the page's own width/height, from the top-left. */
  xPct: number
  yPct: number
  text: string
  /** Font size as a fraction of page height, so it scales with the page. */
  sizePct: number
  color: string
}

export interface AnnotationInk {
  id: string
  type: 'ink'
  strokes: { x: number; y: number }[][]
  color: string
  widthPct: number
}

export interface AnnotationImage {
  id: string
  type: 'image'
  xPct: number
  yPct: number
  wPct: number
  hPct: number
  bytes: Uint8Array
  mime: 'image/png' | 'image/jpeg'
}

/** A solid-color box, used to mask over existing PDF text before placing a replacement AnnotationText on top. */
export interface AnnotationRect {
  id: string
  type: 'rect'
  xPct: number
  yPct: number
  wPct: number
  hPct: number
  color: string
}

export type Annotation = AnnotationText | AnnotationInk | AnnotationImage | AnnotationRect

export interface PdfSource {
  id: string
  name: string
  bytes: Uint8Array
}

interface PageRefBase {
  id: string
  /** Extra rotation (degrees) applied on top of whatever rotation the source page already has. */
  rotation: Rotation
  annotations: Annotation[]
}

export type PageRef =
  | (PageRefBase & { kind: 'pdf'; sourceId: string; pageIndex: number })
  | (PageRefBase & { kind: 'image'; imageBytes: Uint8Array; mime: string; width: number; height: number })

export interface Workspace {
  sources: Record<string, PdfSource>
  pages: PageRef[]
}

export const emptyWorkspace: Workspace = { sources: {}, pages: [] }

export type CompressLevel = 'low' | 'medium' | 'high'

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
