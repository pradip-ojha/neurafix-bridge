import { useEffect, useState } from 'react'
import api from '../../lib/api'

type Earning = {
  id: string
  referred_user_name: string
  commission_amount: number
  status: 'pending' | 'paid'
  created_at: string
}

type EarningsData = {
  total_pending: number
  total_paid: number
  earnings: Earning[]
}

export default function Earnings() {
  const [data, setData] = useState<EarningsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/referral/my-earnings')
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const formatDate = (s: string) => {
    const d = new Date(s)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Earnings</h1>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : !data ? (
        <p className="text-sm text-red-400">Could not load earnings.</p>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-yellow-50 rounded-xl border border-yellow-100 p-4">
              <p className="text-xs text-yellow-700 font-medium uppercase tracking-wide mb-1">Pending Payout</p>
              <p className="text-2xl font-bold text-yellow-800">Rs {data.total_pending.toFixed(2)}</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-100 p-4">
              <p className="text-xs text-green-700 font-medium uppercase tracking-wide mb-1">Paid Out</p>
              <p className="text-2xl font-bold text-green-800">Rs {data.total_paid.toFixed(2)}</p>
            </div>
          </div>

          {/* Table */}
          {data.earnings.length === 0 ? (
            <p className="text-sm text-gray-400">No earnings yet. Start sharing your referral link!</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Referred</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Commission</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.earnings.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-700">{e.referred_user_name}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        Rs {e.commission_amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                            e.status === 'paid'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {e.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {formatDate(e.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
