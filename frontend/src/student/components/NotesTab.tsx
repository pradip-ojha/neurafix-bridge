import { useState, useEffect } from 'react'
import { FileText, Download, BookOpen } from 'lucide-react'

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
      <div className="flex items-center justify-center h-full">
        <div className="text-sm text-gray-400">Loading notes...</div>
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
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-52 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        {/* Chapter list */}
        <div className="flex-1 overflow-y-auto py-2">
          {data.chapters.map((ch) =>
            ch.has_note ? (
              <button
                key={ch.chapter_id}
                onClick={() => setSelectedChapter(ch)}
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
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {selectedChapter ? (
          <>
            {/* Top bar */}
            <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
              <span className="text-sm font-medium text-gray-800">{selectedChapter.display_name}</span>
              <a
                href={selectedChapter.url}
                download
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <Download size={13} />
                Download PDF
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
            <div className="text-center">
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
