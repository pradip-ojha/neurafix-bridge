import { useEffect, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
} from 'recharts'
import api from '../../lib/api'

type ProgressStats = {
  practice_sessions_this_week: { date: string; count: number }[]
  mock_score_trend: { date: string; score_pct: number | null }[]
  avg_score_by_subject: Record<string, number>
  total_practice_sessions: number
  total_mock_sessions: number
}

const SUBJECT_LABELS: Record<string, string> = {
  compulsory_math: 'C. Math',
  optional_math: 'O. Math',
  compulsory_english: 'English',
  compulsory_science: 'Science',
}

const formatDay = (dateStr: string) => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
}

export default function Progress() {
  const [stats, setStats] = useState<ProgressStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/progress/overview')
      .then((res) => setStats(res.data))
      .catch(() => setError('Could not load progress data.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-gray-400">Loading progress...</p>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-red-400">{error || 'No data available.'}</p>
      </div>
    )
  }

  const radarData = Object.entries(stats.avg_score_by_subject).map(([subject, score]) => ({
    subject: SUBJECT_LABELS[subject] || subject,
    score,
  }))

  const weekData = stats.practice_sessions_this_week.map((d) => ({
    ...d,
    label: formatDay(d.date),
  }))

  const mockData = stats.mock_score_trend
    .filter((d) => d.score_pct !== null)
    .map((d) => ({
      ...d,
      label: formatDay(d.date),
    }))

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">My Progress</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Practice Sessions</p>
          <p className="text-3xl font-bold text-indigo-600">{stats.total_practice_sessions}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Mock Tests</p>
          <p className="text-3xl font-bold text-indigo-600">{stats.total_mock_sessions}</p>
        </div>
      </div>

      {/* Practice sessions this week */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Practice Sessions This Week</h2>
        {weekData.length === 0 ? (
          <p className="text-sm text-gray-400">No practice sessions in the last 7 days.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Mock score trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Mock Test Score Trend</h2>
        {mockData.length === 0 ? (
          <p className="text-sm text-gray-400">No mock tests taken yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={mockData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(v) => `${v}%`} />
              <Line
                type="monotone"
                dataKey="score_pct"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Avg score by subject */}
      {radarData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Average Score by Subject</h2>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} margin={{ top: 8, right: 30, left: 30, bottom: 8 }}>
              <PolarGrid />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
              <Radar
                name="Score"
                dataKey="score"
                stroke="#6366f1"
                fill="#6366f1"
                fillOpacity={0.3}
              />
              <Tooltip formatter={(v) => `${v}%`} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
