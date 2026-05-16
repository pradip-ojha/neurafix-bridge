import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { ChevronRight, Clock, Send, RotateCcw, MessageSquare, X, CheckCircle, XCircle, BookOpen, Layers, PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import { motion } from 'framer-motion'
import { useSubjectChapters } from '../hooks/useSubjectChapters'
import AIThinkingState from './AIThinkingState'
import MarkdownRenderer from './MarkdownRenderer'
import DarkSkeleton from './DarkSkeleton'
import { useMobileLayout } from '../../contexts/MobileLayoutContext'
import api from '../../lib/api'

interface Question {
  question_id: string
  question_text: string
  options: { id: string; text: string }[]
  difficulty: string
  topic?: string
  [key: string]: unknown
}

interface QuestionResult {
  correct: boolean
  student_answer: string | null
  correct_option_ids: string[]
  explanation: string
  common_mistakes: Record<string, string>
  topic: string
  difficulty: string
  question_data: Question
}

interface ScoreData {
  score: number
  total: number
  results: Record<string, QuestionResult>
  topic_correct: Record<string, number>
  topic_wrong: Record<string, number>
}

interface HistorySummary {
  id: string
  subject: string
  chapter: string
  session_date: string
  total_questions: number
  correct_count: number
  incorrect_count: number
  summary_content: string
  created_at: string
}

interface FollowupMessage { role: 'user' | 'assistant'; content: string }

type View = 'setup' | 'session' | 'results' | 'followup'
type PracticeMode = 'subject' | 'chapter'

const WHOLE_SUBJECT = '__all__'

interface Props { subject: string }

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })

function chapterLabel(chapter: string, chapters: { id: string; display_name: string }[]) {
  if (chapter === WHOLE_SUBJECT) return 'Whole Subject'
  return chapters.find((c) => c.id === chapter)?.display_name || chapter
}

