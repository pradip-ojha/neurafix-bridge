import { useEffect, useState } from 'react'
import api from '../../lib/api'

interface Earning {
  id: string
  referrer_id: string
  referrer_name: string | null
  referred_user_id: string
  payment_id: string | null
  commission_amount: number
  status: string
  created_at: string
}

export default function Referrals() {
  const [earnings, setEarnings] = useState<Earning[]>([])

  const load = () => api.get('/api/admin/referral-earnings').then((r) => setEarnings(r.data))
  useEffect(() => { load() }, [])

  const markPaid = async (id: string) => {
    await api.patch(`/api/admin/referral-earnings/${id}/mark-paid`)
    load()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Referral Earnings</h1>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Referrer', 'Referred User', 'Commission', 'Status', 'Date', 'Action'].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {earnings.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{e.referrer_name ?? e.referrer_id.slice(0, 8) + '…'}</td>
                <td className="px-5 py-3 text-gray-500 font-mono text-xs">{e.referred_user_id.slice(0, 8)}…</td>
                <td className="px-5 py-3 font-medium">Rs {e.commission_amount}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {e.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">{new Date(e.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-3">
                  {e.status === 'pending' && (
                    <button
                      onClick={() => markPaid(e.id)}
                      className="text-xs px-3 py-1 border border-green-300 text-green-600 rounded-lg hover:bg-green-50 transition"
                    >
                      Mark Paid
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {earnings.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No referral earnings yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
