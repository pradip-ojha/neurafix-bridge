import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { ChevronRight, Clock, Send, RotateCcw, MessageSquare, X, CheckCircle, XCircle, BookOpen, Layers } from 'lucide-react'
import { SUBJECT_CHAPTERS } from '../constants/subjectStructure'

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

interface FollowupMessage {
  role: 'user' | 'assistant'
  content: string
}

type View = 'setup' | 'session' | 'results' | 'followup'
type PracticeMode = 'subject' | 'chapter'

const WHOLE_SUBJECT = '__all__'

interface Props {
  subject: string
}

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })

function chapterLabel(chapter: string, chapters: { id: string; display_name: string }[]) {
  if (chapter === WHOLE_SUBJECT) return 'Whole Subject'
  return chapters.find((c) => c.id === chapter)?.display_name || chapter
}

export default function PracticeTab({ subject }: Props) {
  const [mode, setMode] = useState<PracticeMode>('chapter')
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null)
  const [view, setView] = useState<View>('setup')

  // Setup config
  const [count, setCount] = useState(10)
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [optionalMessage, setOptionalMessage] = useState('')

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [timingConfig, setTimingConfig] = useState<Record<string, number>>({})
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Results state
  const [scoreData, setScoreData] = useState<ScoreData | null>(null)

  // Follow-up state
  const [followupMessages, setFollowupMessages] = useState<FollowupMessage[]>([])
  const [followupInput, setFollowupInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const followupEndRef = useRef<HTMLDivElement>(null)

  // History
  const [history, setHistory] = useState<HistorySummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // UI state
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chapters = SUBJECT_CHAPTERS[subject] || []

  // Whether the setup is ready to start
  const canStart = mode === 'subject' || (mode === 'chapter' && selectedChapter !== null)

  // The chapter value sent to the API (null for whole-subject)
  const apiChapter = mode === 'subject' ? null : selectedChapter

  // Display label for current selection
  const selectionLabel =
    mode === 'subject'
      ? 'Whole Subject'
      : selectedChapter
      ? chapterLabel(selectedChapter, chapters)
      : null

  // Fetch timing config once
  useEffect(() => {
    fetch(`/api/config/subject-timing?subject=${subject}`, { headers: authHeader() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.timing) {
          const map: Record<string, number> = {}
          for (const t of data.timing) map[t.difficulty] = t.seconds_per_question
          setTimingConfig(map)
        }
      })
      .catch(() => {})
  }, [subject])

  // Fetch history when selection changes
  useEffect(() => {
    if (!canStart) return
    setHistoryLoading(true)
    const params = new URLSearchParams({ subject })
    if (mode === 'chapter' && selectedChapter) params.set('chapter', selectedChapter)
    else if (mode === 'subject') params.set('chapter', WHOLE_SUBJECT)
    fetch(`/api/practice/history?${params}`, { headers: authHeader() })
      .then((r) => (r.ok ? r.json() : []))
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false))
  }, [mode, selectedChapter, subject, canStart])

  // Scroll follow-up to bottom
  useEffect(() => {
    followupEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [followupMessages, streamingText])

  // Timer logic
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
    setView('setup')
    setSessionId(null)
    setQuestions([])
    setAnswers({})
    setCurrentIdx(0)
    setScoreData(null)
    setFollowupMessages([])
    setStreamingText('')
    setError(null)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const selectMode = (m: PracticeMode) => {
    setMode(m)
    if (m === 'subject') setSelectedChapter(null)
    if (view !== 'setup') resetToSetup()
  }

  const selectChapter = (chId: string) => {
    setMode('chapter')
    setSelectedChapter(chId)
    if (view !== 'setup') resetToSetup()
  }

  const startPractice = async () => {
    if (!canStart) return
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/practice/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          subject,
          chapter: apiChapter,
          count,
          timer_enabled: timerEnabled,
          optional_message: optionalMessage || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to start practice')
      setSessionId(data.session_id)
      setQuestions(data.questions)
      setCurrentIdx(0)
      setAnswers({})
      setView('session')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setStarting(false)
    }
  }

  const submitPractice = async () => {
    if (!sessionId) return
    setSubmitting(true)
    setError(null)
    if (timerRef.current) clearInterval(timerRef.current)
    try {
      const res = await fetch('/api/practice/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ session_id: sessionId, answers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to submit')
      setScoreData(data)
      setView('results')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  const closePractice = async () => {
    if (!sessionId) return resetToSetup()
    setClosing(true)
    try {
      await fetch('/api/practice/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ session_id: sessionId }),
      })
      // Refresh history
      const params = new URLSearchParams({ subject })
      if (mode === 'chapter' && selectedChapter) params.set('chapter', selectedChapter)
      else if (mode === 'subject') params.set('chapter', WHOLE_SUBJECT)
      fetch(`/api/practice/history?${params}`, { headers: authHeader() })
        .then((r) => (r.ok ? r.json() : []))
        .then(setHistory)
        .catch(() => {})
    } catch {} finally {
      setClosing(false)
      resetToSetup()
    }
  }

  const sendFollowup = async () => {
    const text = followupInput.trim()
    if (!text || isStreaming || !sessionId) return
    setFollowupInput('')
    setFollowupMessages((prev) => [...prev, { role: 'user', content: text }])
    setIsStreaming(true)
    setStreamingText('')

    try {
      const res = await fetch('/api/practice/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ session_id: sessionId, message: text, session_history: followupMessages }),
      })
      if (!res.body) throw new Error('No body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const d = JSON.parse(line.slice(6))
            if (d.chunk) { accumulated += d.chunk; setStreamingText(accumulated) }
            if (d.done) {
              setFollowupMessages((prev) => [...prev, { role: 'assistant', content: d.full_text || accumulated }])
              setStreamingText('')
            }
          } catch {}
        }
      }
    } catch {
      setFollowupMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }])
      setStreamingText('')
    } finally {
      setIsStreaming(false)
    }
  }

  const handleFollowupKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFollowup() }
  }

  const pct = scoreData ? Math.round((scoreData.score / scoreData.total) * 100) : 0

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        {/* Mode toggles */}
        <div className="p-3 border-b border-gray-100 space-y-1">
          <button
            onClick={() => selectMode('subject')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              mode === 'subject'
                ? 'bg-indigo-600 text-white font-medium'
                : 'text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            <Layers size={15} className="flex-shrink-0" />
            Whole Subject
          </button>
          <button
            onClick={() => selectMode('chapter')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              mode === 'chapter' && !selectedChapter
                ? 'text-gray-700 bg-gray-50 border border-indigo-200 font-medium'
                : mode === 'chapter'
                ? 'text-gray-600 hover:bg-gray-50'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <BookOpen size={15} className="flex-shrink-0" />
            By Chapter
          </button>
        </div>

        {/* Chapter list — shown when By Chapter mode */}
        <div className="flex-1 overflow-y-auto py-2">
          {mode === 'chapter' && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 pb-2">Chapters</p>
              {chapters.length === 0 && (
                <p className="text-xs text-gray-400 px-4">No chapters available.</p>
              )}
              {chapters.map((ch) => (
                <button
                  key={ch.id}
                  onClick={() => selectChapter(ch.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                    mode === 'chapter' && selectedChapter === ch.id
                      ? 'bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="truncate">{ch.display_name}</span>
                  {mode === 'chapter' && selectedChapter === ch.id && (
                    <ChevronRight size={14} className="flex-shrink-0" />
                  )}
                </button>
              ))}
            </>
          )}

          {mode === 'subject' && (
            <p className="text-xs text-gray-400 px-4 py-3 leading-relaxed">
              Questions will be drawn from all chapters of this subject.
            </p>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {/* Prompt to select chapter when in chapter mode with nothing selected */}
        {mode === 'chapter' && !selectedChapter && view === 'setup' && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm">Select a chapter from the sidebar.</p>
          </div>
        )}

        {canStart && view === 'setup' && (
          <SetupView
            label={selectionLabel || ''}
            isWholeSubject={mode === 'subject'}
            count={count}
            setCount={setCount}
            timerEnabled={timerEnabled}
            setTimerEnabled={setTimerEnabled}
            optionalMessage={optionalMessage}
            setOptionalMessage={setOptionalMessage}
            onStart={startPractice}
            starting={starting}
            error={error}
            history={history}
            historyLoading={historyLoading}
            allChapters={chapters}
          />
        )}

        {view === 'session' && questions.length > 0 && (
          <SessionView
            questions={questions}
            currentIdx={currentIdx}
            setCurrentIdx={setCurrentIdx}
            answers={answers}
            setAnswers={setAnswers}
            timerEnabled={timerEnabled}
            timeLeft={timeLeft}
            onSubmit={submitPractice}
            submitting={submitting}
            error={error}
          />
        )}

        {view === 'results' && scoreData && (
          <ResultsView
            scoreData={scoreData}
            questions={questions}
            pct={pct}
            onFollowup={() => setView('followup')}
            onClose={closePractice}
            closing={closing}
            allChapters={chapters}
          />
        )}

        {view === 'followup' && scoreData && (
          <FollowupView
            messages={followupMessages}
            streamingText={streamingText}
            isStreaming={isStreaming}
            input={followupInput}
            setInput={setFollowupInput}
            onSend={sendFollowup}
            onKey={handleFollowupKey}
            onBack={() => setView('results')}
            onClose={closePractice}
            closing={closing}
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
  label: string
  isWholeSubject: boolean
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
        <h2 className="text-lg font-semibold text-gray-900">{label}</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {isWholeSubject ? 'Mixed questions from all chapters' : 'Configure your practice session'}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
        {/* Question count */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-gray-700">Questions</label>
            <span className="text-sm font-semibold text-indigo-600">{count}</span>
          </div>
          <input
            type="range" min={5} max={50} step={5} value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>5</span><span>50</span>
          </div>
        </div>

        {/* Timer toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Timer per question</p>
            <p className="text-xs text-gray-400">Time limit based on difficulty</p>
          </div>
          <button
            onClick={() => setTimerEnabled(!timerEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${timerEnabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${timerEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Optional message */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Focus instruction <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={optionalMessage}
            onChange={(e) => setOptionalMessage(e.target.value)}
            placeholder={isWholeSubject ? 'e.g. "focus on hard questions"' : 'e.g. "focus on hard questions only"'}
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <button
        onClick={onStart}
        disabled={starting}
        className="w-full py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {starting ? 'Starting…' : 'Start Practice'}
      </button>

      {/* History */}
      {(history.length > 0 || historyLoading) && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Past Sessions</h3>
          {historyLoading && <p className="text-xs text-gray-400">Loading…</p>}
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{h.session_date}</span>
                    {h.chapter === WHOLE_SUBJECT && (
                      <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">Whole Subject</span>
                    )}
                    {h.chapter !== WHOLE_SUBJECT && (
                      <span className="text-xs text-gray-400">
                        {allChapters.find((c) => c.id === h.chapter)?.display_name || h.chapter}
                      </span>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    h.correct_count / h.total_questions >= 0.7
                      ? 'bg-green-100 text-green-700'
                      : h.correct_count / h.total_questions >= 0.5
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {h.correct_count}/{h.total_questions}
                  </span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{h.summary_content}</p>
              </div>
            ))}
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
  questions: Question[]
  currentIdx: number; setCurrentIdx: (n: number) => void
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
        <span className="text-sm text-gray-500">Question {currentIdx + 1} of {questions.length}</span>
        <div className="flex items-center gap-3">
          {timerEnabled && timeLeft !== null && (
            <span className={`flex items-center gap-1 text-sm font-medium ${timeLeft <= 10 ? 'text-red-600' : 'text-gray-600'}`}>
              <Clock size={14} />{timeLeft}s
            </span>
          )}
          <span className="text-xs text-gray-400">{answered}/{questions.length} answered</span>
        </div>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-6">
        <div
          className="bg-indigo-600 h-1.5 rounded-full transition-all"
          style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
        />
      </div>

      {timerEnabled && timeLeft !== null && (
        <div className="w-full bg-gray-100 rounded-full h-1 mb-4">
          <div
            className={`h-1 rounded-full transition-all ${timeLeft <= 10 ? 'bg-red-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min((timeLeft / 72) * 100, 100)}%` }}
          />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            q.difficulty === 'easy' ? 'bg-green-100 text-green-700'
            : q.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700'
            : 'bg-red-100 text-red-700'
          }`}>{q.difficulty}</span>
          {q.topic && <span className="text-xs text-gray-400">{q.topic}</span>}
        </div>

        <p className="text-sm text-gray-900 font-medium leading-relaxed mb-5">{q.question_text}</p>

        <div className="space-y-2.5">
          {q.options.map((opt) => {
            const selected = answers[q.question_id] === opt.id
            return (
              <button
                key={opt.id}
                onClick={() => {
                  const updated = { ...answers, [q.question_id]: opt.id }
                  setAnswers(updated)
                }}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg border text-sm transition-colors ${
                  selected
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-800 font-medium'
                    : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700'
                }`}
              >
                <span className={`w-6 h-6 flex-shrink-0 rounded-full border text-xs font-semibold flex items-center justify-center ${
                  selected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 text-gray-500'
                }`}>{opt.id}</span>
                {opt.text}
              </button>
            )
          })}
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
          disabled={currentIdx === 0}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >Previous</button>

        <div className="flex gap-1 flex-wrap justify-center max-w-xs">
          {questions.map((qq, i) => (
            <button
              key={i}
              onClick={() => setCurrentIdx(i)}
              className={`w-6 h-6 rounded-full text-xs font-medium transition-colors ${
                i === currentIdx ? 'bg-indigo-600 text-white'
                : answers[qq.question_id] ? 'bg-green-400 text-white'
                : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
              }`}
            >{i + 1}</button>
          ))}
        </div>

        {isLast ? (
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="px-5 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >{submitting ? 'Submitting…' : 'Submit All'}</button>
        ) : (
          <button
            onClick={() => setCurrentIdx(Math.min(questions.length - 1, currentIdx + 1))}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >Next</button>
        )}
      </div>

      {!isLast && (
        <div className="mt-6 pt-4 border-t border-gray-200 text-center">
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="px-6 py-2 text-sm font-semibold text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 disabled:opacity-50 transition-colors"
          >{submitting ? 'Submitting…' : `Submit (${answered}/${questions.length} answered)`}</button>
        </div>
      )}
    </div>
  )
}


function ResultsView({
  scoreData, questions, pct, onFollowup, onClose, closing, allChapters,
}: {
  scoreData: ScoreData
  questions: Question[]
  pct: number
  onFollowup: () => void
  onClose: () => void
  closing: boolean
  allChapters: { id: string; display_name: string }[]
}) {
  const [expandedQ, setExpandedQ] = useState<string | null>(null)

  // Group wrong answers by chapter when whole-subject session
  const wrongByChapter: Record<string, number> = {}
  for (const r of Object.values(scoreData.results)) {
    if (!r.correct) {
      const qData = r.question_data as { chapter?: string }
      const ch = qData?.chapter || 'unknown'
      wrongByChapter[ch] = (wrongByChapter[ch] || 0) + 1
    }
  }
  const isWholeSubject = Object.keys(wrongByChapter).length > 1

  return (
    <div className="max-w-2xl mx-auto py-6 px-6 space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <div className={`text-4xl font-bold mb-1 ${pct >= 70 ? 'text-green-600' : pct >= 50 ? 'text-yellow-500' : 'text-red-600'}`}>
          {pct}%
        </div>
        <p className="text-gray-600 text-sm">{scoreData.score} out of {scoreData.total} correct</p>
        <div className="w-full bg-gray-100 rounded-full h-3 mt-4">
          <div
            className={`h-3 rounded-full transition-all ${pct >= 70 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Weak topics */}
      {Object.keys(scoreData.topic_wrong).length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-red-700 mb-2">Needs improvement</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(scoreData.topic_wrong).sort((a, b) => b[1] - a[1]).map(([topic, cnt]) => (
              <span key={topic} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                {topic} ({cnt} wrong)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Chapter breakdown for whole-subject sessions */}
      {isWholeSubject && Object.keys(wrongByChapter).length > 0 && (
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-orange-700 mb-2">Wrong answers by chapter</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(wrongByChapter).sort((a, b) => b[1] - a[1]).map(([ch, cnt]) => (
              <span key={ch} className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                {allChapters.find((c) => c.id === ch)?.display_name || ch} ({cnt})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Questions breakdown */}
      <div className="space-y-3">
        {questions.map((q, i) => {
          const r = scoreData.results[q.question_id]
          if (!r) return null
          const expanded = expandedQ === q.question_id
          return (
            <div key={q.question_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setExpandedQ(expanded ? null : q.question_id)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-50 transition-colors"
              >
                {r.correct
                  ? <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                  : <XCircle size={16} className="text-red-500 flex-shrink-0" />}
                <span className="text-sm text-gray-700 flex-1 truncate">Q{i + 1}. {q.question_text}</span>
                <ChevronRight size={14} className={`text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </button>

              {expanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                  <div className="space-y-1.5">
                    {q.options.map((opt) => {
                      const isCorrect = r.correct_option_ids.includes(opt.id)
                      const isStudent = r.student_answer === opt.id
                      return (
                        <div key={opt.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                          isCorrect ? 'bg-green-50 border border-green-200 text-green-800'
                          : isStudent && !isCorrect ? 'bg-red-50 border border-red-200 text-red-800'
                          : 'text-gray-600'
                        }`}>
                          <span className="font-medium w-5">{opt.id}.</span>
                          <span className="flex-1">{opt.text}</span>
                          {isCorrect && <span className="text-xs font-medium text-green-600">Correct</span>}
                          {isStudent && !isCorrect && <span className="text-xs font-medium text-red-600">Your answer</span>}
                        </div>
                      )
                    })}
                  </div>

                  {r.explanation && (
                    <div className="bg-blue-50 rounded-lg p-3">
                      <p className="text-xs font-semibold text-blue-700 mb-1">Explanation</p>
                      <p className="text-sm text-blue-800">{r.explanation}</p>
                    </div>
                  )}

                  {!r.correct && r.student_answer && r.common_mistakes[r.student_answer] && (
                    <div className="bg-yellow-50 rounded-lg p-3">
                      <p className="text-xs font-semibold text-yellow-700 mb-1">Why students pick this</p>
                      <p className="text-sm text-yellow-800">{r.common_mistakes[r.student_answer]}</p>
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
          onClick={onClose}
          disabled={closing}
          className="flex-1 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
        >
          <RotateCcw size={14} />
          {closing ? 'Closing…' : 'New Practice'}
        </button>
        <button
          onClick={onFollowup}
          className="flex-1 py-2.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2 transition-colors"
        >
          <MessageSquare size={14} />
          Follow Up
        </button>
      </div>
    </div>
  )
}


function FollowupView({
  messages, streamingText, isStreaming, input, setInput, onSend, onKey,
  onBack, onClose, closing, endRef,
}: {
  messages: FollowupMessage[]
  streamingText: string; isStreaming: boolean
  input: string; setInput: (s: string) => void
  onSend: () => void
  onKey: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  onBack: () => void; onClose: () => void; closing: boolean
  endRef: React.RefObject<HTMLDivElement>
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={onBack} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
          ← Back to Results
        </button>
        <span className="text-sm text-gray-500 font-medium">Follow-up Chat</span>
        <button
          onClick={onClose}
          disabled={closing}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50"
        >
          <X size={14} />{closing ? 'Closing…' : 'Close'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-gray-50">
        {messages.length === 0 && !streamingText && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400">Ask anything about the questions or answers from this session.</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
              msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-800'
            }`}>{msg.content}</div>
          </div>
        ))}

        {streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-white border border-gray-200 text-gray-800 whitespace-pre-wrap leading-relaxed">
              {streamingText}
              <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse rounded-sm" />
            </div>
          </div>
        )}

        {isStreaming && !streamingText && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-4 py-3 bg-white border border-gray-200">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="bg-white border-t border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={isStreaming}
            placeholder="Ask about a question or concept… (Enter to send)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none disabled:opacity-60 max-h-32"
          />
          <button
            onClick={onSend}
            disabled={!input.trim() || isStreaming}
            className="flex-shrink-0 p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          ><Send size={16} /></button>
        </div>
      </div>
    </div>
  )
}
