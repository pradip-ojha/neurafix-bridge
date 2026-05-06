import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, CheckCheck } from 'lucide-react'
import api from '../../lib/api'

interface Payment {
  id: string
  user_id: string
  amount: number
  screenshot_url: string
  status: string
  subscription_months: number | null
  referral_discount_pct: number
  created_at: string
}

export default function Payments() {
  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [payments, setPayments] = useState<Payment[]>([])
  const [months, setMonths] = useState(1)
  const [loading, setLoading] = useState(false)

  const load = () => {
    const params = tab === 'pending' ? { status: 'pending' } : {}
    api.get('/api/admin/payments', { params }).then((r) => setPayments(r.data))
  }

  useEffect(() => { load() }, [tab])

  const approve = async (id: string) => {
    await api.post(`/api/admin/payments/${id}/approve`, null, { params: { subscription_months: months } })
    load()
  }

  const reject = async (id: string) => {
    await api.post(`/api/admin/payments/${id}/reject`)
    load()
  }

  const approveAll = async () => {
    if (!confirm(`Approve all ${payments.length} pending payments for ${months} month(s)?`)) return
    setLoading(true)
    await api.post('/api/admin/payments/approve-all-pending', null, { params: { subscription_months: months } })
    setLoading(false)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Payments</h1>
        {tab === 'pending' && payments.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">Months:</label>
            <select
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            >
              {[1,2,3,6,12].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <button
              onClick={approveAll}
              disabled={loading}
              className="flex items-center gap-2 bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
            >
              <CheckCheck size={15} />
              Approve All ({payments.length})
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['pending', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded-lg capitalize transition ${tab === t ? 'bg-white shadow font-medium text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'pending' && (
        <div className="mb-3 flex items-center gap-3">
          <label className="text-sm text-gray-600">Months for individual approvals:</label>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          >
            {[1,2,3,6,12].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['User ID', 'Amount', 'Discount %', 'Status', 'Date', ...(tab === 'pending' ? ['Actions'] : ['Months'])].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payments.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-mono text-xs text-gray-500">{p.user_id.slice(0, 8)}…</td>
                <td className="px-5 py-3 font-medium">Rs {p.amount}</td>
                <td className="px-5 py-3 text-gray-500">{p.referral_discount_pct}%</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    p.status === 'approved' ? 'bg-green-100 text-green-700' :
                    p.status === 'rejected' ? 'bg-red-100 text-red-600' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{p.status}</span>
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
                {tab === 'pending' ? (
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => approve(p.id)} className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800">
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button onClick={() => reject(p.id)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                        <XCircle size={14} /> Reject
                      </button>
                      {p.screenshot_url && (
                        <a href={p.screenshot_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline">
                          Screenshot
                        </a>
                      )}
                    </div>
                  </td>
                ) : (
                  <td className="px-5 py-3 text-gray-500">{p.subscription_months ?? '—'}</td>
                )}
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No payments</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
