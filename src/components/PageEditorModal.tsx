import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from '../state/WorkspaceContext'
import { renderPageToDataUrl, getPageTextItems, type PageTextItem } from '../lib/pdfjs'
import { renderImageToDataUrl } from '../lib/imageUtils'
import type { Annotation, AnnotationImage, AnnotationRect, AnnotationText } from '../lib/types'
import { uid } from '../lib/types'
import SignaturePadModal from './SignaturePadModal'

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

interface Props {
  pageId: string
  onClose: () => void
}

type Tool = 'select' | 'text' | 'ink' | 'sign'

const TEXT_COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#ca8a04']
const INK_COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a']

export default function PageEditorModal({ pageId, onClose }: Props) {
  const { ws, pageById, setAnnotations } = useWorkspace()
  const page = pageById(pageId)
  const [base, setBase] = useState<{ url: string; width: number; height: number } | null>(null)
  const [textItems, setTextItems] = useState<PageTextItem[]>([])
  const [annotations, setLocalAnnotations] = useState<Annotation[]>(page?.annotations ?? [])
  const [tool, setTool] = useState<Tool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingStrokes, setPendingStrokes] = useState<{ x: number; y: number }[][]>([])
  const [inkColor, setInkColor] = useState(INK_COLORS[0])
  const [inkWidthPct, setInkWidthPct] = useState(0.006)
  const [textColor, setTextColor] = useState(TEXT_COLORS[0])
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [showSignaturePad, setShowSignaturePad] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const currentStroke = useRef<{ x: number; y: number }[] | null>(null)
  const drawing = useRef(false)
  // Tracks the white "cover" box paired with a text annotation created via coverAndEditText, so
  // that clearing the text and tapping Done (i.e. cancelling) removes the cover too, instead of
  // leaving a blank white box silently blanking out the original text with no explanation.
  const pendingCoverRectId = useRef<string | null>(null)

  useEffect(() => {
    if (!page) return
    let cancelled = false
    async function load() {
      if (page!.kind === 'pdf') {
        const source = ws.sources[page!.sourceId]
        const res = await renderPageToDataUrl(page!.sourceId, source.bytes, page!.pageIndex, 1000, page!.rotation)
        if (!cancelled) setBase(res)
        const items = await getPageTextItems(page!.sourceId, source.bytes, page!.pageIndex, page!.rotation)
        if (!cancelled) setTextItems(items)
      } else {
        const res = await renderImageToDataUrl(page!.imageBytes, page!.mime, 1000, page!.rotation)
        if (!cancelled) setBase(res)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  const redrawInk = useMemo(
    () => () => {
      const canvas = canvasRef.current
      if (!canvas || !base) return
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const drawStroke = (stroke: { x: number; y: number }[], color: string, widthPct: number) => {
        if (stroke.length < 2) return
        ctx.strokeStyle = color
        ctx.lineWidth = Math.max(1, widthPct * canvas.width)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(stroke[0].x * canvas.width, stroke[0].y * canvas.height)
        for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x * canvas.width, stroke[i].y * canvas.height)
        ctx.stroke()
      }
      for (const ann of annotations) {
        if (ann.type === 'ink') for (const stroke of ann.strokes) drawStroke(stroke, ann.color, ann.widthPct)
      }
      for (const stroke of pendingStrokes) drawStroke(stroke, inkColor, inkWidthPct)
    },
    [annotations, pendingStrokes, base, inkColor, inkWidthPct],
  )

  useEffect(() => {
    redrawInk()
  }, [redrawInk])

  if (!page) return null

  function fractionFromEvent(e: React.PointerEvent) {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  /** Finds the smallest existing-text bounding box under a tap, if any — pdf-lib can't rewrite
   *  text in place, so "editing" existing text means covering it and dropping a replacement on top. */
  function findTextItemAt(x: number, y: number): PageTextItem | null {
    let best: PageTextItem | null = null
    let bestArea = Infinity
    for (const item of textItems) {
      if (x >= item.xPct && x <= item.xPct + item.wPct && y >= item.yPct && y <= item.yPct + item.hPct) {
        const area = item.wPct * item.hPct
        if (area < bestArea) {
          bestArea = area
          best = item
        }
      }
    }
    return best
  }

  function coverAndEditText(item: PageTextItem) {
    const pad = 0.004
    const rectAnn: AnnotationRect = {
      id: uid(),
      type: 'rect',
      xPct: Math.max(0, item.xPct - pad),
      yPct: Math.max(0, item.yPct - pad),
      wPct: item.wPct + pad * 2,
      hPct: item.hPct + pad * 2,
      color: '#ffffff',
    }
    const textAnn: AnnotationText = {
      id: uid(),
      type: 'text',
      xPct: item.xPct,
      yPct: item.yPct,
      text: item.str,
      sizePct: Math.max(0.015, item.hPct * 0.85),
      color: textColor,
    }
    setLocalAnnotations((prev) => [...prev, rectAnn, textAnn])
    pendingCoverRectId.current = rectAnn.id
    setEditingTextId(textAnn.id)
    setSelectedId(textAnn.id)
  }

  function handleContainerDown(e: React.PointerEvent) {
    if (tool === 'text' || tool === 'select') {
      const { x, y } = fractionFromEvent(e)
      const hit = findTextItemAt(x, y)
      if (hit) {
        coverAndEditText(hit)
        return
      }
    }
    if (tool === 'text') {
      const { x, y } = fractionFromEvent(e)
      const newAnn: AnnotationText = { id: uid(), type: 'text', xPct: x, yPct: y, text: '', sizePct: 0.035, color: textColor }
      setLocalAnnotations((prev) => [...prev, newAnn])
      pendingCoverRectId.current = null
      setEditingTextId(newAnn.id)
      setSelectedId(newAnn.id)
    } else if (tool === 'select') {
      setSelectedId(null)
    }
  }

  function handleInkDown(e: React.PointerEvent) {
    if (tool !== 'ink') return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drawing.current = true
    currentStroke.current = [fractionFromEvent(e)]
  }

  function handleInkMove(e: React.PointerEvent) {
    if (!drawing.current || !currentStroke.current || !canvasRef.current) return
    const p = fractionFromEvent(e)
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const prev = currentStroke.current[currentStroke.current.length - 1]
    ctx.strokeStyle = inkColor
    ctx.lineWidth = Math.max(1, inkWidthPct * canvas.width)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(prev.x * canvas.width, prev.y * canvas.height)
    ctx.lineTo(p.x * canvas.width, p.y * canvas.height)
    ctx.stroke()
    currentStroke.current.push(p)
  }

  function handleInkUp() {
    if (!drawing.current) return
    drawing.current = false
    if (currentStroke.current && currentStroke.current.length > 1) {
      setPendingStrokes((prev) => [...prev, currentStroke.current!])
    }
    currentStroke.current = null
  }

  function commitInk() {
    if (pendingStrokes.length === 0) {
      setTool('select')
      return
    }
    const newAnn: Annotation = { id: uid(), type: 'ink', strokes: pendingStrokes, color: inkColor, widthPct: inkWidthPct }
    setLocalAnnotations((prev) => [...prev, newAnn])
    setPendingStrokes([])
    setTool('select')
  }

  function undoStroke() {
    setPendingStrokes((prev) => prev.slice(0, -1))
  }

  function deleteAnnotation(id: string) {
    setLocalAnnotations((prev) => prev.filter((a) => a.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function updateAnnotation(id: string, patch: Partial<Annotation>) {
    setLocalAnnotations((prev) => prev.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)))
  }

  function handleSignatureConfirm(bytes: Uint8Array, aspect: number) {
    const w = 0.35
    const h = w / aspect
    const newAnn: AnnotationImage = {
      id: uid(),
      type: 'image',
      xPct: 0.5 - w / 2,
      yPct: 0.5 - h / 2,
      wPct: w,
      hPct: h,
      bytes,
      mime: 'image/png',
    }
    setLocalAnnotations((prev) => [...prev, newAnn])
    setSelectedId(newAnn.id)
    setShowSignaturePad(false)
    setTool('select')
  }

  function handleSave() {
    setAnnotations(pageId, annotations)
    onClose()
  }

  const editingAnn = editingTextId ? annotations.find((a) => a.id === editingTextId) : null

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3 py-2.5">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-300 active:bg-slate-800">
          Cancel
        </button>
        <span className="text-sm font-medium text-slate-200">Edit Page</span>
        <button onClick={handleSave} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white active:bg-indigo-700">
          Save
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-auto p-3">
        {base ? (
          <div
            ref={containerRef}
            onPointerDown={handleContainerDown}
            className="relative touch-none select-none shadow-xl"
            style={{ width: '100%', maxWidth: 480, aspectRatio: `${base.width} / ${base.height}` }}
          >
            <img src={base.url} alt="Page" className="pointer-events-none absolute inset-0 h-full w-full rounded-md" draggable={false} />
            <canvas
              ref={canvasRef}
              width={base.width}
              height={base.height}
              className="absolute inset-0 h-full w-full rounded-md"
              style={{ pointerEvents: tool === 'ink' ? 'auto' : 'none' }}
              onPointerDown={handleInkDown}
              onPointerMove={handleInkMove}
              onPointerUp={handleInkUp}
              onPointerCancel={handleInkUp}
            />
            {annotations
              .filter((a): a is AnnotationText | AnnotationImage | AnnotationRect => a.type !== 'ink')
              .map((ann) => (
                <AnnotationBox
                  key={ann.id}
                  ann={ann}
                  containerRef={containerRef}
                  interactive={tool === 'select'}
                  selected={selectedId === ann.id}
                  onSelect={() => setSelectedId(ann.id)}
                  onEditText={() => ann.type === 'text' && setEditingTextId(ann.id)}
                  onChange={(patch) => updateAnnotation(ann.id, patch)}
                />
              ))}
          </div>
        ) : (
          <div className="text-sm text-slate-400">Loading…</div>
        )}
      </div>

      {editingAnn && editingAnn.type === 'text' && (
        <TextEditPopup
          value={editingAnn.text}
          color={editingAnn.color}
          onChange={(text) => updateAnnotation(editingAnn.id, { text })}
          onColor={(color) => {
            updateAnnotation(editingAnn.id, { color })
            setTextColor(color)
          }}
          onDone={() => {
            if (!editingAnn.text.trim()) {
              deleteAnnotation(editingAnn.id)
              if (pendingCoverRectId.current) deleteAnnotation(pendingCoverRectId.current)
            }
            pendingCoverRectId.current = null
            setEditingTextId(null)
          }}
        />
      )}

      {selectedId && !editingTextId && (
        <SelectionToolbar
          ann={annotations.find((a) => a.id === selectedId)!}
          onDelete={() => deleteAnnotation(selectedId)}
          onSizeDelta={(d) => {
            const a = annotations.find((x) => x.id === selectedId)
            if (a?.type === 'text') updateAnnotation(a.id, { sizePct: Math.max(0.015, Math.min(0.12, a.sizePct + d)) })
          }}
        />
      )}

      <nav className="border-t border-slate-800 bg-slate-900 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        {tool === 'ink' ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {INK_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setInkColor(c)}
                  style={{ background: c }}
                  className={`h-7 w-7 rounded-full border-2 ${inkColor === c ? 'border-white' : 'border-transparent'}`}
                />
              ))}
              <input
                type="range"
                min={0.003}
                max={0.02}
                step={0.001}
                value={inkWidthPct}
                onChange={(e) => setInkWidthPct(Number(e.target.value))}
                className="ml-2 flex-1"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={undoStroke} disabled={!pendingStrokes.length} className="flex-1 rounded-xl bg-slate-800 py-2.5 text-sm font-medium text-slate-200 disabled:opacity-40">
                Undo Stroke
              </button>
              <button onClick={commitInk} className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white">
                Done Drawing
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <ToolBtn icon="↖" label="Select" active={tool === 'select'} onClick={() => setTool('select')} />
            <ToolBtn icon="T" label="Text" active={tool === 'text'} onClick={() => setTool('text')} />
            <ToolBtn icon="✎" label="Draw" active={false} onClick={() => setTool('ink')} />
            <ToolBtn icon="✒️" label="Sign" active={false} onClick={() => setShowSignaturePad(true)} />
          </div>
        )}
      </nav>

      {showSignaturePad && <SignaturePadModal onCancel={() => setShowSignaturePad(false)} onConfirm={handleSignatureConfirm} />}
    </div>
  )
}

