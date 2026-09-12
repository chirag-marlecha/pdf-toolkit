import { useRef, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useWorkspace } from '../state/WorkspaceContext'
import PageThumb from './PageThumb'
import { createSourceFromFile, imageFileToPageRef, pagesForSource } from '../lib/pdfEngine'

interface Props {
  onHome: () => void
  onOpenEditor: (pageId: string) => void
  onExport: (pageIds: string[] | undefined) => void
}

export default function PageGrid({ onHome, onOpenEditor, onExport }: Props) {
  const { ws, reorderPages, deletePages, duplicatePages, rotatePages, addSourceWithPages, addPages } = useWorkspace()
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = ws.pages.map((p) => p.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    reorderPages(arrayMove(ids, oldIndex, newIndex))
  }

  async function handleAddFiles(files: FileList) {
    const list = Array.from(files)
    if (!list.length) return
    setBusy(`Adding ${list.length} file${list.length > 1 ? 's' : ''}…`)
    try {
      for (const file of list) {
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const source = await createSourceFromFile(file)
          const pages = await pagesForSource(source)
          addSourceWithPages(source, pages)
        } else if (file.type.startsWith('image/')) {
          addPages([await imageFileToPageRef(file)])
        }
      }
    } finally {
      setBusy(null)
    }
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }

  const selectedIds = Array.from(selected)
  const hasSelection = selectedIds.length > 0

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <button onClick={onHome} className="rounded-lg p-2 text-xl leading-none active:bg-slate-100 dark:active:bg-slate-800" aria-label="Home">
          ←
        </button>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {selectMode ? `${selected.size} selected` : `${ws.pages.length} page${ws.pages.length === 1 ? '' : 's'}`}
        </div>
        <button
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-indigo-600 active:bg-indigo-50 dark:active:bg-indigo-950"
        >
          {selectMode ? 'Done' : 'Select'}
        </button>
      </header>

      {busy && <div className="bg-indigo-50 px-4 py-2 text-center text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{busy}</div>}

      <div className="flex-1 overflow-y-auto p-3 pb-28">
        {ws.pages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center text-slate-400">
            <span className="text-4xl">📭</span>
            <p>No pages yet — add a PDF or image to get started.</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ws.pages.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {ws.pages.map((page, i) => (
                  <PageThumb
                    key={page.id}
                    page={page}
                    index={i}
                    ws={ws}
                    selected={selected.has(page.id)}
                    selectMode={selectMode}
                    onToggleSelect={toggleSelect}
                    onOpenEditor={onOpenEditor}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf,image/png,image/jpeg"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleAddFiles(e.target.files)}
      />

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        {!selectMode ? (
          <div className="flex gap-2">
            <ToolButton icon="＋" label="Add" onClick={() => inputRef.current?.click()} />
            <ToolButton icon="⬇️" label="Export All" primary onClick={() => onExport(undefined)} disabled={ws.pages.length === 0} />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <ToolButton icon="↺" label="Rotate L" onClick={() => rotatePages(selectedIds, -90)} disabled={!hasSelection} />
            <ToolButton icon="↻" label="Rotate R" onClick={() => rotatePages(selectedIds, 90)} disabled={!hasSelection} />
            <ToolButton icon="⧉" label="Duplicate" onClick={() => duplicatePages(selectedIds)} disabled={!hasSelection} />
            <ToolButton
              icon="🗑️"
              label="Delete"
              danger
              onClick={() => {
                if (confirm(`Delete ${selectedIds.length} page(s)?`)) {
                  deletePages(selectedIds)
                  exitSelectMode()
                }
              }}
              disabled={!hasSelection}
            />
            <ToolButton icon="⬇️" label="Export Sel." primary onClick={() => onExport(selectedIds)} disabled={!hasSelection} />
          </div>
        )}
      </nav>
    </div>
  )
}

function ToolButton({
  icon,
  label,
  onClick,
  disabled,
  primary,
  danger,
}: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 basis-0 flex-col items-center gap-0.5 rounded-xl py-2.5 text-xs font-medium transition active:scale-95 disabled:opacity-35 ${
        primary
          ? 'bg-indigo-600 text-white'
          : danger
            ? 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400'
            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
      }`}
    >
      <span className="text-lg leading-none">{icon}</span>
      {label}
    </button>
  )
}
