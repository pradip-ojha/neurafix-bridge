import { useEffect, useState } from 'react'
import { BookOpen, ExternalLink, ChevronRight } from 'lucide-react'
import api from '../../lib/api'

interface College {
  id: string
  name: string
  location: string
}

interface SyllabusEntry {
  id: string
  year: number
  display_name: string
  file_url: string
}

interface PastQuestionEntry {
  id: string
  year: number
  file_url: string
}

export default function Syllabus() {
  const [colleges, setColleges] = useState<College[]>([])
  const [selected, setSelected] = useState<College | null>(null)
  const [activeTab, setActiveTab] = useState<'syllabus' | 'past-questions'>('syllabus')
  const [syllabi, setSyllabi] = useState<SyllabusEntry[]>([])
  const [pastQuestions, setPastQuestions] = useState<PastQuestionEntry[]>([])
  const [loadingContent, setLoadingContent] = useState(false)
  const [loadingColleges, setLoadingColleges] = useState(true)

  useEffect(() => {
    api.get('/api/colleges')
      .then(r => setColleges(r.data))
      .catch(() => {})
      .finally(() => setLoadingColleges(false))
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoadingContent(true)
    setSyllabi([])
    setPastQuestions([])
    Promise.all([
      api.get(`/api/colleges/${selected.id}/syllabus`).then(r => setSyllabi(r.data)).catch(() => {}),
      api.get(`/api/colleges/${selected.id}/past-questions`).then(r => setPastQuestions(r.data)).catch(() => {}),
    ]).finally(() => setLoadingContent(false))
  }, [selected])

  // Group past questions by year
  const pqByYear = pastQuestions.reduce<Record<number, PastQuestionEntry[]>>((acc, pq) => {
    acc[pq.year] = acc[pq.year] ?? []
    acc[pq.year].push(pq)
    return acc
  }, {})

  return (
    <div className="flex h-full overflow-hidden">
      {/* College list */}
      <aside className="w-60 flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-indigo-600" />
            <span className="text-sm font-semibold text-gray-900">Colleges</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {loadingColleges ? (
            <p className="px-4 py-3 text-sm text-gray-400">Loading...</p>
          ) : colleges.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400 italic">No colleges added yet.</p>
          ) : (
            colleges.map(col => (
              <button
                key={col.id}
                onClick={() => { setSelected(col); setActiveTab('syllabus') }}
                className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center justify-between ${
                  selected?.id === col.id
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div>
                  <p className="font-medium">{col.name}</p>
                  {col.location && <p className="text-xs text-gray-400 mt-0.5">{col.location}</p>}
                </div>
                {selected?.id === col.id && <ChevronRight size={14} />}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Select a college to view syllabus and past questions.
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-white">
              <h2 className="text-base font-semibold text-gray-900">{selected.name}</h2>
              {selected.location && <p className="text-xs text-gray-400 mt-0.5">{selected.location}</p>}

              {/* Tabs */}
              <div className="flex gap-1 mt-3">
                {(['syllabus', 'past-questions'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activeTab === tab
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {tab === 'syllabus' ? 'Syllabus' : 'Past Questions'}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {loadingContent ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : activeTab === 'syllabus' ? (
                syllabi.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No syllabus uploaded yet for this college.</p>
                ) : (
                  <div className="space-y-2">
                    {syllabi.map(s => (
                      <div key={s.id} className="flex items-center justify-between py-3 px-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-200 transition-colors">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{s.display_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Year {s.year}</p>
                        </div>
                        <a
                          href={s.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          View / Download <ExternalLink size={12} />
                        </a>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                Object.keys(pqByYear).length === 0 ? (
                  <p className="text-sm text-gray-400 italic">No past question papers uploaded yet for this college.</p>
                ) : (
                  <div className="space-y-5">
                    {Object.entries(pqByYear)
                      .sort(([a], [b]) => Number(b) - Number(a))
                      .map(([year, papers]) => (
                        <div key={year}>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{year}</p>
                          <div className="space-y-2">
                            {papers.map((pq, i) => (
                              <div key={pq.id} className="flex items-center justify-between py-3 px-4 bg-white border border-gray-200 rounded-lg hover:border-indigo-200 transition-colors">
                                <p className="text-sm text-gray-800">Question Paper {papers.length > 1 ? i + 1 : ''}</p>
                                <a
                                  href={pq.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                                >
                                  Download <ExternalLink size={12} />
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