function ToolBtn({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 basis-0 flex-col items-center gap-0.5 rounded-xl py-2.5 text-xs font-medium active:scale-95 ${
        active ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </button>
  )
}

function AnnotationBox({
  ann,
  containerRef,
  interactive,
  selected,
  onSelect,
  onEditText,
  onChange,
}: {
  ann: AnnotationText | AnnotationImage | AnnotationRect
  containerRef: React.RefObject<HTMLDivElement | null>
  interactive: boolean
  selected: boolean
  onSelect: () => void
  onEditText: () => void
  onChange: (patch: Partial<Annotation>) => void
}) {
  const dragStart = useRef<{ px: number; py: number; xPct: number; yPct: number } | null>(null)
  const resizeStart = useRef<{ px: number; startW: number; startH: number } | null>(null)

  function onDown(e: React.PointerEvent) {
    if (!interactive) return
    e.stopPropagation()
    onSelect()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    dragStart.current = { px: e.clientX, py: e.clientY, xPct: ann.xPct, yPct: ann.yPct }
  }

  function onMove(e: React.PointerEvent) {
    if (!dragStart.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dx = (e.clientX - dragStart.current.px) / rect.width
    const dy = (e.clientY - dragStart.current.py) / rect.height
    onChange({ xPct: Math.min(0.95, Math.max(0, dragStart.current.xPct + dx)), yPct: Math.min(0.95, Math.max(0, dragStart.current.yPct + dy)) })
  }

  function onUp() {
    dragStart.current = null
  }

  function onResizeDown(e: React.PointerEvent) {
    e.stopPropagation()
    if (ann.type === 'text') return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    resizeStart.current = { px: e.clientX, startW: ann.wPct, startH: ann.hPct }
  }

  function onResizeMove(e: React.PointerEvent) {
    if (!resizeStart.current || !containerRef.current || ann.type === 'text') return
    const rect = containerRef.current.getBoundingClientRect()
    const dx = (e.clientX - resizeStart.current.px) / rect.width
    const scale = Math.max(0.15, (resizeStart.current.startW + dx) / resizeStart.current.startW)
    onChange({ wPct: resizeStart.current.startW * scale, hPct: resizeStart.current.startH * scale })
  }

  function onResizeUp() {
    resizeStart.current = null
  }

  if (ann.type === 'text') {
    return (
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={(e) => {
          e.stopPropagation()
          if (interactive) onEditText()
        }}
        style={{
          position: 'absolute',
          left: `${ann.xPct * 100}%`,
          top: `${ann.yPct * 100}%`,
          fontSize: `${ann.sizePct * 100}%`,
          color: ann.color,
          pointerEvents: interactive ? 'auto' : 'none',
          maxWidth: '90%',
        }}
        className={`cursor-move whitespace-pre-wrap break-words px-0.5 font-medium leading-none ${selected ? 'outline outline-2 outline-indigo-400' : ''}`}
      >
        {ann.text || <span className="opacity-40">Tap to edit</span>}
      </div>
    )
  }

  return (
    <div
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        position: 'absolute',
        left: `${ann.xPct * 100}%`,
        top: `${ann.yPct * 100}%`,
        width: `${ann.wPct * 100}%`,
        height: `${ann.hPct * 100}%`,
        pointerEvents: interactive ? 'auto' : 'none',
      }}
      className={`cursor-move ${selected ? 'outline outline-2 outline-indigo-400' : ''}`}
    >
      {ann.type === 'image' ? (
        <img src={bytesToDataUrl(ann.bytes, ann.mime)} className="h-full w-full object-contain" draggable={false} />
      ) : (
        <div className="h-full w-full" style={{ background: ann.color }} />
      )}
      {selected && (
        <div
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          className="absolute -bottom-2 -right-2 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-indigo-500"
        />
      )}
    </div>
  )
}

