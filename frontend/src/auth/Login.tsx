import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Bot, Sparkles, BookOpen, Trophy } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const u = await login(email, password)
      if (u.role === 'admin') {
        navigate('/admin', { replace: true })
      } else if (u.role === 'affiliation_partner' && u.onboarding_complete) {
        navigate('/affiliation', { replace: true })
      } else if (u.onboarding_complete) {
        navigate('/student/tutor', { replace: true })
      } else {
        navigate('/onboarding', { replace: true })
      }
    } catch {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-study-base flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex flex-col justify-center px-16 w-[480px] flex-shrink-0 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 via-transparent to-teal-600/5 pointer-events-none" />
        <div className="absolute top-1/3 -left-20 w-72 h-72 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative">
          <div className="flex items-center gap-3 mb-10">
            <img src="/company-logo.png" alt="NeuraFix Bridge" className="w-10 h-10 rounded-xl object-contain" />
            <div>
              <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-teal-400 bg-clip-text text-transparent">
                NeuraFix Bridge
              </span>
              <p className="text-slate-500 text-xs">by NeuraFix AI</p>
            </div>
          </div>

          <h2 className="text-3xl font-bold text-slate-100 leading-tight mb-4">
            Your AI-powered<br />entrance exam companion
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-10">
            Personalized tutoring, intelligent practice, and expert guidance — built around how you learn.
          </p>

          <div className="space-y-4">
            {[
              { icon: Bot, label: 'Personal AI Tutor', desc: 'Learns your style and adapts to you' },
              { icon: BookOpen, label: 'Level-based Notes', desc: 'Content matched to your skill level' },
              { icon: Trophy, label: 'Smart Practice', desc: 'Questions chosen for maximum improvement' },
              { icon: Sparkles, label: 'Daily Capsules', desc: 'Personalized review of each study session' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon size={14} className="text-indigo-400" />
                </div>
                <div>
                  <p className="text-slate-300 text-sm font-medium">{label}</p>
                  <p className="text-slate-500 text-xs">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <img src="/company-logo.png" alt="NeuraFix Bridge" className="w-8 h-8 rounded-lg object-contain" />
            <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-teal-400 bg-clip-text text-transparent">
              NeuraFix Bridge
            </span>
          </div>

          <div className="bg-study-card border border-white/[0.07] rounded-2xl p-8 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
            <h1 className="text-xl font-semibold text-slate-100 mb-1">Welcome back</h1>
            <p className="text-slate-400 text-sm mb-7">Sign in to continue your preparation</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-study-surface border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full bg-study-surface border border-white/[0.1] rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition"
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors mt-1"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Don't have an account?{' '}
              <Link to="/register" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
