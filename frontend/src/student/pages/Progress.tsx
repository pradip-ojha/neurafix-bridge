import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from 'recharts'
import { TrendingUp, ClipboardList } from 'lucide-react'
import api from '../../lib/api'
import DarkSkeleton from '../components/DarkSkeleton'
import { useTheme } from '../../contexts/ThemeContext'

type ProgressStats = {
  practice_sessions_this_week: { date: string; count: number }[]
  mock_score_trend: { date: string; score_pct: number | null }[]
  avg_score_by_subject: Record<string, number>
  total_practice_sessions: number
  total_mock_sessions: number
}

const SUBJECT_LABELS: Record<string, string> = {
  mathematics:  'C. Math',
  optional_math: 'O. Math',
  english:      'English',
  science:      'Science',
}

const formatDay = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })

export default function Progress() {
  const { theme } = useTheme()
  const CHART_STYLE = theme === 'light'
    ? {
        tick:    { fill: '#475569', fontSize: 11 },
        tooltip: { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, color: '#1e293b' },
        grid:    'rgba(0,0,0,0.06)',
      }
    : {
        tick:    { fill: '#64748b', fontSize: 11 },
        tooltip: { backgroundColor: '#1c2d50', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#e2e8f0' },
        grid:    'rgba(255,255,255,0.05)',
      }

  const [stats, setStats]   = useState<ProgressStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    api.get('/api/progress/overview')
      .then((res) => setStats(res.data))
      .catch(() => setError('Could not load progress data.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <DarkSkeleton className="h-8 w-48" variant="block" />
        <div className="grid grid-cols-2 gap-4">
          <DarkSkeleton className="h-28" variant="block" />
          <DarkSkeleton className="h-28" variant="block" />
        </div>
        <DarkSkeleton className="h-56" variant="block" />
        <DarkSkeleton className="h-56" variant="block" />
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
    subject: SUBJECT_LABELS[subject] || subject, score,
  }))

  const weekData = stats.practice_sessions_this_week.map((d) => ({ ...d, label: formatDay(d.date) }))
  const mockData = stats.mock_score_trend.filter((d) => d.score_pct !== null).map((d) => ({ ...d, label: formatDay(d.date) }))

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-xl font-bold text-slate-100 tracking-tight">My Progress</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: 'Total Practice Sessions', value: stats.total_practice_sessions, icon: TrendingUp,    color: 'text-indigo-400' },
          { label: 'Total Mock Tests',         value: stats.total_mock_sessions,     icon: ClipboardList, color: 'text-teal-400'   },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-study-card border border-white/[0.07] rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <Icon size={16} className={color} />
              <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
            </div>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Practice sessions chart */}
      <div className="bg-study-card border border-white/[0.07] rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Practice Sessions This Week</h2>
        {weekData.length === 0 ? (
          <p className="text-sm text-slate-500">No practice sessions in the last 7 days.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weekData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_STYLE.grid} />
              <XAxis dataKey="label" tick={CHART_STYLE.tick} />
              <YAxis tick={CHART_STYLE.tick} allowDecimals={false} />
              <Tooltip contentStyle={CHART_STYLE.tooltip} />
              <Bar dataKey="count" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Mock score trend */}
      <div className="bg-study-card border border-white/[0.07] rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Mock Test Score Trend</h2>
        {mockData.length === 0 ? (
          <p className="text-sm text-slate-500">No mock tests taken yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={mockData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_STYLE.grid} />
              <XAxis dataKey="label" tick={CHART_STYLE.tick} />
              <YAxis domain={[0, 100]} tick={CHART_STYLE.tick} unit="%" />
              <Tooltip contentStyle={CHART_STYLE.tooltip} formatter={(v) => `${v}%`} />
              <Line type="monotone" dataKey="score_pct" stroke="#14b8a6" strokeWidth={2} dot={{ r: 4, fill: '#14b8a6' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Avg score radar */}
      {radarData.length > 0 && (
        <div className="bg-study-card border border-white/[0.07] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Average Score by Subject</h2>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} margin={{ top: 8, right: 30, left: 30, bottom: 8 }}>
              <PolarGrid stroke={CHART_STYLE.grid} />
              <PolarAngleAxis dataKey="subject" tick={CHART_STYLE.tick} />
              <Radar name="Score" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} />
              <Tooltip contentStyle={CHART_STYLE.tooltip} formatter={(v) => `${v}%`} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