function TextEditPopup({
  value,
  color,
  onChange,
  onColor,
  onDone,
}: {
  value: string
  color: string
  onChange: (v: string) => void
  onColor: (c: string) => void
  onDone: () => void
}) {
  return (
    <div className="border-t border-slate-800 bg-slate-900 p-3">
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="Type your text…"
        className="w-full resize-none rounded-xl border border-slate-700 bg-slate-800 p-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-2">
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onColor(c)}
              style={{ background: c }}
              className={`h-6 w-6 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
            />
          ))}
        </div>
        <button onClick={onDone} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white">
          Done
        </button>
      </div>
    </div>
  )
}

function SelectionToolbar({ ann, onDelete, onSizeDelta }: { ann: Annotation; onDelete: () => void; onSizeDelta: (d: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900 px-4 py-2">
      {ann.type === 'text' ? (
        <div className="flex gap-2">
          <button onClick={() => onSizeDelta(-0.008)} className="h-8 w-8 rounded-lg bg-slate-800 text-sm font-bold text-white">
            A-
          </button>
          <button onClick={() => onSizeDelta(0.008)} className="h-8 w-8 rounded-lg bg-slate-800 text-sm font-bold text-white">
            A+
          </button>
        </div>
      ) : (
        <span className="text-xs text-slate-400">Drag corner to resize</span>
      )}
      <button onClick={onDelete} className="rounded-lg bg-red-950 px-3 py-1.5 text-sm font-medium text-red-400">
        🗑 Delete
      </button>
    </div>
  )
}
