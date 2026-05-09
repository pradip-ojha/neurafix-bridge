import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react'
import { CreditCard, CheckCircle, Clock, XCircle, Upload } from 'lucide-react'
import api from '../../lib/api'

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

const STATUS_COLORS: Record<string, string> = {
  trial: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  none: 'bg-gray-100 text-gray-600',
}

const STATUS_ICONS: Record<string, ReactNode> = {
  trial: <Clock size={14} />,
  active: <CheckCircle size={14} />,
  expired: <XCircle size={14} />,
  none: <XCircle size={14} />,
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
    return <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
  }

  const expiryDate = sub?.status === 'trial' ? sub.trial_ends_at : sub?.subscription_ends_at

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
        <CreditCard size={22} className="text-indigo-600" />
        Subscription
      </h1>

      {/* Status card */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">Current status</p>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[sub?.status || 'none']}`}>
            {STATUS_ICONS[sub?.status || 'none']}
            {sub?.status === 'none' ? 'No subscription' : sub?.status}
          </span>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500 mb-0.5">
            {sub?.status === 'trial' ? 'Trial ends' : sub?.status === 'active' ? 'Renews' : 'Expired'}
          </p>
          <p className="text-sm font-medium text-gray-800">{formatDate(expiryDate || null)}</p>
        </div>
      </div>

      {/* Payment info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Subscribe / Renew</h2>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-gray-900">Rs {config?.subscription_price?.toLocaleString() ?? '2,000'}</span>
          <span className="text-sm text-gray-500">/ month</span>
        </div>

        {config?.payment_instructions && (
          <p className="text-sm text-gray-600 whitespace-pre-line">{config.payment_instructions}</p>
        )}

        {config?.payment_qr_url && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Scan to pay</p>
            <img
              src={config.payment_qr_url}
              alt="Payment QR"
              className="w-44 h-44 object-contain border rounded-lg"
            />
          </div>
        )}

        {!config?.payment_qr_url && !config?.payment_instructions && (
          <p className="text-sm text-gray-500 italic">Payment QR and instructions will be added soon.</p>
        )}

        {/* Submit form */}
        {submitSuccess ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle size={16} />
            Payment submitted! Admin will approve within 24 hours.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Submit payment</p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Amount paid (Rs)</label>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                required
                min={1}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Payment screenshot</label>
              <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-3 py-3 cursor-pointer hover:bg-gray-50">
                <Upload size={16} className="text-gray-400" />
                <span className="text-sm text-gray-500">
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
            {submitError && <p className="text-xs text-red-500">{submitError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
            >
              {submitting ? 'Submitting...' : 'Submit Payment'}
            </button>
          </form>
        )}
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Payment History</h2>
          <div className="space-y-2">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                <div>
                  <p className="font-medium text-gray-800">Rs {p.amount.toLocaleString()}</p>
                  <p className="text-xs text-gray-400">{formatDate(p.created_at)}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                  p.status === 'approved' ? 'bg-green-100 text-green-700' :
                  p.status === 'rejected' ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
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
