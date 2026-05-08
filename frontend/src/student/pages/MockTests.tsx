import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Trophy,
  XCircle,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Option {
  id: string
  text: string
}

interface Question {
  question_id: string
  question_text: string
  question_image?: { url: string | null; caption: string | null }
  options: Option[]
  difficulty: string
  chapter?: string
  topic?: string
}

interface QuestionResult {
  question_id: string
  correct: boolean
  student_answer: string | null
  correct_option_ids: string[]
  explanation: string
  common_mistakes: Record<string, string>
  topic: string
  chapter?: string
  difficulty: string
  question_data: Question
}

interface SubjectScore {
  total: number
  correct: number
  questions: QuestionResult[]
}

interface ScoreData {
  total: number
  correct: number
  per_subject: Record<string, SubjectScore>
}

interface College {
  id: string
  name: string
  location: string | null
  total_questions: number
  total_time_minutes: number
  question_distribution: Record<string, number>
  is_active: boolean
}

interface LeaderboardEntry {
  rank: number
  user_id: string
  name: string
  correct: number
  total: number
}

interface LeaderboardData {
  top10: LeaderboardEntry[]
  my_rank: number | null
  total_participants: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUBJECT_DISPLAY: Record<string, string> = {
  compulsory_math: 'Compulsory Math',
  optional_math: 'Optional Math',
  compulsory_english: 'Compulsory English',
  compulsory_science: 'Compulsory Science',
  gk: 'General Knowledge',
  iq: 'IQ',
  computer_science: 'Computer Science',
}

const SCIENCE_SUBJECTS = ['compulsory_math', 'optional_math', 'compulsory_english', 'compulsory_science']
const MANAGEMENT_SUBJECTS = ['compulsory_math', 'compulsory_english']

function subjectLabel(s: string): string {
  return SUBJECT_DISPLAY[s] ?? s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function pct(correct: number, total: number): number {
  if (total === 0) return 0
  return Math.round((correct / total) * 100)
}

function scoreColor(p: number): string {
  if (p >= 70) return 'text-green-600'
  if (p >= 50) return 'text-yellow-600'
  return 'text-red-600'
}

function barColor(p: number): string {
  if (p >= 70) return 'bg-green-500'
  if (p >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function authHeader(): string {
  return `Bearer ${localStorage.getItem('token') ?? ''}`
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type View = 'idle' | 'exam' | 'results'
type IdleTab = 'college' | 'custom' | 'leaderboard'

export default function MockTests() {
  const [view, setView] = useState<View>('idle')
  const [idleTab, setIdleTab] = useState<IdleTab>('college')

  // Colleges
  const [colleges, setColleges] = useState<College[]>([])
  const [collegesLoading, setCollegesLoading] = useState(true)
  const [selectedCollege, setSelectedCollege] = useState<College | null>(null)
  const [showStartModal, setShowStartModal] = useState(false)

  // Customizable
  const [stream, setStream] = useState<string>('both')
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([])
  const [subjectCounts, setSubjectCounts] = useState<Record<string, number>>({})
  const [customTime, setCustomTime] = useState(30)

  // Exam
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [examCollegeId, setExamCollegeId] = useState<string | null>(null)
  const [examSubjects, setExamSubjects] = useState<string[]>([])
  const [questions, setQuestions] = useState<Record<string, Question[]>>({})
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [activeExamSubject, setActiveExamSubject] = useState<string>('')
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [showConfirm, setShowConfirm] = useState(false)
  const [examLoading, setExamLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoSubmittedRef = useRef(false)

  // Results
  const [scoreData, setScoreData] = useState<ScoreData | null>(null)
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null)
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null)
  const [postExamCollegeId, setPostExamCollegeId] = useState<string | null>(null)

  // Leaderboard
  const [lbCollegeId, setLbCollegeId] = useState<string>('')
  const [lbAllTime, setLbAllTime] = useState(false)
  const [lbData, setLbData] = useState<LeaderboardData | null>(null)
  const [lbLoading, setLbLoading] = useState(false)

  // ---------------------------------------------------------------------------
  // Load colleges + stream
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function load() {
      try {
        const [cRes, pRes] = await Promise.all([
          fetch('/api/colleges', { headers: { Authorization: authHeader() } }),
          fetch('/api/profile/student', { headers: { Authorization: authHeader() } }),
        ])
        if (cRes.ok) {
          const cols: College[] = await cRes.json()
          setColleges(cols)
          if (cols.length > 0) setLbCollegeId(cols[0].id)
        }
        if (pRes.ok) {
          const p = await pRes.json()
          setStream(p.stream ?? 'both')
        }
      } finally {
        setCollegesLoading(false)
      }
    }
    load()
  }, [])

  // ---------------------------------------------------------------------------
  // Load leaderboard
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (idleTab !== 'leaderboard' || !lbCollegeId) return
    setLbData(null)
    setLbLoading(true)
    const params = new URLSearchParams({ college_id: lbCollegeId })
    if (lbAllTime) params.set('all_time', 'true')
    fetch(`/api/mock/leaderboard?${params}`, { headers: { Authorization: authHeader() } })
      .then(r => r.json())
      .then(setLbData)
      .catch(() => setLbData(null))
      .finally(() => setLbLoading(false))
  }, [idleTab, lbCollegeId, lbAllTime])

