import { get, set, del, createStore } from 'idb-keyval'
import type { Workspace } from './types'

const store = createStore('pdf-toolkit', 'workspace')
const KEY = 'current-workspace'

export async function loadWorkspace(): Promise<Workspace | undefined> {
  try {
    return await get<Workspace>(KEY, store)
  } catch {
    return undefined
  }
}

export async function saveWorkspace(ws: Workspace): Promise<void> {
  try {
    await set(KEY, ws, store)
  } catch {
    // best-effort; e.g. storage quota exceeded — the in-memory session still works
  }
}

export async function clearWorkspace(): Promise<void> {
  try {
    await del(KEY, store)
  } catch {
    /* ignore */
  }
}
