import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import api from '../../lib/api'

interface Config {
  subscription_price: number
  trial_duration_days: number
  referral_commission_pct: number
  referral_discount_pct: number
  trial_daily_message_limit: number
  paid_daily_message_limit: number
  payment_qr_url: string
  payment_instructions: string
}

const DEFAULTS: Config = {
  subscription_price: 2000,
  trial_duration_days: 7,
  referral_commission_pct: 10,
  referral_discount_pct: 5,
  trial_daily_message_limit: 20,
  paid_daily_message_limit: 50,
  payment_qr_url: '',
  payment_instructions: '',
}

export default function Config() {
  const [config, setConfig] = useState<Config>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/config/platform').then(r => setConfig({ ...DEFAULTS, ...r.data })).catch(() => {})
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.patch('/api/config/admin/platform', {
        subscription_price: config.subscription_price,
        trial_duration_days: config.trial_duration_days,
        referral_commission_pct: config.referral_commission_pct,
        referral_discount_pct: config.referral_discount_pct,
        trial_daily_message_limit: config.trial_daily_message_limit,
        paid_daily_message_limit: config.paid_daily_message_limit,
        payment_qr_url: config.payment_qr_url || null,
        payment_instructions: config.payment_instructions || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Save failed.')
    }
    setSaving(false)
  }

  const numField = (label: string, key: keyof Config, suffix = '', step = 1) => (
    <div key={key}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          step={step}
          value={config[key] as number}
          onChange={e => setConfig(c => ({ ...c, [key]: Number(e.target.value) }))}
          className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
      </div>
    </div>
  )

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900">Platform Config</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <form onSubmit={handleSave} className="space-y-6">

          <div className="space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pricing & Trial</p>
            {numField('Subscription Price', 'subscription_price', 'Rs', 100)}
            {numField('Trial Duration', 'trial_duration_days', 'days')}
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Referral</p>
            {numField('Referral Commission', 'referral_commission_pct', '%', 0.5)}
            {numField('Referral Discount for new user', 'referral_discount_pct', '%', 0.5)}
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Daily Message Limits</p>
            {numField('Trial daily message limit', 'trial_daily_message_limit', 'messages/day')}
            {numField('Paid daily message limit', 'paid_daily_message_limit', 'messages/day')}
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment Info</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment QR URL</label>
              <input
                type="url"
                value={config.payment_qr_url}
                onChange={e => setConfig(c => ({ ...c, payment_qr_url: e.target.value }))}
                placeholder="https://... (URL to QR image)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Instructions</label>
              <textarea
                value={config.payment_instructions}
                onChange={e => setConfig(c => ({ ...c, payment_instructions: e.target.value }))}
                placeholder="e.g. Pay via eSewa to 9800000000 and upload screenshot below."
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            <Save size={14} />
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Config'}
          </button>
        </form>
      </div>
    </div>
  )
}
