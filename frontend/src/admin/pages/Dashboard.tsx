import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Users, CreditCard, TrendingUp } from 'lucide-react'
import api from '../../lib/api'

interface Overview {
  total_users: number
  students: number
  affiliation_partners: number
  subscriptions: { trial: number; active: number; expired: number }
  streams: { science: number; management: number }
  pending_payments_count: number
  recent_payments: Array<{ id: string; user_id: string; amount: number; status: string; created_at: string }>
}

export default function Dashboard() {
  const [data, setData] = useState<Overview | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/api/admin/analytics/overview').then((r) => setData(r.data))
  }, [])

  if (!data) return <p className="text-gray-500">Loading…</p>

  const cards = [
    { label: 'Total Users', value: data.total_users, icon: Users, color: 'bg-indigo-50 text-indigo-600' },
    { label: 'Students', value: data.students, icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: 'Active Subscriptions', value: data.subscriptions.active, icon: CreditCard, color: 'bg-green-50 text-green-600' },
    { label: 'Trial Users', value: data.subscriptions.trial, icon: TrendingUp, color: 'bg-yellow-50 text-yellow-600' },
    { label: 'Expired', value: data.subscriptions.expired, icon: TrendingUp, color: 'bg-red-50 text-red-600' },
    { label: 'Affiliates', value: data.affiliation_partners, icon: Users, color: 'bg-purple-50 text-purple-600' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>

      {data.pending_payments_count > 0 && (
        <div
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 cursor-pointer"
          onClick={() => navigate('/admin/payments')}
        >
          <AlertTriangle size={20} className="text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{data.pending_payments_count}</span> payment{data.pending_payments_count !== 1 ? 's' : ''} waiting for review
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
              <div className={`p-3 rounded-lg ${c.color}`}>
                <Icon size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Streams</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Science</span><span className="font-medium">{data.streams.science}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Management</span><span className="font-medium">{data.streams.management}</span></div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Payments</h2>
          {data.recent_payments.length === 0 ? (
            <p className="text-xs text-gray-400">No payments yet</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {data.recent_payments.map((p) => (
                <li key={p.id} className="flex justify-between items-center">
                  <span className="text-gray-500 truncate max-w-[100px]">{p.user_id.slice(0, 8)}…</span>
                  <span className="font-medium">Rs {p.amount}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.status === 'approved' ? 'bg-green-100 text-green-700' :
                    p.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>{p.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
