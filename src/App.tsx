import { useState } from 'react'
import { WorkspaceProvider } from './state/WorkspaceContext'
import Home from './components/Home'
import PageGrid from './components/PageGrid'
import PageEditorModal from './components/PageEditorModal'
import ExportSheet from './components/ExportSheet'
import FormFillModal from './components/FormFillModal'
import InstallPrompt from './components/InstallPrompt'

type View = 'home' | 'workspace'

export default function App() {
  const [view, setView] = useState<View>('home')
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [exportIds, setExportIds] = useState<string[] | undefined | 'none'>('none')
  const [showFormFill, setShowFormFill] = useState(false)

  return (
    <WorkspaceProvider>
      <div className="mx-auto min-h-screen max-w-3xl bg-slate-50 dark:bg-slate-950">
        {view === 'home' && <Home onOpenWorkspace={() => setView('workspace')} onOpenFormFill={() => setShowFormFill(true)} />}

        {view === 'workspace' && (
          <PageGrid onHome={() => setView('home')} onOpenEditor={(id) => setEditingPageId(id)} onExport={(ids) => setExportIds(ids)} />
        )}

        {editingPageId && <PageEditorModal pageId={editingPageId} onClose={() => setEditingPageId(null)} />}

        {exportIds !== 'none' && <ExportSheet pageIds={exportIds} onClose={() => setExportIds('none')} />}

        {showFormFill && <FormFillModal onClose={() => setShowFormFill(false)} />}

        <InstallPrompt />
      </div>
    </WorkspaceProvider>
  )
}
