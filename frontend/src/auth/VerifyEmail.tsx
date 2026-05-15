import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Mail, ShieldCheck } from 'lucide-react'
import api from '../lib/api'
import { useAuth } from '../contexts/AuthContext'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendDisabled, setResendDisabled] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    if (countdown <= 0) { setResendDisabled(false); return }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (otp.length !== 6) { setError('Please enter the 6-digit code'); return }
    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/verify-otp', { email, otp })
      await refreshUser()
      navigate('/onboarding', { replace: true })
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendDisabled || resendLoading) return
    setResendLoading(true)
    setError('')
    setSuccessMessage('')
    try {
      await api.post('/api/auth/send-verification-otp', { email })
      setSuccessMessage('A new code has been sent to your email.')
      setResendDisabled(true)
      setCountdown(60)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to resend. Please try again.')
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-study-base flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <img src="/company-logo.png" alt="NeuraFix Bridge" className="w-8 h-8 rounded-lg object-contain" />
          <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-teal-400 bg-clip-text text-transparent">
            NeuraFix Bridge
          </span>
        </div>

        <div className="bg-study-card border border-white/[0.07] rounded-2xl p-8 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
          <div className="flex justify-center mb-5">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center">
              <ShieldCheck size={28} className="text-indigo-400" />
            </div>
          </div>

          <h1 className="text-xl font-semibold text-slate-100 mb-1 text-center">Verify your email</h1>
          <p className="text-slate-400 text-sm mb-1 text-center">
            Enter the 6-digit code sent to
          </p>
          {email && (
            <div className="flex items-center justify-center gap-1.5 mb-6">
              <Mail size={13} className="text-indigo-400 flex-shrink-0" />
              <span className="text-sm font-medium text-indigo-300 break-all">{email}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '')
                  setOtp(val)
                  setError('')
                }}
                placeholder="000000"
                className="w-full bg-study-surface border border-white/[0.1] rounded-xl px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition"
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center">
                {error}
              </p>
            )}

            {successMessage && (
              <p className="text-green-400 text-xs bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-center">
                {successMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
            >
              {loading ? 'Verifying…' : 'Verify email'}
            </button>
          </form>

          <div className="mt-5 text-center">
            <p className="text-slate-500 text-sm">
              Didn't receive a code?{' '}
              {resendDisabled ? (
                <span className="text-slate-600">Resend in {countdown}s</span>
              ) : (
                <button
                  onClick={handleResend}
                  disabled={resendLoading}
                  className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors disabled:opacity-50"
                >
                  {resendLoading ? 'Sending…' : 'Resend code'}
                </button>
              )}
            </p>
          </div>

          <p className="text-xs text-slate-600 text-center mt-4">
            The code expires in 15 minutes.
          </p>
        </div>
      </div>
    </div>
  )
}
