import { useEffect, useState } from 'react'
import { BookOpen, ExternalLink, ChevronRight, FileText } from 'lucide-react'
import api from '../../lib/api'
import DarkSkeleton from '../components/DarkSkeleton'

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

  const pqByYear = pastQuestions.reduce<Record<number, PastQuestionEntry[]>>((acc, pq) => {
    acc[pq.year] = acc[pq.year] ?? []
    acc[pq.year].push(pq)
    return acc
  }, {})

  return (
    <div className="flex h-full overflow-hidden bg-study-bg">
      {/* College list */}
      <aside className="w-60 flex-shrink-0 bg-study-surface border-r border-white/[0.06] flex flex-col overflow-hidden">
        <div className="px-4 py-4 border-b border-white/[0.05]">
          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-indigo-400" />
            <span className="text-sm font-semibold text-slate-300">Colleges</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2 dark-scrollbar">
          {loadingColleges ? (
            <div className="px-3 py-2 space-y-2">
              {[1, 2, 3, 4].map(i => <DarkSkeleton key={i} className="h-10 w-full" variant="block" />)}
            </div>
          ) : colleges.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500 italic">No colleges added yet.</p>
          ) : (
            colleges.map(col => (
              <button
                key={col.id}
                onClick={() => { setSelected(col); setActiveTab('syllabus') }}
                className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center justify-between border-l-2 ${
                  selected?.id === col.id
                    ? 'bg-indigo-600/15 text-indigo-400 border-indigo-500 pl-[14px]'
                    : 'text-slate-400 hover:bg-study-hover hover:text-slate-200 border-transparent pl-[14px]'
                }`}
              >
                <div>
                  <p className="font-medium text-xs">{col.name}</p>
                  {col.location && <p className="text-[10px] text-slate-600 mt-0.5">{col.location}</p>}
                </div>
                {selected?.id === col.id && <ChevronRight size={13} className="flex-shrink-0" />}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-14 h-14 rounded-2xl bg-study-elevated flex items-center justify-center">
              <BookOpen size={26} className="text-slate-600" />
            </div>
            <p className="text-sm text-slate-500">Select a college to view syllabus and past questions.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-white/[0.06] bg-study-surface flex-shrink-0">
              <h2 className="text-sm font-semibold text-slate-200">{selected.name}</h2>
              {selected.location && <p className="text-xs text-slate-500 mt-0.5">{selected.location}</p>}

              <div className="flex gap-1 mt-3">
                {(['syllabus', 'past-questions'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activeTab === tab
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-study-hover'
                    }`}
                  >
                    {tab === 'syllabus' ? 'Syllabus' : 'Past Questions'}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 dark-scrollbar">
              {loadingContent ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <DarkSkeleton key={i} className="h-14 w-full" variant="block" />)}
                </div>
              ) : activeTab === 'syllabus' ? (
                syllabi.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <FileText size={28} className="text-slate-700" />
                    <p className="text-sm text-slate-500 italic">No syllabus uploaded yet for this college.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {syllabi.map(s => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between py-3 px-4 bg-study-card border border-white/[0.07] rounded-xl hover:border-indigo-500/20 transition-colors"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-300">{s.display_name}</p>
                          <p className="text-xs text-slate-600 mt-0.5">Year {s.year}</p>
                        </div>
                        <a
                          href={s.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                        >
                          View / Download <ExternalLink size={11} />
                        </a>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                Object.keys(pqByYear).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <FileText size={28} className="text-slate-700" />
                    <p className="text-sm text-slate-500 italic">No past question papers uploaded yet for this college.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(pqByYear)
                      .sort(([a], [b]) => Number(b) - Number(a))
                      .map(([year, papers]) => (
                        <div key={year}>
                          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">{year}</p>
                          <div className="space-y-2">
                            {papers.map((pq, i) => (
                              <div
                                key={pq.id}
                                className="flex items-center justify-between py-3 px-4 bg-study-card border border-white/[0.07] rounded-xl hover:border-indigo-500/20 transition-colors"
                              >
                                <p className="text-sm text-slate-300">
                                  Question Paper {papers.length > 1 ? i + 1 : ''}
                                </p>
                                <a
                                  href={pq.file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                                >
                                  Download <ExternalLink size={11} />
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
