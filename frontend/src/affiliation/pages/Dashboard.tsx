import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../lib/api'

type AffiliationProfile = {
  total_referrals: number
  total_earnings: number
}

type EarningsSummary = {
  total_pending: number
  total_paid: number
}

export default function AffiliateDashboard() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<AffiliationProfile | null>(null)
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/api/profile/affiliation').then((r) => r.data),
      api.get('/api/referral/my-earnings').then((r) => r.data),
    ])
      .then(([prof, earn]) => {
        setProfile(prof)
        setEarnings({ total_pending: earn.total_pending, total_paid: earn.total_paid })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const statCards = profile && earnings ? [
    { label: 'Total Referrals', value: profile.total_referrals },
    { label: 'Total Earnings', value: `Rs ${profile.total_earnings.toFixed(2)}` },
    { label: 'Pending Payout', value: `Rs ${earnings.total_pending.toFixed(2)}` },
    { label: 'Paid Out', value: `Rs ${earnings.total_paid.toFixed(2)}` },
  ] : []

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Welcome, {user?.full_name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">Affiliate Dashboard</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {statCards.map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1 leading-tight">{card.label}</p>
              <p className="text-xl font-bold text-indigo-600 break-words">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 bg-indigo-50 rounded-xl p-4 border border-indigo-100">
        <p className="text-sm font-medium text-indigo-800 mb-1">How it works</p>
        <ul className="text-xs text-indigo-700 space-y-1 list-disc list-inside">
          <li>Share your referral link with students</li>
          <li>Earn commission when referred students subscribe</li>
          <li>Admin processes payouts manually — update your payment details to receive them</li>
        </ul>
      </div>
    </div>
  )
}
