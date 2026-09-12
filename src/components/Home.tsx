import { useRef, useState } from 'react'
import { useWorkspace } from '../state/WorkspaceContext'
import { createSourceFromFile, imageFileToPageRef, pagesForSource } from '../lib/pdfEngine'

interface Props {
  onOpenWorkspace: () => void
  onOpenFormFill: () => void
}

const ACCEPT = '.pdf,application/pdf,image/png,image/jpeg'

export default function Home({ onOpenWorkspace, onOpenFormFill }: Props) {
  const { ws, addSourceWithPages, addPages, clearAll } = useWorkspace()
  const [busy, setBusy] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const hasExisting = ws.pages.length > 0

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length) return
    setBusy(`Loading ${list.length} file${list.length > 1 ? 's' : ''}…`)
    try {
      for (const file of list) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const source = await createSourceFromFile(file)
          const pages = await pagesForSource(source)
          addSourceWithPages(source, pages)
        } else if (file.type.startsWith('image/')) {
          const page = await imageFileToPageRef(file)
          addPages([page])
        }
      }
      onOpenWorkspace()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-3xl shadow-lg shadow-indigo-600/20">
            📄
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">PDF Toolkit</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Edit, merge, split &amp; sign PDFs — 100% private, runs entirely on your device.
          </p>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
          }}
          className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-300 dark:border-slate-700'
          }`}
        >
          <span className="text-4xl">⬆️</span>
          <span className="font-medium text-slate-800 dark:text-slate-100">Tap to open PDFs or images</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">or drag &amp; drop — select multiple to merge</span>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-1 rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-md shadow-indigo-600/30 active:scale-95"
          >
            Choose Files
          </button>
        </label>

        {busy && <p className="mt-4 text-center text-sm text-slate-500 animate-pulse">{busy}</p>}

        {hasExisting && !busy && (
          <button
            onClick={onOpenWorkspace}
            className="mt-4 flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800"
          >
            <span>
              <span className="block font-medium text-slate-900 dark:text-white">Continue editing</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{ws.pages.length} page{ws.pages.length === 1 ? '' : 's'} in progress</span>
            </span>
            <span className="text-xl">→</span>
          </button>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={onOpenFormFill}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center shadow-sm active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="text-2xl">📝</div>
            <div className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">Fill a Form</div>
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center shadow-sm active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="text-2xl">🖼️</div>
            <div className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">Images → PDF</div>
          </button>
        </div>

        {hasExisting && (
          <button
            onClick={() => {
              if (confirm('Discard the current in-progress document? This cannot be undone.')) clearAll()
            }}
            className="mt-6 w-full text-center text-xs text-slate-400 underline decoration-dotted"
          >
            Clear in-progress document
          </button>
        )}

        <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-400">
          Your files never leave this device. Everything runs locally in your browser — no uploads, no servers, no accounts.
        </p>
      </div>
    </div>
  )
}
