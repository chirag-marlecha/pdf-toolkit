import { useRef, useState } from 'react'
import { saveAs } from 'file-saver'
import { fillForm, listFormFields, type FormFieldInfo } from '../lib/pdfEngine'

interface Props {
  onClose: () => void
}

export default function FormFillModal({ onClose }: Props) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [fileName, setFileName] = useState('')
  const [fields, setFields] = useState<FormFieldInfo[] | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setLoading(true)
    setError(null)
    try {
      const buf = new Uint8Array(await file.arrayBuffer())
      const found = await listFormFields(buf)
      if (found.length === 0) {
        setError('No fillable form fields were found in this PDF.')
        setBytes(null)
        setFields(null)
        return
      }
      setBytes(buf)
      setFileName(file.name)
      setFields(found)
      const initial: Record<string, string> = {}
      for (const f of found) initial[f.name] = f.value
      setValues(initial)
    } catch {
      setError('Could not read this PDF — it may be corrupted or password-protected.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload() {
    if (!bytes) return
    setLoading(true)
    try {
      const out = await fillForm(bytes, values, false)
      saveAs(new Blob([out as BlobPart], { type: 'application/pdf' }), fileName.replace(/\.pdf$/i, '') + '-filled.pdf')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-white dark:bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
          Close
        </button>
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Fill a Form</span>
        <span className="w-14" />
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {!fields ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="text-4xl">📝</span>
            <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">Choose a PDF that has fillable form fields (text boxes, checkboxes, dropdowns).</p>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              className="rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/30"
            >
              {loading ? 'Reading…' : 'Choose PDF'}
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-md space-y-4">
            <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{fileName}</p>
            {fields.map((f) => (
              <div key={f.name}>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{f.name}</label>
                {f.kind === 'text' && (
                  <input
                    type="text"
                    value={values[f.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                )}
                {f.kind === 'checkbox' && (
                  <button
                    onClick={() => setValues((v) => ({ ...v, [f.name]: v[f.name] === 'true' ? 'false' : 'true' }))}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg ${
                      values[f.name] === 'true' ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {values[f.name] === 'true' ? '✓' : ''}
                  </button>
                )}
                {(f.kind === 'dropdown' || f.kind === 'radio') && (
                  <select
                    value={values[f.name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="" disabled>
                      Select…
                    </option>
                    {(f.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}
                {f.kind === 'unsupported' && <p className="text-xs italic text-slate-400">Unsupported field type — left unchanged.</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {fields && (
        <div className="border-t border-slate-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-slate-800">
          <button
            onClick={handleDownload}
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 py-3.5 text-base font-semibold text-white shadow-md shadow-indigo-600/30 disabled:opacity-60"
          >
            {loading ? 'Saving…' : 'Download Filled PDF'}
          </button>
        </div>
      )}
    </div>
  )
}
