import { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { PageRef, Workspace } from '../lib/types'
import { renderPageToDataUrl } from '../lib/pdfjs'
import { renderImageToDataUrl } from '../lib/imageUtils'

interface Props {
  page: PageRef
  index: number
  ws: Workspace
  selected: boolean
  selectMode: boolean
  onToggleSelect: (id: string) => void
  onOpenEditor: (id: string) => void
}

export default function PageThumb({ page, index, ws, selected, selectMode, onToggleSelect, onOpenEditor }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  const [thumb, setThumb] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisible(true)
          obs.disconnect()
        }
      },
      { rootMargin: '400px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    async function render() {
      try {
        if (page.kind === 'pdf') {
          const source = ws.sources[page.sourceId]
          const { url } = await renderPageToDataUrl(page.sourceId, source.bytes, page.pageIndex, 260, page.rotation)
          if (!cancelled) setThumb(url)
        } else {
          const { url } = await renderImageToDataUrl(page.imageBytes, page.mime, 260, page.rotation)
          if (!cancelled) setThumb(url)
        }
      } catch {
        if (!cancelled) setThumb(null)
      }
    }
    render()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, page.kind, page.kind === 'pdf' ? page.pageIndex : page.id, page.rotation])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={(el) => {
        setNodeRef(el)
        containerRef.current = el
      }}
      style={style}
      className={`group relative touch-none select-none rounded-xl border bg-white shadow-sm dark:bg-slate-800 ${
        selected ? 'border-indigo-500 ring-2 ring-indigo-400' : 'border-slate-200 dark:border-slate-700'
      } ${isDragging ? 'z-10 opacity-70' : ''}`}
      {...attributes}
      {...listeners}
      onClick={() => (selectMode ? onToggleSelect(page.id) : onOpenEditor(page.id))}
    >
      <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-t-xl bg-slate-100 dark:bg-slate-900">
        {thumb ? (
          <img src={thumb} alt={`Page ${index + 1}`} className="h-full w-full object-contain" draggable={false} />
        ) : (
          <div className="h-full w-full animate-pulse bg-slate-200 dark:bg-slate-700" />
        )}
        {page.annotations.length > 0 && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white">✎</span>
        )}
        <span
          className={`absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
            selectMode
              ? selected
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-white bg-white/70 text-transparent dark:border-slate-300'
              : 'hidden'
          }`}
        >
          ✓
        </span>
      </div>
      <div className="rounded-b-xl px-2 py-1.5 text-center text-xs font-medium text-slate-600 dark:text-slate-300">{index + 1}</div>
    </div>
  )
}

