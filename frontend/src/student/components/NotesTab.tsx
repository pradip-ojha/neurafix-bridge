import { useState, useEffect } from 'react'
import { FileText, Download, BookOpen, PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import Skeleton from '../../components/Skeleton'

interface ChapterNote {
  chapter_id: string
  display_name: string
  has_note: boolean
  level: number
  level_label: string
  url?: string
}

interface NotesResponse {
  level: number
  level_label: string
  chapters: ChapterNote[]
}

export default function NotesTab({ subject }: { subject: string }) {
  const [data, setData] = useState<NotesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedChapter, setSelectedChapter] = useState<ChapterNote | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768)

  useEffect(() => {
    const token = sessionStorage.getItem('token')
    fetch(`/api/notes/${subject}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) return
        const d: NotesResponse = await r.json()
        if (!d || !Array.isArray(d.chapters)) return
        setData(d)
        const first = d.chapters.find((c) => c.has_note)
        if (first) setSelectedChapter(first)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [subject])

  if (loading) {
    return (
      <div className="flex h-full overflow-hidden">
        <div className="w-52 flex-shrink-0 bg-white border-r border-gray-200 p-3 space-y-2 hidden md:block">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" variant="block" />
          ))}
        </div>
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-sm text-gray-400">Loading notes…</div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-400">Could not load notes.</div>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-10 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          flex-shrink-0 bg-white border-r border-gray-200 flex flex-col
          transition-all duration-200
          md:relative md:translate-x-0
          ${sidebarOpen
            ? 'w-52 fixed md:relative inset-y-0 left-0 z-20 md:z-auto translate-x-0'
            : 'w-0 overflow-hidden md:w-0'}
        `}
      >
        <div className="w-52 flex-1 overflow-y-auto py-2">
          {data.chapters.map((ch) =>
            ch.has_note ? (
              <button
                key={ch.chapter_id}
                onClick={() => { setSelectedChapter(ch); if (window.innerWidth < 768) setSidebarOpen(false) }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                  selectedChapter?.chapter_id === ch.chapter_id
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <FileText size={14} className="flex-shrink-0" />
                <span className="truncate">{ch.display_name}</span>
              </button>
            ) : (
              <div
                key={ch.chapter_id}
                className="px-3 py-2 text-sm flex items-center gap-2 text-gray-400 cursor-not-allowed select-none"
                title="Note not yet available"
              >
                <BookOpen size={14} className="flex-shrink-0" />
                <span className="truncate">{ch.display_name}</span>
                <span className="ml-auto text-xs flex-shrink-0">soon</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 min-w-0">
        {selectedChapter ? (
          <>
            {/* Top bar */}
            <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between flex-shrink-0 gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 flex-shrink-0"
                  title={sidebarOpen ? 'Hide chapters' : 'Show chapters'}
                >
                  {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                </button>
                <span className="text-sm font-medium text-gray-800 truncate">{selectedChapter.display_name}</span>
              </div>
              <a
                href={selectedChapter.url}
                download
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors flex-shrink-0"
              >
                <Download size={13} />
                <span className="hidden sm:inline">Download PDF</span>
              </a>
            </div>

            {/* PDF viewer */}
            <div className="flex-1 overflow-hidden">
              <iframe
                key={selectedChapter.chapter_id}
                src={selectedChapter.url}
                className="w-full h-full border-0"
                title={selectedChapter.display_name}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center px-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden mb-3 px-4 py-2 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
              >
                Select a chapter
              </button>
              <BookOpen size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-400">No notes uploaded yet for this subject.</p>
              <p className="text-xs text-gray-300 mt-1">Check back after your teacher uploads them.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
