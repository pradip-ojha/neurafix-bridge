import { useState, useEffect } from 'react'
import { FileText, Download, BookOpen, PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import DarkSkeleton from './DarkSkeleton'
import { useMobileLayout } from '../../contexts/MobileLayoutContext'
import api from '../../lib/api'

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
  const [data, setData]                     = useState<NotesResponse | null>(null)
  const [loading, setLoading]               = useState(true)
  const [selectedChapter, setSelectedChapter] = useState<ChapterNote | null>(null)
  const [sidebarOpen, setSidebarOpen]       = useState(window.innerWidth >= 768)
  const { mainSidebarOpen } = useMobileLayout()

  useEffect(() => {
    if (mainSidebarOpen && window.innerWidth < 768) setSidebarOpen(false)
  }, [mainSidebarOpen])

  useEffect(() => {
    api.get<NotesResponse>(`/api/notes/${subject}`)
      .then((res) => {
        const d = res.data
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
      <div className="flex h-full overflow-hidden bg-study-bg">
        <div className="w-52 flex-shrink-0 bg-study-surface border-r border-white/[0.06] p-3 space-y-2 hidden md:block">
          {Array.from({ length: 8 }).map((_, i) => (
            <DarkSkeleton key={i} className="h-8 w-full" variant="block" />
          ))}
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-2 w-64">
            {[...Array(6)].map((_, i) => <DarkSkeleton key={i} className="h-4" />)}
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full bg-study-bg">
        <p className="text-sm text-slate-500">Could not load notes.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden relative bg-study-bg">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-10 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`flex-shrink-0 bg-study-surface border-r border-white/[0.06] flex flex-col transition-all duration-200 md:relative ${sidebarOpen ? 'w-52 fixed md:relative inset-y-0 left-0 z-20 md:z-auto' : 'w-0 overflow-hidden md:w-0'}`}>
        <div className="w-52 flex-1 overflow-y-auto py-2 dark-scrollbar">
          {data.chapters.map((ch) =>
            ch.has_note ? (
              <button
                key={ch.chapter_id}
                onClick={() => { setSelectedChapter(ch); if (window.innerWidth < 768) setSidebarOpen(false) }}
                className={`w-full text-left px-4 py-2.5 text-xs flex items-center gap-2 transition-colors border-l-2 ${
                  selectedChapter?.chapter_id === ch.chapter_id
                    ? 'bg-indigo-600/15 text-indigo-400 border-indigo-500 pl-[14px]'
                    : 'text-slate-400 hover:bg-study-hover hover:text-slate-200 border-transparent pl-[14px]'
                }`}
              >
                <FileText size={13} className="flex-shrink-0" />
                <span className="truncate">{ch.display_name}</span>
              </button>
            ) : (
              <div
                key={ch.chapter_id}
                className="px-4 py-2.5 text-xs flex items-center gap-2 text-slate-600 cursor-not-allowed select-none border-l-2 border-transparent pl-[14px]"
                title="Note not yet available"
              >
                <BookOpen size={13} className="flex-shrink-0" />
                <span className="truncate">{ch.display_name}</span>
                <span className="ml-auto text-slate-700 text-[10px] flex-shrink-0">soon</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {selectedChapter ? (
          <>
            <div className="bg-study-surface border-b border-white/[0.06] px-3 py-2 flex items-center justify-between flex-shrink-0 gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-study-hover flex-shrink-0 transition-colors"
                >
                  {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
                </button>
                <span className="text-sm font-medium text-slate-300 truncate">{selectedChapter.display_name}</span>
              </div>
              <a
                href={selectedChapter.url}
                download target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-400 border border-indigo-500/30 rounded-lg hover:bg-indigo-600/10 transition-colors flex-shrink-0"
              >
                <Download size={13} />
                <span className="hidden sm:inline">Download PDF</span>
              </a>
            </div>
            <div className="flex-1 overflow-hidden bg-study-bg">
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
                className="md:hidden mb-3 px-4 py-2 text-sm text-indigo-400 border border-indigo-500/30 rounded-xl hover:bg-indigo-600/10 transition-colors"
              >
                Select a chapter
              </button>
              <BookOpen size={32} className="mx-auto text-slate-700 mb-3" />
              <p className="text-sm text-slate-500">No notes uploaded yet for this subject.</p>
              <p className="text-xs text-slate-600 mt-1">Check back after they are uploaded.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
