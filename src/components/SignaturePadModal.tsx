import { useRef, useState } from 'react'

interface Props {
  onCancel: () => void
  onConfirm: (bytes: Uint8Array, aspect: number) => void
}

export default function SignaturePadModal({ onCancel, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const hasInk = useRef(false)
  const [empty, setEmpty] = useState(true)

  function getCtx() {
    return canvasRef.current!.getContext('2d')!
  }

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return
    const p = point(e)
    const ctx = getCtx()
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    hasInk.current = true
    if (empty) setEmpty(false)
  }

  function onUp() {
    drawing.current = false
    last.current = null
  }

  function clear() {
    const canvas = canvasRef.current!
    getCtx().clearRect(0, 0, canvas.width, canvas.height)
    hasInk.current = false
    setEmpty(true)
  }

  function confirm() {
    const canvas = canvasRef.current!
    if (!hasInk.current) return
    // crop to the ink's bounding box so the placed signature isn't mostly empty space
    const ctx = getCtx()
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let minX = canvas.width,
      minY = canvas.height,
      maxX = 0,
      maxY = 0
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const a = data[(y * canvas.width + x) * 4 + 3]
        if (a > 10) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return
    const pad = 6
    minX = Math.max(0, minX - pad)
    minY = Math.max(0, minY - pad)
    maxX = Math.min(canvas.width, maxX + pad)
    maxY = Math.min(canvas.height, maxY + pad)
    const w = maxX - minX
    const h = maxY - minY
    const crop = document.createElement('canvas')
    crop.width = w
    crop.height = h
    crop.getContext('2d')!.drawImage(canvas, minX, minY, w, h, 0, 0, w, h)
    const url = crop.toDataURL('image/png')
    const base64 = url.split(',')[1]
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    onConfirm(bytes, w / h)
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black/60 p-4">
      <div className="m-auto w-full max-w-lg rounded-2xl bg-white p-4 dark:bg-slate-900">
        <h2 className="mb-2 text-center text-base font-semibold text-slate-800 dark:text-slate-100">Draw your signature</h2>
        <canvas
          ref={canvasRef}
          width={600}
          height={260}
          className="w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white dark:border-slate-700"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        <div className="mt-3 flex gap-2">
          <button onClick={clear} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Clear
          </button>
          <button onClick={onCancel} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={empty}
            className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Use Signature
          </button>
        </div>
      </div>
    </div>
  )
}
