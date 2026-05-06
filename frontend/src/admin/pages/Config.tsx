import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import api from '../../lib/api'

interface Config {
  subscription_price: number
  trial_duration_days: number
  referral_commission_pct: number
  referral_discount_pct: number
}

export default function Config() {
  const [config, setConfig] = useState<Config>({ subscription_price: 2000, trial_duration_days: 7, referral_commission_pct: 10, referral_discount_pct: 5 })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get('/api/admin/config').then((r) => setConfig(r.data))
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await api.patch('/api/admin/config', config)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const field = (label: string, key: keyof Config, suffix = '') => (
    <div key={key}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          step={key === 'subscription_price' ? 100 : 0.5}
          value={config[key]}
          onChange={(e) => setConfig((c) => ({ ...c, [key]: Number(e.target.value) }))}
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
        <form onSubmit={handleSave} className="space-y-5">
          {field('Subscription Price', 'subscription_price', 'Rs')}
          {field('Trial Duration', 'trial_duration_days', 'days')}
          {field('Referral Commission', 'referral_commission_pct', '%')}
          {field('Referral Discount for new user', 'referral_discount_pct', '%')}

          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50 transition">
            <Save size={14} />
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Config'}
          </button>
        </form>
      </div>
    </div>
  )
}