export default function PracticeTab({ subject }: Props) {
  const [mode, setMode]                     = useState<PracticeMode>('chapter')
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)
  const [view, setView]                     = useState<View>('setup')
  const [sidebarOpen, setSidebarOpen]       = useState(window.innerWidth >= 768)
  const { mainSidebarOpen } = useMobileLayout()

  const [count, setCount]                   = useState(10)
  const [timerEnabled, setTimerEnabled]     = useState(false)
  const [optionalMessage, setOptionalMessage] = useState('')

  const [sessionId, setSessionId]           = useState<string | null>(null)
  const [questions, setQuestions]           = useState<Question[]>([])
  const [answers, setAnswers]               = useState<Record<string, string>>({})
  const [currentIdx, setCurrentIdx]         = useState(0)
  const [timeLeft, setTimeLeft]             = useState<number | null>(null)
  const [timingConfig, setTimingConfig]     = useState<Record<string, number>>({})
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [scoreData, setScoreData]           = useState<ScoreData | null>(null)

  const [followupMessages, setFollowupMessages] = useState<FollowupMessage[]>([])
  const [followupInput, setFollowupInput]   = useState('')
  const [isStreaming, setIsStreaming]       = useState(false)
  const [streamingText, setStreamingText]  = useState('')
  const followupEndRef = useRef<HTMLDivElement>(null)

  const [history, setHistory]               = useState<HistorySummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [starting, setStarting]             = useState(false)
  const [submitting, setSubmitting]         = useState(false)
  const [closing, setClosing]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  const { chapters } = useSubjectChapters(subject)
  const canStart = mode === 'subject' || (mode === 'chapter' && selectedChapter !== null)
  const apiChapter = mode === 'subject' ? null : selectedChapter
  const selectionLabel = mode === 'subject' ? 'Whole Subject' : selectedChapter ? chapterLabel(selectedChapter, chapters) : null

  useEffect(() => {
    if (mainSidebarOpen && window.innerWidth < 768) setSidebarOpen(false)
  }, [mainSidebarOpen])

  useEffect(() => {
    api.get(`/api/config/subject-timing?subject=${subject}`)
      .then((res) => {
        const data = res.data
        if (data?.timing) {
          const map: Record<string, number> = {}
          for (const t of data.timing) map[t.difficulty] = t.seconds_per_question
          setTimingConfig(map)
        }
      }).catch(() => {})
  }, [subject])

  useEffect(() => {
    if (!canStart) return
    setHistoryLoading(true)
    const params = new URLSearchParams({ subject })
    if (mode === 'chapter' && selectedChapter) params.set('chapter', selectedChapter)
    else if (mode === 'subject') params.set('chapter', WHOLE_SUBJECT)
    api.get(`/api/practice/history?${params}`)
      .then((res) => setHistory(res.data))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
  }, [mode, selectedChapter, subject, canStart])

  useEffect(() => {
    followupEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [followupMessages, streamingText])

  useEffect(() => {
    if (!timerEnabled || view !== 'session' || questions.length === 0) return
    const q = questions[currentIdx]
    const seconds = timingConfig[q.difficulty] ?? 72
    setTimeLeft(seconds)
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!)
          setCurrentIdx((i) => Math.min(i + 1, questions.length - 1))
          return null
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [currentIdx, view, timerEnabled, questions, timingConfig])

  const resetToSetup = () => {
    setView('setup'); setSessionId(null); setQuestions([]); setAnswers({})
    setCurrentIdx(0); setScoreData(null); setFollowupMessages([]); setStreamingText(''); setError(null)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const selectMode = (m: PracticeMode) => {
    setMode(m)
    if (m === 'subject') setSelectedChapter(null)
    if (view !== 'setup') resetToSetup()
  }

  const selectChapter = (chId: string) => {
    setMode('chapter'); setSelectedChapter(chId)
    if (view !== 'setup') resetToSetup()
  }

  const startPractice = async () => {
    if (!canStart) return
    setStarting(true); setError(null)
    try {
      const res = await api.post('/api/practice/start', { subject, chapter: apiChapter, count, timer_enabled: timerEnabled, optional_message: optionalMessage || null })
      const data = res.data
      setSessionId(data.session_id); setQuestions(data.questions); setCurrentIdx(0); setAnswers({}); setView('session')
    } catch (e: any) {
      if (e?.response?.status === 429) setError("You've reached today's practice limit. Upgrade to paid for more access: /student/payment")
      else setError(e?.response?.data?.detail || 'Something went wrong')
    } finally { setStarting(false) }
  }

  const submitPractice = async () => {
    if (!sessionId) return
    setSubmitting(true); setError(null)
    if (timerRef.current) clearInterval(timerRef.current)
    try {
      const res = await api.post('/api/practice/submit', { session_id: sessionId, answers })
      setScoreData(res.data); setView('results')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Submit failed')
    } finally { setSubmitting(false) }
  }

  const closePractice = async () => {
    if (!sessionId) return resetToSetup()
    setClosing(true)
    try {
      await api.post('/api/practice/close', { session_id: sessionId })
      const params = new URLSearchParams({ subject })
      if (mode === 'chapter' && selectedChapter) params.set('chapter', selectedChapter)
      else if (mode === 'subject') params.set('chapter', WHOLE_SUBJECT)
      api.get(`/api/practice/history?${params}`).then((res) => setHistory(res.data)).catch(() => {})
    } catch {} finally { setClosing(false); resetToSetup() }
  }

  const sendFollowup = async () => {
    const text = followupInput.trim()
    if (!text || isStreaming || !sessionId) return
    setFollowupInput('')
    setFollowupMessages((prev) => [...prev, { role: 'user', content: text }])
    setIsStreaming(true); setStreamingText('')

    const doFetch = (t: string) => fetch('/api/practice/followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ session_id: sessionId, message: text, session_history: followupMessages }),
    })

    try {
      let res = await doFetch(localStorage.getItem('token') ?? '')

      if (res.status === 401) {
        try {
          const r = await api.post('/api/auth/refresh', { refresh_token: localStorage.getItem('refresh_token') })
          localStorage.setItem('token', r.data.access_token)
          if (r.data.refresh_token) localStorage.setItem('refresh_token', r.data.refresh_token)
          res = await doFetch(r.data.access_token)
        } catch {
          window.location.href = '/login'
          setIsStreaming(false)
          return
        }
      }

      if (res.status === 429) {
        setFollowupMessages((prev) => [...prev, { role: 'assistant', content: "You've reached today's limit for this feature. Upgrade to paid for more access: /student/payment" }])
        setStreamingText(''); return
      }
      if (!res.ok || !res.body) {
        setFollowupMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }])
        setStreamingText(''); return
      }
      const reader = res.body.getReader(); const decoder = new TextDecoder()
      let accumulated = ''; let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const d = JSON.parse(line.slice(6))
            if (d.chunk) { accumulated += d.chunk; setStreamingText(accumulated) }
            if (d.done) { setFollowupMessages((prev) => [...prev, { role: 'assistant', content: d.full_text || accumulated }]); setStreamingText('') }
          } catch {}
        }
      }
    } catch {
      setFollowupMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong.' }])
      setStreamingText('')
    } finally { setIsStreaming(false) }
  }

  const handleFollowupKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFollowup() }
  }

  const pct = scoreData ? Math.round((scoreData.score / scoreData.total) * 100) : 0

  return (
    <div className="flex h-full overflow-hidden relative bg-study-bg">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-10 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Chapter sidebar */}
      <div className={`flex-shrink-0 bg-study-surface border-r border-white/[0.06] flex flex-col overflow-hidden transition-all duration-200 md:relative ${sidebarOpen ? 'w-52 fixed md:relative inset-y-0 left-0 z-20 md:z-auto' : 'w-0'}`}>
        <div className="w-52 p-3 border-b border-white/[0.05] space-y-1">
          <button
            onClick={() => selectMode('subject')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${mode === 'subject' ? 'bg-indigo-600 text-white font-medium' : 'text-slate-400 hover:bg-study-hover hover:text-slate-200 border border-white/[0.07]'}`}
          >
            <Layers size={15} className="flex-shrink-0" />Whole Subject
          </button>
          <button
            onClick={() => selectMode('chapter')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${mode === 'chapter' ? 'text-slate-200 bg-study-hover border border-indigo-500/20' : 'text-slate-500 hover:bg-study-hover hover:text-slate-300'}`}
          >
            <BookOpen size={15} className="flex-shrink-0" />By Chapter
          </button>
        </div>

        <div className="w-52 flex-1 overflow-y-auto py-2 dark-scrollbar">
          {mode === 'chapter' && chapters.map((ch) => (
            <button
              key={ch.id}
              onClick={() => selectChapter(ch.id)}
              className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition-colors ${
                selectedChapter === ch.id
                  ? 'bg-indigo-600/15 text-indigo-400 border-l-2 border-indigo-500 pl-[14px]'
                  : 'text-slate-400 hover:bg-study-hover hover:text-slate-200 border-l-2 border-transparent pl-[14px]'
              }`}
            >
              <span className="truncate">{ch.display_name}</span>
              {selectedChapter === ch.id && <ChevronRight size={12} className="flex-shrink-0" />}
            </button>
          ))}
          {mode === 'subject' && (
            <p className="text-xs text-slate-500 px-4 py-3 leading-relaxed">Questions drawn from all chapters.</p>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto min-w-0 dark-scrollbar">
        <div className="sticky top-0 z-10 bg-study-surface border-b border-white/[0.06] px-3 py-1.5 flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-study-hover flex-shrink-0 transition-colors"
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
        </div>

        {mode === 'chapter' && !selectedChapter && view === 'setup' && (
          <div className="flex items-center justify-center h-[calc(100%-40px)]">
            <div className="text-center">
              <BookOpen size={32} className="text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Select a chapter from the sidebar to begin.</p>
            </div>
          </div>
        )}

        {canStart && view === 'setup' && (
          <SetupView
            label={selectionLabel || ''} isWholeSubject={mode === 'subject'}
            count={count} setCount={setCount}
            timerEnabled={timerEnabled} setTimerEnabled={setTimerEnabled}
            optionalMessage={optionalMessage} setOptionalMessage={setOptionalMessage}
            onStart={startPractice} starting={starting} error={error}
            history={history} historyLoading={historyLoading} allChapters={chapters}
          />
        )}

        {view === 'session' && questions.length > 0 && (
          <SessionView
            questions={questions} currentIdx={currentIdx} setCurrentIdx={setCurrentIdx}
            answers={answers} setAnswers={setAnswers}
            timerEnabled={timerEnabled} timeLeft={timeLeft}
            onSubmit={submitPractice} submitting={submitting} error={error}
          />
        )}

        {view === 'results' && scoreData && (
          <ResultsView
            scoreData={scoreData} questions={questions} pct={pct}
            onFollowup={() => setView('followup')}
            onClose={closePractice} closing={closing} allChapters={chapters}
          />
        )}

        {view === 'followup' && scoreData && (
          <FollowupView
            messages={followupMessages} streamingText={streamingText} isStreaming={isStreaming}
            input={followupInput} setInput={setFollowupInput}
            onSend={sendFollowup} onKey={handleFollowupKey}
            onBack={() => setView('results')} onClose={closePractice} closing={closing}
            endRef={followupEndRef}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function SetupView({
  label, isWholeSubject, count, setCount, timerEnabled, setTimerEnabled,
  optionalMessage, setOptionalMessage, onStart, starting, error,
  history, historyLoading, allChapters,
}: {
  label: string; isWholeSubject: boolean
  count: number; setCount: (n: number) => void
  timerEnabled: boolean; setTimerEnabled: (b: boolean) => void
  optionalMessage: string; setOptionalMessage: (s: string) => void
  onStart: () => void; starting: boolean; error: string | null
  history: HistorySummary[]; historyLoading: boolean
  allChapters: { id: string; display_name: string }[]
}) {
  return (
    <div className="max-w-lg mx-auto py-8 px-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-100 tracking-tight">{label}</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {isWholeSubject ? 'Mixed questions from all chapters' : 'Configure your practice session'}
        </p>
      </div>

      <div className="bg-study-card border border-white/[0.07] rounded-2xl p-5 space-y-5">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-slate-300">Questions</label>
            <span className="text-sm font-bold text-indigo-400">{count}</span>
          </div>
          <input
            type="range" min={5} max={30} step={5} value={Math.min(count, 30)}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full accent-indigo-600 h-1.5"
          />
          <div className="flex justify-between text-xs text-slate-600 mt-1">
            <span>5</span><span>30</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-300">Timer per question</p>
            <p className="text-xs text-slate-500">Time limit based on difficulty</p>
          </div>
          <button
            onClick={() => setTimerEnabled(!timerEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${timerEnabled ? 'bg-indigo-600' : 'bg-study-elevated'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${timerEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div>
          <label className="text-sm font-medium text-slate-300 block mb-1">
            Focus instruction <span className="text-slate-600 font-normal">(optional)</span>
          </label>
          <textarea
            value={optionalMessage}
            onChange={(e) => setOptionalMessage(e.target.value)}
            placeholder='e.g. "focus on hard questions only"'
            rows={2}
            className="w-full text-sm bg-study-surface border border-white/[0.1] text-slate-300 placeholder-slate-600 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500/40 resize-none"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>}

      <button
        onClick={onStart} disabled={starting}
        className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
      >
        {starting ? 'Starting…' : 'Start Practice'}
      </button>

      {(history.length > 0 || historyLoading) && (
        <div>
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Past Sessions</h3>
          {historyLoading && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <DarkSkeleton key={i} className="h-16" variant="block" />)}
            </div>
          )}
          <div className="space-y-2">
            {history.map((h) => {
              const pctH = Math.round((h.correct_count / h.total_questions) * 100)
              return (
                <div key={h.id} className="bg-study-card border border-white/[0.07] rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{h.session_date}</span>
                      {h.chapter === WHOLE_SUBJECT && (
                        <span className="text-xs bg-indigo-600/15 text-indigo-400 px-1.5 py-0.5 rounded-full">Whole Subject</span>
                      )}
                      {h.chapter !== WHOLE_SUBJECT && (
                        <span className="text-xs text-slate-500">{allChapters.find((c) => c.id === h.chapter)?.display_name || h.chapter}</span>
                      )}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      pctH >= 70 ? 'bg-green-500/15 text-green-400'
                      : pctH >= 50 ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-red-500/15 text-red-400'
                    }`}>
                      {h.correct_count}/{h.total_questions}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{h.summary_content}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function SessionView({
  questions, currentIdx, setCurrentIdx, answers, setAnswers,
  timerEnabled, timeLeft, onSubmit, submitting, error,
}: {
  questions: Question[]; currentIdx: number; setCurrentIdx: (n: number) => void
  answers: Record<string, string>; setAnswers: (a: Record<string, string>) => void
  timerEnabled: boolean; timeLeft: number | null
  onSubmit: () => void; submitting: boolean; error: string | null
}) {
  const q = questions[currentIdx]
  const answered = Object.keys(answers).length
  const isLast = currentIdx === questions.length - 1

  return (
    <div className="max-w-2xl mx-auto py-6 px-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-400">Question {currentIdx + 1} of {questions.length}</span>
        <div className="flex items-center gap-3">
          {timerEnabled && timeLeft !== null && (
            <span className={`flex items-center gap-1 text-sm font-medium ${timeLeft <= 10 ? 'text-red-400' : timeLeft <= 20 ? 'text-amber-400' : 'text-slate-400'}`}>
              <Clock size={14} />{timeLeft}s
            </span>
          )}
          <span className="text-xs text-slate-500">{answered}/{questions.length} answered</span>
        </div>
      </div>

      <div className="w-full bg-study-elevated rounded-full h-1 mb-4">
        <motion.div
          className="bg-indigo-600 h-1 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {timerEnabled && timeLeft !== null && (
        <div className="w-full bg-study-elevated rounded-full h-0.5 mb-4">
          <div
            className={`h-0.5 rounded-full transition-all ${timeLeft <= 10 ? 'bg-red-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min((timeLeft / 72) * 100, 100)}%` }}
          />
        </div>
      )}

      <div className="bg-study-card border border-white/[0.07] rounded-2xl p-6 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            q.difficulty === 'easy'   ? 'bg-green-500/15 text-green-400'
            : q.difficulty === 'medium' ? 'bg-amber-500/15 text-amber-400'
            : 'bg-red-500/15 text-red-400'
          }`}>{q.difficulty}</span>
          {q.topic && <span className="text-xs text-slate-500">{q.topic}</span>}
        </div>

        <div className="text-sm text-slate-200 font-medium leading-relaxed mb-5">
          <MarkdownRenderer content={q.question_text} compact />
        </div>

        <div className="space-y-2.5">
          {q.options.map((opt) => {
            const selected = answers[q.question_id] === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => setAnswers({ ...answers, [q.question_id]: opt.id })}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-colors ${
                  selected
                    ? 'border-indigo-500/50 bg-indigo-600/10 text-slate-100'
                    : 'border-white/[0.07] bg-study-elevated hover:border-indigo-500/25 hover:bg-indigo-600/5 text-slate-300'
                }`}
              >
                <span className={`w-6 h-6 flex-shrink-0 rounded-full border text-xs font-semibold flex items-center justify-center ${
                  selected ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-white/20 text-slate-500'
                }`}>{opt.id}</span>
                <MarkdownRenderer content={opt.text} compact />
              </button>
            )
          })}
        </div>
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0}
          className="px-4 py-2 text-sm text-slate-400 border border-white/[0.07] rounded-xl hover:bg-study-hover disabled:opacity-40 transition-colors"
        >Previous</button>

        <div className="flex gap-1 flex-wrap justify-center max-w-xs">
          {questions.map((qq, i) => (
            <button
              key={i} onClick={() => setCurrentIdx(i)}
              className={`w-6 h-6 rounded-full text-xs font-medium transition-colors ${
                i === currentIdx ? 'bg-indigo-600 text-white'
                : answers[qq.question_id] ? 'bg-green-500/70 text-white'
                : 'bg-study-elevated text-slate-500 hover:bg-study-hover'
              }`}
            >{i + 1}</button>
          ))}
        </div>

        {isLast ? (
          <button onClick={onSubmit} disabled={submitting} className="px-5 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-colors">
            {submitting ? 'Submitting…' : 'Submit All'}
          </button>
        ) : (
          <button onClick={() => setCurrentIdx(Math.min(questions.length - 1, currentIdx + 1))} className="px-4 py-2 text-sm text-slate-400 border border-white/[0.07] rounded-xl hover:bg-study-hover transition-colors">Next</button>
        )}
      </div>

      {!isLast && (
        <div className="mt-6 pt-4 border-t border-white/[0.05] text-center">
          <button onClick={onSubmit} disabled={submitting} className="px-6 py-2 text-sm font-semibold text-indigo-400 border border-indigo-500/30 rounded-xl hover:bg-indigo-600/10 disabled:opacity-50 transition-colors">
            {submitting ? 'Submitting…' : `Submit (${answered}/${questions.length} answered)`}
          </button>
        </div>
      )}
    </div>
  )
}