  // ---------------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------------
  const handleSubmit = useCallback(
    async (auto = false) => {
      if (!sessionId) return
      if (timerRef.current) clearInterval(timerRef.current)
      setShowConfirm(false)
      setExamLoading(true)
      try {
        const resp = await fetch('/api/mock/submit', {
          method: 'POST',
          headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, answers }),
        })
        if (!resp.ok) throw new Error('Submit failed')
        const data: ScoreData = await resp.json()
        setScoreData(data)
        setPostExamCollegeId(examCollegeId)
        setView('results')
        setExpandedSubject(null)
        setExpandedQuestion(null)
      } catch {
        if (!auto) alert('Failed to submit. Please try again.')
      } finally {
        setExamLoading(false)
      }
    },
    [sessionId, answers, examCollegeId],
  )

  useEffect(() => {
    if (view !== 'exam') return
    timerRef.current = setInterval(() => {
      setTimeRemaining(t => {
        if (t <= 1) {
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true
            handleSubmit(true)
          }
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [view, handleSubmit])

  // ---------------------------------------------------------------------------
  // Start exam (college format)
  // ---------------------------------------------------------------------------
  async function startCollegeExam(college: College) {
    setExamLoading(true)
    try {
      const resp = await fetch('/api/mock/start', {
        method: 'POST',
        headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ college_id: college.id }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        alert(data.detail ?? 'Failed to start exam.')
        return
      }
      initExam(data, college.id)
    } catch {
      alert('Failed to start exam. Please try again.')
    } finally {
      setExamLoading(false)
      setShowStartModal(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Start exam (customizable)
  // ---------------------------------------------------------------------------
  async function startCustomExam() {
    if (selectedSubjects.length === 0) {
      alert('Select at least one subject.')
      return
    }
    const distribution: Record<string, number> = {}
    for (const s of selectedSubjects) {
      distribution[s] = subjectCounts[s] ?? 10
    }
    setExamLoading(true)
    try {
      const resp = await fetch('/api/mock/start', {
        method: 'POST',
        headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_distribution: distribution, time_limit_minutes: customTime }),
      })
      const data = await resp.json()
      if (!resp.ok) {
        alert(data.detail ?? 'Failed to start exam.')
        return
      }
      initExam(data, null)
    } catch {
      alert('Failed to start exam. Please try again.')
    } finally {
      setExamLoading(false)
    }
  }

  function initExam(
    data: { session_id: string; subjects: string[]; questions: Record<string, Question[]>; time_limit_minutes: number; college_id?: string | null },
    collegeId: string | null,
  ) {
    autoSubmittedRef.current = false
    setSessionId(data.session_id)
    setExamCollegeId(collegeId ?? data.college_id ?? null)
    setExamSubjects(data.subjects)
    setQuestions(data.questions)
    setAnswers({})
    setActiveExamSubject(data.subjects[0] ?? '')
    setTimeRemaining(data.time_limit_minutes * 60)
    setView('exam')
  }

  // ---------------------------------------------------------------------------
  // Helpers for available subjects
  // ---------------------------------------------------------------------------
  const availableSubjects =
    stream === 'science'
      ? SCIENCE_SUBJECTS
      : stream === 'management'
        ? MANAGEMENT_SUBJECTS
        : SCIENCE_SUBJECTS

  function toggleSubject(s: string) {
    setSelectedSubjects(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s],
    )
    setSubjectCounts(prev => ({ ...prev, [s]: prev[s] ?? 10 }))
  }

  // ---------------------------------------------------------------------------
  // Answered counts
  // ---------------------------------------------------------------------------
  function answeredInSubject(s: string): number {
    return (questions[s] ?? []).filter(q => answers[q.question_id] != null).length
  }

  const totalAnswered = Object.values(answers).length
  const totalQuestions = Object.values(questions).reduce((a, qs) => a + qs.length, 0)

  // ---------------------------------------------------------------------------
  // View: Exam
  // ---------------------------------------------------------------------------
  if (view === 'exam') {
    const currentQuestions = questions[activeExamSubject] ?? []
    const isLow = timeRemaining <= 300 // ≤5 min

    return (
      <div className="flex flex-col h-full bg-gray-50">
        {/* Header bar */}
        <div className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div className="text-sm text-gray-500">
            Answered: <span className="font-semibold text-gray-800">{totalAnswered}/{totalQuestions}</span>
          </div>
          <div className={`flex items-center gap-2 text-2xl font-mono font-bold ${isLow ? 'text-red-600 animate-pulse' : 'text-gray-800'}`}>
            <Clock className="w-5 h-5" />
            {formatTime(timeRemaining)}
          </div>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={examLoading}
            className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Submit Exam
          </button>
        </div>

        {/* Subject tabs */}
        <div className="bg-white border-b px-4 flex gap-1 overflow-x-auto">
          {examSubjects.map(s => {
            const ans = answeredInSubject(s)
            const tot = (questions[s] ?? []).length
            const active = s === activeExamSubject
            return (
              <button
                key={s}
                onClick={() => setActiveExamSubject(s)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {subjectLabel(s)}{' '}
                <span className={`text-xs ${ans === tot ? 'text-green-600' : 'text-gray-400'}`}>
                  {ans}/{tot}
                </span>
              </button>
            )
          })}
        </div>

        {/* Questions */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-3xl mx-auto w-full">
          {currentQuestions.map((q, idx) => {
            const selected = answers[q.question_id]
            return (
              <div key={q.question_id} className="bg-white rounded-xl border p-5 shadow-sm">
                <p className="text-sm text-gray-400 mb-1">Q{idx + 1} · {q.difficulty}</p>
                <p className="text-gray-900 font-medium mb-4 leading-relaxed">{q.question_text}</p>
                <div className="space-y-2">
                  {q.options.map(opt => {
                    const isSelected = selected === opt.id
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setAnswers(prev => ({ ...prev, [q.question_id]: opt.id }))}
                        className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800 font-medium'
                            : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        <span className="font-semibold mr-2">{opt.id}.</span>
                        {opt.text}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Confirm modal */}
        {showConfirm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
              <h3 className="font-semibold text-lg mb-2">Submit Exam?</h3>
              {totalAnswered < totalQuestions && (
                <p className="text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm mb-4">
                  <AlertCircle className="inline w-4 h-4 mr-1" />
                  {totalQuestions - totalAnswered} question{totalQuestions - totalAnswered !== 1 ? 's' : ''} unanswered.
                </p>
              )}
              <p className="text-gray-600 text-sm mb-5">You cannot change answers after submitting.</p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSubmit(false)}
                  disabled={examLoading}
                  className="px-5 py-2 text-sm rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {examLoading ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // View: Results
  // ---------------------------------------------------------------------------
  if (view === 'results' && scoreData) {
    const p = pct(scoreData.correct, scoreData.total)

    function goToLeaderboard() {
      if (postExamCollegeId) {
        setLbCollegeId(postExamCollegeId)
        setLbAllTime(false)
      }
      setView('idle')
      setIdleTab('leaderboard')
    }

    return (
      <div className="flex flex-col h-full overflow-y-auto bg-gray-50">
        <div className="max-w-3xl mx-auto w-full p-6 space-y-6">
          {/* Overall score */}
          <div className="bg-white rounded-xl border p-8 text-center shadow-sm">
            <p className="text-gray-500 text-sm mb-2">Overall Score</p>
            <p className={`text-6xl font-bold mb-1 ${scoreColor(p)}`}>{p}%</p>
            <p className="text-gray-500">{scoreData.correct} / {scoreData.total} correct</p>
          </div>

          {/* Per-subject breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(scoreData.per_subject).map(([subj, ss]) => {
              const sp = pct(ss.correct, ss.total)
              return (
                <div key={subj} className="bg-white rounded-xl border p-4 shadow-sm">
                  <p className="font-medium text-gray-800 mb-1">{subjectLabel(subj)}</p>
                  <p className={`text-2xl font-bold mb-2 ${scoreColor(sp)}`}>{sp}%</p>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                    <div
                      className={`h-2 rounded-full ${barColor(sp)}`}
                      style={{ width: `${sp}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-500">{ss.correct}/{ss.total} correct</p>
                </div>
              )
            })}
          </div>

          {/* Per-question review */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-800">Question Review</h3>
            {Object.entries(scoreData.per_subject).map(([subj, ss]) => (
              <div key={subj} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedSubject(expandedSubject === subj ? null : subj)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-800">{subjectLabel(subj)}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${scoreColor(pct(ss.correct, ss.total))}`}>
                      {ss.correct}/{ss.total}
                    </span>
                    {expandedSubject === subj ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>
                {expandedSubject === subj && (
                  <div className="border-t divide-y">
                    {ss.questions.map((qr, idx) => (
                      <div key={qr.question_id} className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          {qr.correct ? (
                            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-500 mb-1">Q{idx + 1} · {qr.difficulty}</p>
                            <p className="text-sm text-gray-800 leading-relaxed mb-3">
                              {qr.question_data.question_text}
                            </p>
                            {/* Options */}
                            <div className="space-y-1.5 mb-3">
                              {qr.question_data.options.map(opt => {
                                const isCorrect = qr.correct_option_ids.includes(opt.id)
                                const isStudent = qr.student_answer === opt.id
                                let cls = 'border-gray-200 bg-gray-50 text-gray-600'
                                if (isCorrect) cls = 'border-green-400 bg-green-50 text-green-800 font-medium'
                                else if (isStudent && !isCorrect)
                                  cls = 'border-red-400 bg-red-50 text-red-800 line-through'
                                return (
                                  <div key={opt.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${cls}`}>
                                    <span className="font-semibold">{opt.id}.</span>
                                    <span>{opt.text}</span>
                                  </div>
                                )
                              })}
                            </div>
                            {/* Explanation toggle */}
                            <button
                              onClick={() =>
                                setExpandedQuestion(expandedQuestion === qr.question_id ? null : qr.question_id)
                              }
                              className="text-xs text-indigo-600 hover:text-indigo-800"
                            >
                              {expandedQuestion === qr.question_id ? 'Hide explanation' : 'Show explanation'}
                            </button>
                            {expandedQuestion === qr.question_id && (
                              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                                {qr.explanation || 'No explanation available.'}
                                {qr.student_answer &&
                                  !qr.correct &&
                                  qr.common_mistakes[qr.student_answer] && (
                                    <p className="mt-2 text-yellow-700">
                                      <strong>Why {qr.student_answer} is wrong:</strong>{' '}
                                      {qr.common_mistakes[qr.student_answer]}
                                    </p>
                                  )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pb-6">
            <button
              onClick={() => setView('idle')}
              className="flex-1 border border-gray-200 text-gray-700 py-3 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              New Mock Test
            </button>
            {postExamCollegeId && (
              <button
                onClick={goToLeaderboard}
                className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-indigo-700 flex items-center justify-center gap-2"
              >
                <Trophy className="w-4 h-4" />
                View Leaderboard
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // View: Idle (tabs)
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Tab bar */}
      <div className="bg-white border-b px-6 flex gap-0">
        {(['college', 'custom', 'leaderboard'] as IdleTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setIdleTab(tab)}
            className={`px-5 py-4 text-sm font-medium border-b-2 transition-colors capitalize ${
              idleTab === tab
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'college' ? 'College Format' : tab === 'custom' ? 'Customizable' : 'Leaderboard'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ------------------------------------------------------------------ */}
        {/* College Format tab */}
        {/* ------------------------------------------------------------------ */}
        {idleTab === 'college' && (
          <div className="p-6 max-w-4xl mx-auto">
            {collegesLoading ? (
              <p className="text-gray-400 text-center py-12">Loading colleges...</p>
            ) : colleges.length === 0 ? (
              <p className="text-gray-400 text-center py-12">No colleges configured yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {colleges.map(col => (
                  <div
                    key={col.id}
                    className="bg-white rounded-xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => {
                      setSelectedCollege(col)
                      setShowStartModal(true)
                    }}
                  >
                    <div className="p-5">
                      <h3 className="font-semibold text-gray-900 text-lg mb-0.5">{col.name}</h3>
                      {col.location && (
                        <p className="text-sm text-gray-400 mb-3">{col.location}</p>
                      )}
                      <div className="flex gap-4 text-sm text-gray-600">
                        <span>📝 {col.total_questions} questions</span>
                        <span>⏱ {col.total_time_minutes} min</span>
                      </div>
                    </div>
                    {Object.keys(col.question_distribution).length > 0 && (
                      <div className="border-t bg-gray-50 px-5 py-3">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(col.question_distribution).map(([s, n]) => (
                            <span
                              key={s}
                              className="text-xs bg-white border rounded-full px-2.5 py-1 text-gray-600"
                            >
                              {subjectLabel(s)}: {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Start modal */}
            {showStartModal && selectedCollege && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
                  <h3 className="font-semibold text-lg mb-1">{selectedCollege.name}</h3>
                  {selectedCollege.location && (
                    <p className="text-sm text-gray-400 mb-4">{selectedCollege.location}</p>
                  )}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total questions</span>
                      <span className="font-medium">{selectedCollege.total_questions}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Time limit</span>
                      <span className="font-medium">{selectedCollege.total_time_minutes} min</span>
                    </div>
                  </div>
                  {Object.keys(selectedCollege.question_distribution).length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1">
                      {Object.entries(selectedCollege.question_distribution).map(([s, n]) => (
                        <div key={s} className="flex justify-between text-sm">
                          <span className="text-gray-600">{subjectLabel(s)}</span>
                          <span className="font-medium text-gray-800">{n} questions</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowStartModal(false)}
                      className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-lg text-sm hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => startCollegeExam(selectedCollege)}
                      disabled={examLoading}
                      className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {examLoading ? 'Starting...' : 'Start Exam'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Customizable tab */}
        {/* ------------------------------------------------------------------ */}
        {idleTab === 'custom' && (
          <div className="p-6 max-w-xl mx-auto">
            <div className="bg-white rounded-xl border shadow-sm p-6 space-y-6">
              <div>
                <h3 className="font-semibold text-gray-800 mb-3">Select Subjects</h3>
                <div className="space-y-2">
                  {availableSubjects.map(s => {
                    const checked = selectedSubjects.includes(s)
                    return (
                      <label
                        key={s}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          checked ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSubject(s)}
                          className="w-4 h-4 text-indigo-600 rounded"
                        />
                        <span className="text-sm font-medium text-gray-800">{subjectLabel(s)}</span>
                      </label>
                    )
                  })}
                </div>
              </div>

              {selectedSubjects.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-800 mb-3">Questions per Subject</h3>
                  <div className="space-y-4">
                    {selectedSubjects.map(s => (
                      <div key={s}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">{subjectLabel(s)}</span>
                          <span className="font-semibold text-indigo-600">{subjectCounts[s] ?? 10}</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={30}
                          value={subjectCounts[s] ?? 10}
                          onChange={e =>
                            setSubjectCounts(prev => ({ ...prev, [s]: Number(e.target.value) }))
                          }
                          className="w-full accent-indigo-600"
                        />
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>5</span><span>30</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-semibold text-gray-800 mb-3">Time Limit</h3>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={customTime}
                    onChange={e => setCustomTime(Number(e.target.value))}
                    className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <span className="text-sm text-gray-500">minutes</span>
                </div>
              </div>

              <button
                onClick={startCustomExam}
                disabled={examLoading || selectedSubjects.length === 0}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {examLoading ? 'Starting...' : 'Start Exam'}
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Leaderboard tab */}
        {/* ------------------------------------------------------------------ */}
        {idleTab === 'leaderboard' && (
          <div className="p-6 max-w-2xl mx-auto">
            <div className="bg-white rounded-xl border shadow-sm p-6">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <select
                  value={lbCollegeId}
                  onChange={e => setLbCollegeId(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="">Select college</option>
                  {colleges.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setLbAllTime(false)}
                    className={`px-4 py-2 text-sm font-medium ${!lbAllTime ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setLbAllTime(true)}
                    className={`px-4 py-2 text-sm font-medium ${lbAllTime ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >
                    All Time
                  </button>
                </div>
              </div>

              {!lbCollegeId ? (
                <p className="text-center text-gray-400 py-8">Select a college to view the leaderboard.</p>
              ) : lbLoading ? (
                <p className="text-center text-gray-400 py-8">Loading...</p>
              ) : !lbData || lbData.top10.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No results yet. Be the first!</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {lbData.top10.map(entry => {
                      const isMe = lbData.my_rank === entry.rank
                      const ep = pct(entry.correct, entry.total)
                      return (
                        <div
                          key={entry.rank}
                          className={`flex items-center gap-4 px-4 py-3 rounded-xl ${
                            isMe ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 border border-gray-100'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                            entry.rank === 1
                              ? 'bg-yellow-100 text-yellow-700'
                              : entry.rank === 2
                                ? 'bg-gray-100 text-gray-600'
                                : entry.rank === 3
                                  ? 'bg-orange-100 text-orange-600'
                                  : 'bg-white text-gray-500 border'
                          }`}>
                            {entry.rank}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isMe ? 'text-indigo-800' : 'text-gray-800'}`}>
                              {entry.name} {isMe && '(You)'}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-sm font-bold ${scoreColor(ep)}`}>{ep}%</p>
                            <p className="text-xs text-gray-400">{entry.correct}/{entry.total}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {lbData.my_rank && lbData.my_rank > 10 && (
                    <div className="mt-3 flex items-center gap-4 px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {lbData.my_rank}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-indigo-800">You</p>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 text-center mt-4">
                    {lbData.total_participants} participant{lbData.total_participants !== 1 ? 's' : ''}{' '}
                    {lbAllTime ? 'all time' : 'today'}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
