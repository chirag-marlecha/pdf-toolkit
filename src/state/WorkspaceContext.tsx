import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Annotation, PageRef, PdfSource, Rotation, Workspace } from '../lib/types'
import { emptyWorkspace, uid } from '../lib/types'
import { loadWorkspace, saveWorkspace, clearWorkspace } from '../lib/db'

interface WorkspaceApi {
  ws: Workspace
  ready: boolean
  addSourceWithPages(source: PdfSource, pages: PageRef[]): void
  addPages(pages: PageRef[]): void
  reorderPages(orderedIds: string[]): void
  deletePages(ids: string[]): void
  duplicatePages(ids: string[]): void
  rotatePages(ids: string[], deltaDeg: 90 | -90 | 180): void
  setAnnotations(pageId: string, annotations: Annotation[]): void
  clearAll(): void
  pageById(id: string): PageRef | undefined
}

const WorkspaceCtx = createContext<WorkspaceApi | null>(null)

function normalizeRotation(deg: number): Rotation {
  return (((deg % 360) + 360) % 360) as Rotation
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [ws, setWs] = useState<Workspace>(emptyWorkspace)
  const [ready, setReady] = useState(false)
  const saveTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    loadWorkspace().then((saved) => {
      if (saved) setWs(saved)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!ready) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveWorkspace(ws)
    }, 500)
    return () => window.clearTimeout(saveTimer.current)
  }, [ws, ready])

  const addSourceWithPages = useCallback((source: PdfSource, pages: PageRef[]) => {
    setWs((prev) => ({
      sources: { ...prev.sources, [source.id]: source },
      pages: [...prev.pages, ...pages],
    }))
  }, [])

  const addPages = useCallback((pages: PageRef[]) => {
    setWs((prev) => ({ ...prev, pages: [...prev.pages, ...pages] }))
  }, [])

  const reorderPages = useCallback((orderedIds: string[]) => {
    setWs((prev) => {
      const byId = new Map(prev.pages.map((p) => [p.id, p]))
      const next = orderedIds.map((id) => byId.get(id)).filter((p): p is PageRef => !!p)
      return { ...prev, pages: next }
    })
  }, [])

  const deletePages = useCallback((ids: string[]) => {
    setWs((prev) => ({ ...prev, pages: prev.pages.filter((p) => !ids.includes(p.id)) }))
  }, [])

  const duplicatePages = useCallback((ids: string[]) => {
    setWs((prev) => {
      const idSet = new Set(ids)
      const next: PageRef[] = []
      for (const p of prev.pages) {
        next.push(p)
        if (idSet.has(p.id)) {
          next.push({ ...p, id: uid(), annotations: p.annotations.map((a) => ({ ...a, id: uid() })) })
        }
      }
      return { ...prev, pages: next }
    })
  }, [])

  const rotatePages = useCallback((ids: string[], deltaDeg: 90 | -90 | 180) => {
    setWs((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (ids.includes(p.id) ? { ...p, rotation: normalizeRotation(p.rotation + deltaDeg) } : p)),
    }))
  }, [])

  const setAnnotations = useCallback((pageId: string, annotations: Annotation[]) => {
    setWs((prev) => ({
      ...prev,
      pages: prev.pages.map((p) => (p.id === pageId ? { ...p, annotations } : p)),
    }))
  }, [])

  const clearAll = useCallback(() => {
    setWs(emptyWorkspace)
    clearWorkspace()
  }, [])

  const pageById = useCallback((id: string) => ws.pages.find((p) => p.id === id), [ws.pages])

  const value = useMemo<WorkspaceApi>(
    () => ({ ws, ready, addSourceWithPages, addPages, reorderPages, deletePages, duplicatePages, rotatePages, setAnnotations, clearAll, pageById }),
    [ws, ready, addSourceWithPages, addPages, reorderPages, deletePages, duplicatePages, rotatePages, setAnnotations, clearAll, pageById],
  )

  return <WorkspaceCtx.Provider value={value}>{children}</WorkspaceCtx.Provider>
}

export function useWorkspace(): WorkspaceApi {
  const ctx = useContext(WorkspaceCtx)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