function ResultsView({
  scoreData, questions, pct, onFollowup, onClose, closing, allChapters,
}: {
  scoreData: ScoreData; questions: Question[]; pct: number
  onFollowup: () => void; onClose: () => void; closing: boolean
  allChapters: { id: string; display_name: string }[]
}) {
  const [expandedQ, setExpandedQ] = useState<string | null>(null)

  const wrongByChapter: Record<string, number> = {}
  for (const r of Object.values(scoreData.results)) {
    if (!r.correct) {
      const ch = (r.question_data as { chapter?: string })?.chapter || 'unknown'
      wrongByChapter[ch] = (wrongByChapter[ch] || 0) + 1
    }
  }
  const isWholeSubject = Object.keys(wrongByChapter).length > 1

  const scoreColor = pct >= 70 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'
  const barColor   = pct >= 70 ? 'bg-green-500'  : pct >= 50 ? 'bg-amber-500'  : 'bg-red-500'

  return (
    <div className="max-w-2xl mx-auto py-6 px-6 space-y-5">
      <div className="bg-study-card border border-white/[0.07] rounded-2xl p-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1,   opacity: 1 }}
          transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
          className={`text-5xl font-bold mb-1 ${scoreColor}`}
        >
          {pct}%
        </motion.div>
        <p className="text-slate-500 text-sm">{scoreData.score} out of {scoreData.total} correct</p>
        <div className="w-full bg-study-elevated rounded-full h-2.5 mt-4">
          <motion.div
            className={`h-2.5 rounded-full ${barColor}`}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, delay: 0.2 }}
          />
        </div>
      </div>

      {Object.keys(scoreData.topic_wrong).length > 0 && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
          <p className="text-xs font-semibold text-red-400 mb-2">Needs improvement</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(scoreData.topic_wrong).sort((a, b) => b[1] - a[1]).map(([topic, cnt]) => (
              <span key={topic} className="text-xs bg-red-600/10 text-red-400 px-2.5 py-0.5 rounded-full border border-red-500/20">
                {topic} ({cnt} wrong)
              </span>
            ))}
          </div>
        </div>
      )}

      {isWholeSubject && Object.keys(wrongByChapter).length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
          <p className="text-xs font-semibold text-amber-400 mb-2">Wrong answers by chapter</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(wrongByChapter).sort((a, b) => b[1] - a[1]).map(([ch, cnt]) => (
              <span key={ch} className="text-xs bg-amber-600/10 text-amber-400 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                {allChapters.find((c) => c.id === ch)?.display_name || ch} ({cnt})
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {questions.map((q, i) => {
          const r = scoreData.results[q.question_id]
          if (!r) return null
          const expanded = expandedQ === q.question_id
          return (
            <div key={q.question_id} className="bg-study-card border border-white/[0.07] rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedQ(expanded ? null : q.question_id)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-study-hover transition-colors"
              >
                {r.correct
                  ? <CheckCircle size={15} className="text-green-500 flex-shrink-0" />
                  : <XCircle size={15} className="text-red-500 flex-shrink-0" />}
                <span className="text-sm text-slate-300 flex-1 truncate">Q{i + 1}. {q.question_text}</span>
                <ChevronRight size={13} className={`text-slate-600 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </button>

              {expanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/[0.05] pt-3">
                  <div className="text-sm text-slate-200 font-medium leading-relaxed">
                    <MarkdownRenderer content={q.question_text} compact />
                  </div>
                  <div className="space-y-1.5">
                    {q.options.map((opt) => {
                      const isCorrect  = r.correct_option_ids.includes(opt.id)
                      const isStudent  = r.student_answer === opt.id
                      return (
                        <div key={opt.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border ${
                          isCorrect ? 'border-green-500/30 bg-green-600/10 text-green-300'
                          : isStudent && !isCorrect ? 'border-red-500/30 bg-red-600/10 text-red-300'
                          : 'border-transparent text-slate-500'
                        }`}>
                          <span className="font-medium w-5">{opt.id}.</span>
                          <span className="flex-1"><MarkdownRenderer content={opt.text} compact /></span>
                          {isCorrect  && <span className="text-xs font-medium text-green-400">Correct</span>}
                          {isStudent && !isCorrect && <span className="text-xs font-medium text-red-400">Your answer</span>}
                        </div>
                      )
                    })}
                  </div>

                  {r.explanation && (
                    <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-xl p-3">
                      <p className="text-xs font-semibold text-indigo-400 mb-1">Explanation</p>
                      <div className="text-xs text-slate-300"><MarkdownRenderer content={r.explanation} compact /></div>
                    </div>
                  )}

                  {!r.correct && r.student_answer && r.common_mistakes[r.student_answer] && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                      <p className="text-xs font-semibold text-amber-400 mb-1">Why students pick this</p>
                      <div className="text-xs text-slate-300"><MarkdownRenderer content={r.common_mistakes[r.student_answer]} compact /></div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-3 pt-2 pb-6">
        <button
          onClick={onClose} disabled={closing}
          className="flex-1 py-2.5 text-sm text-slate-400 border border-white/[0.07] rounded-xl hover:bg-study-hover disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
        >
          <RotateCcw size={14} />{closing ? 'Closing…' : 'New Practice'}
        </button>
        <button
          onClick={onFollowup}
          className="flex-1 py-2.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <MessageSquare size={14} />Follow Up
        </button>
      </div>
    </div>
  )
}

function FollowupView({
  messages, streamingText, isStreaming, input, setInput, onSend, onKey,
  onBack, onClose, closing, endRef,
}: {
  messages: FollowupMessage[]; streamingText: string; isStreaming: boolean
  input: string; setInput: (s: string) => void
  onSend: () => void; onKey: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  onBack: () => void; onClose: () => void; closing: boolean
  endRef: React.RefObject<HTMLDivElement>
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="bg-study-surface border-b border-white/[0.06] px-5 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={onBack} className="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
          ← Back to Results
        </button>
        <span className="text-sm text-slate-400 font-medium">Follow-up Chat</span>
        <button onClick={onClose} disabled={closing} className="flex items-center gap-1 text-sm text-slate-500 hover:text-red-400 disabled:opacity-50 transition-colors">
          <X size={14} />{closing ? 'Closing…' : 'Close'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 dark-scrollbar">
        {messages.length === 0 && !streamingText && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-slate-500">Ask anything about the questions or answers from this session.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex animate-fade-in-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
              <div className="max-w-[75%] bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">{msg.content}</div>
            ) : (
              <div className="max-w-[85%] bg-study-card border border-white/[0.07] rounded-2xl rounded-bl-sm px-5 py-4">
                <MarkdownRenderer content={msg.content} />
              </div>
            )}
          </div>
        ))}
        {streamingText && (
          <div className="flex justify-start animate-fade-in-up">
            <div className="max-w-[85%] bg-study-card border border-white/[0.07] rounded-2xl rounded-bl-sm px-5 py-4">
              <MarkdownRenderer content={streamingText} />
              <span className="inline-block w-1.5 h-3.5 bg-indigo-400 ml-1 animate-blink rounded-sm align-middle" />
            </div>
          </div>
        )}
        {isStreaming && !streamingText && <div className="flex justify-start"><AIThinkingState /></div>}
        <div ref={endRef} />
      </div>

      <div className="bg-study-surface border-t border-white/[0.06] px-4 py-3 flex-shrink-0">
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-study-card border border-white/[0.1] rounded-xl px-4 py-2.5 focus-within:border-indigo-500/40 focus-within:ring-1 focus-within:ring-indigo-500/10 transition-all">
            <textarea
              value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
              disabled={isStreaming} placeholder="Ask about a question or concept…"
              rows={1}
              className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none disabled:opacity-60 max-h-32"
            />
          </div>
          <button
            onClick={onSend} disabled={!input.trim() || isStreaming}
            className="flex-shrink-0 p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          ><Send size={16} /></button>
        </div>
      </div>
    </div>
  )
}
