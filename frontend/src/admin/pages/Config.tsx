import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import api from '../../lib/api'

interface Config {
  subscription_price: number
  referral_commission_pct: number
  referral_discount_pct: number
  free_tutor_fast_limit: number
  free_tutor_thinking_limit: number
  free_tutor_deep_thinking_limit: number
  free_consultant_normal_limit: number
  free_consultant_thinking_limit: number
  free_practice_limit: number
  free_mock_test_limit: number
  free_capsule_followup_limit: number
  paid_tutor_fast_limit: number
  paid_tutor_thinking_limit: number
  paid_tutor_deep_thinking_limit: number
  paid_consultant_normal_limit: number
  paid_consultant_thinking_limit: number
  paid_practice_limit: number
  paid_mock_test_limit: number
  paid_capsule_followup_limit: number
  payment_qr_url: string
  payment_instructions: string
}

const DEFAULTS: Config = {
  subscription_price: 2000,
  referral_commission_pct: 10,
  referral_discount_pct: 5,
  free_tutor_fast_limit: 10,
  free_tutor_thinking_limit: 5,
  free_tutor_deep_thinking_limit: 3,
  free_consultant_normal_limit: 5,
  free_consultant_thinking_limit: 2,
  free_practice_limit: 5,
  free_mock_test_limit: 2,
  free_capsule_followup_limit: 5,
  paid_tutor_fast_limit: 100,
  paid_tutor_thinking_limit: 50,
  paid_tutor_deep_thinking_limit: 20,
  paid_consultant_normal_limit: 30,
  paid_consultant_thinking_limit: 15,
  paid_practice_limit: 50,
  paid_mock_test_limit: 20,
  paid_capsule_followup_limit: 30,
  payment_qr_url: '',
  payment_instructions: '',
}

const LIMIT_ROWS: { label: string; free: keyof Config; paid: keyof Config }[] = [
  { label: 'Tutor chat: Fast', free: 'free_tutor_fast_limit', paid: 'paid_tutor_fast_limit' },
  { label: 'Tutor chat: Thinking', free: 'free_tutor_thinking_limit', paid: 'paid_tutor_thinking_limit' },
  { label: 'Tutor chat: Deep Thinking', free: 'free_tutor_deep_thinking_limit', paid: 'paid_tutor_deep_thinking_limit' },
  { label: 'Consultant: Normal', free: 'free_consultant_normal_limit', paid: 'paid_consultant_normal_limit' },
  { label: 'Consultant: Thinking', free: 'free_consultant_thinking_limit', paid: 'paid_consultant_thinking_limit' },
  { label: 'Practice sets', free: 'free_practice_limit', paid: 'paid_practice_limit' },
  { label: 'Mock tests', free: 'free_mock_test_limit', paid: 'paid_mock_test_limit' },
  { label: 'Daily capsule follow-ups', free: 'free_capsule_followup_limit', paid: 'paid_capsule_followup_limit' },
]

export default function Config() {
  const [config, setConfig] = useState<Config>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/config/platform').then(r => setConfig({ ...DEFAULTS, ...r.data })).catch(() => {})
  }, [])

  const update = (key: keyof Config, value: number | string) => {
    setConfig(c => ({ ...c, [key]: value }))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.patch('/api/config/admin/platform', {
        ...config,
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
          onChange={e => update(key, Number(e.target.value))}
          className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
      </div>
    </div>
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900">Platform Config</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <form onSubmit={handleSave} className="space-y-7">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pricing</p>
              {numField('Subscription Price', 'subscription_price', 'Rs', 100)}
            </div>

            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Referral</p>
              {numField('Referral Commission', 'referral_commission_pct', '%', 0.5)}
              {numField('Referral Discount for new user', 'referral_discount_pct', '%', 0.5)}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Daily Rate Limits</p>
              <p className="text-xs text-gray-400 mt-1">Free users can access all features until they hit these limits.</p>
            </div>
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Feature</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Free Tier</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Paid Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {LIMIT_ROWS.map(row => (
                    <tr key={row.label}>
                      <td className="px-4 py-3 text-gray-700">{row.label}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          value={config[row.free] as number}
                          onChange={e => update(row.free, Number(e.target.value))}
                          className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          value={config[row.paid] as number}
                          onChange={e => update(row.paid, Number(e.target.value))}
                          className="w-24 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Payment Info</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment QR URL</label>
              <input
                type="url"
                value={config.payment_qr_url}
                onChange={e => update('payment_qr_url', e.target.value)}
                placeholder="https://... (URL to QR image)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Instructions</label>
              <textarea
                value={config.payment_instructions}
                onChange={e => update('payment_instructions', e.target.value)}
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
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Config'}
          </button>
        </form>
      </div>
    </div>
  )
}
