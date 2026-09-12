import { useState } from 'react'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import { useWorkspace } from '../state/WorkspaceContext'
import { compressWorkspace, exportWorkspace, pagesToImages } from '../lib/pdfEngine'
import type { CompressLevel } from '../lib/types'

interface Props {
  pageIds: string[] | undefined
  onClose: () => void
}

type OutputMode = 'merged' | 'split' | 'images'

export default function ExportSheet({ pageIds, onClose }: Props) {
  const { ws } = useWorkspace()
  const [mode, setMode] = useState<OutputMode>('merged')
  const [compress, setCompress] = useState<CompressLevel | 'none'>('none')
  const [imgFormat, setImgFormat] = useState<'png' | 'jpeg'>('png')
  const [working, setWorking] = useState(false)
  const [done, setDone] = useState(false)

  const count = pageIds ? pageIds.length : ws.pages.length

  async function handleExport() {
    setWorking(true)
    setDone(false)
    try {
      if (mode === 'merged') {
        const bytes = compress === 'none' ? await exportWorkspace(ws, pageIds) : await compressWorkspace(ws, compress, pageIds)
        saveAs(new Blob([bytes as BlobPart], { type: 'application/pdf' }), 'document.pdf')
      } else if (mode === 'split') {
        const targetPages = pageIds ?? ws.pages.map((p) => p.id)
        const zip = new JSZip()
        for (let i = 0; i < targetPages.length; i++) {
          const bytes =
            compress === 'none'
              ? await exportWorkspace(ws, [targetPages[i]])
              : await compressWorkspace(ws, compress, [targetPages[i]])
          zip.file(`page-${String(i + 1).padStart(2, '0')}.pdf`, bytes)
        }
        const blob = await zip.generateAsync({ type: 'blob' })
        saveAs(blob, 'split-pages.zip')
      } else {
        const images = await pagesToImages(ws, pageIds, imgFormat, 2)
        if (images.length === 1) {
          saveAs(new Blob([images[0].bytes as BlobPart], { type: images[0].mime }), images[0].name)
        } else {
          const zip = new JSZip()
          for (const img of images) zip.file(img.name, img.bytes)
          const blob = await zip.generateAsync({ type: 'blob' })
          saveAs(blob, 'pages-as-images.zip')
        }
      }
      setDone(true)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="w-full rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Export {count} page{count === 1 ? '' : 's'}</h2>

        <div className="mt-4 space-y-2">
          <SegmentOption label="One merged PDF" active={mode === 'merged'} onClick={() => setMode('merged')} />
          <SegmentOption label="Separate PDF per page (.zip)" active={mode === 'split'} onClick={() => setMode('split')} />
          <SegmentOption label="Images (.png/.jpg)" active={mode === 'images'} onClick={() => setMode('images')} />
        </div>

        {mode !== 'images' ? (
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">Compression</div>
            <div className="flex gap-2">
              {(['none', 'low', 'medium', 'high'] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setCompress(lvl)}
                  className={`flex-1 rounded-lg py-2 text-sm capitalize ${
                    compress === lvl ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Higher compression makes a smaller file but reduces image quality.</p>
          </div>
        ) : (
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">Format</div>
            <div className="flex gap-2">
              {(['png', 'jpeg'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setImgFormat(f)}
                  className={`flex-1 rounded-lg py-2 text-sm uppercase ${
                    imgFormat === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={working}
          className="mt-6 w-full rounded-xl bg-indigo-600 py-3.5 text-base font-semibold text-white shadow-md shadow-indigo-600/30 active:scale-[0.98] disabled:opacity-60"
        >
          {working ? 'Preparing…' : done ? 'Downloaded ✓ — Export again' : 'Export & Download'}
        </button>
        <button onClick={onClose} className="mt-2 w-full py-2 text-center text-sm text-slate-500">
          Cancel
        </button>
      </div>
    </div>
  )
}

function SegmentOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium ${
        active
          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
          : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200'
      }`}
    >
      {label}
      {active && <span>✓</span>}
    </button>
  )
}
