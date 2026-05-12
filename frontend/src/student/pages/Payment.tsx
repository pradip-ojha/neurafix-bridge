import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react'
import { CreditCard, CheckCircle, Clock, XCircle, Upload, Wallet } from 'lucide-react'
import api from '../../lib/api'
import DarkSkeleton from '../components/DarkSkeleton'

interface SubscriptionStatus {
  status: 'trial' | 'active' | 'expired' | 'none'
  trial_ends_at: string | null
  subscription_ends_at: string | null
}

interface PlatformConfig {
  subscription_price: number
  trial_duration_days: number
  trial_daily_message_limit: number
  paid_daily_message_limit: number
  payment_qr_url: string | null
  payment_instructions: string | null
}

interface PaymentRecord {
  id: string
  amount: number
  status: 'pending' | 'approved' | 'rejected'
  subscription_months: number | null
  referral_discount_pct: number
  created_at: string
}

const STATUS_STYLES: Record<string, { badge: string; icon: ReactNode; label: string }> = {
  trial:   { badge: 'bg-blue-600/15 text-blue-400 border border-blue-500/20',   icon: <Clock size={13} />,         label: 'Free Trial'     },
  active:  { badge: 'bg-green-600/15 text-green-400 border border-green-500/20', icon: <CheckCircle size={13} />,   label: 'Active'         },
  expired: { badge: 'bg-red-600/15 text-red-400 border border-red-500/20',       icon: <XCircle size={13} />,       label: 'Expired'        },
  none:    { badge: 'bg-slate-700/50 text-slate-400 border border-white/[0.07]', icon: <XCircle size={13} />,       label: 'No Subscription'},
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-NP', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function Payment() {
  const [sub, setSub] = useState<SubscriptionStatus | null>(null)
  const [config, setConfig] = useState<PlatformConfig | null>(null)
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [amount, setAmount] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      api.get('/api/subscription/status').then(r => setSub(r.data)).catch(() => setSub({ status: 'none', trial_ends_at: null, subscription_ends_at: null })),
      api.get('/api/config/platform').then(r => { setConfig(r.data); setAmount(String(r.data.subscription_price)) }).catch(() => {}),
      api.get('/api/payments/my').then(r => setPayments(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!screenshot) { setSubmitError('Please select a screenshot.'); return }
    setSubmitting(true)
    setSubmitError('')
    try {
      const fd = new FormData()
      fd.append('amount', amount)
      fd.append('screenshot', screenshot)
      await api.post('/api/payments/submit', fd)
      setSubmitSuccess(true)
      setScreenshot(null)
      if (fileRef.current) fileRef.current.value = ''
      const r = await api.get('/api/payments/my')
      setPayments(r.data)
    } catch (err: any) {
      setSubmitError(err?.response?.data?.detail || 'Submission failed.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <DarkSkeleton className="h-8 w-40" variant="block" />
        <DarkSkeleton className="h-24 w-full" variant="block" />
        <DarkSkeleton className="h-64 w-full" variant="block" />
      </div>
    )
  }

  const statusKey = sub?.status || 'none'
  const statusStyle = STATUS_STYLES[statusKey]
  const expiryDate = sub?.status === 'trial' ? sub.trial_ends_at : sub?.subscription_ends_at

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2 tracking-tight">
        <Wallet size={20} className="text-indigo-400" />
        Subscription
      </h1>

      {/* Status card */}
      <div className="bg-study-card border border-white/[0.07] rounded-2xl p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">Current status</p>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusStyle.badge}`}>
            {statusStyle.icon}
            {statusStyle.label}
          </span>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 mb-0.5">
            {sub?.status === 'trial' ? 'Trial ends' : sub?.status === 'active' ? 'Renews' : 'Expired'}
          </p>
          <p className="text-sm font-medium text-slate-300">{formatDate(expiryDate || null)}</p>
        </div>
      </div>

      {/* Plan info + payment */}
      <div className="bg-study-card border border-white/[0.07] rounded-2xl p-5 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Subscribe / Renew</h2>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-100">Rs {config?.subscription_price?.toLocaleString() ?? '2,000'}</span>
            <span className="text-sm text-slate-500">/ month</span>
          </div>
        </div>

        {config?.payment_instructions && (
          <p className="text-sm text-slate-400 whitespace-pre-line leading-relaxed">{config.payment_instructions}</p>
        )}

        {config?.payment_qr_url && (
          <div>
            <p className="text-xs text-slate-500 mb-2">Scan to pay</p>
            <div className="bg-white p-2 rounded-xl w-48 h-48 flex items-center justify-center">
              <img
                src={config.payment_qr_url}
                alt="Payment QR"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        )}

        {!config?.payment_qr_url && !config?.payment_instructions && (
          <p className="text-sm text-slate-500 italic">Payment QR and instructions will be added soon.</p>
        )}

        {/* Submit form */}
        <div className="pt-4 border-t border-white/[0.05]">
          {submitSuccess ? (
            <div className="bg-green-600/10 border border-green-500/20 rounded-xl p-4 text-sm text-green-400 flex items-center gap-2">
              <CheckCircle size={16} />
              Payment submitted! Admin will approve within 24 hours.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Submit payment proof</p>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Amount paid (Rs)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full bg-study-surface border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                  required
                  min={1}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">Payment screenshot</label>
                <label className="flex items-center gap-3 border border-dashed border-white/[0.1] rounded-xl px-4 py-3 cursor-pointer hover:border-indigo-500/30 hover:bg-study-elevated/50 transition-colors">
                  <Upload size={15} className="text-slate-500 flex-shrink-0" />
                  <span className="text-sm text-slate-500 truncate">
                    {screenshot ? screenshot.name : 'Choose image file'}
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => setScreenshot(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              {submitError && <p className="text-xs text-red-400">{submitError}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Payment'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="bg-study-card border border-white/[0.07] rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300">Payment History</h2>
          <div className="space-y-1">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm py-3 border-b border-white/[0.04] last:border-0">
                <div>
                  <p className="font-medium text-slate-300">Rs {p.amount.toLocaleString()}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{formatDate(p.created_at)}</p>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                  p.status === 'approved' ? 'bg-green-600/15 text-green-400 border border-green-500/20' :
                  p.status === 'rejected' ? 'bg-red-600/15 text-red-400 border border-red-500/20' :
                  'bg-amber-600/15 text-amber-400 border border-amber-500/20'
                }`}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
