import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import api from '../../lib/api'

interface User {
  id: string
  full_name: string
  email: string
  role: string
  is_active: boolean
  created_at: string
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const limit = 20

  const load = () => {
    const params: Record<string, string | number> = { page, limit }
    if (role) params.role = role
    api.get('/api/admin/users', { params }).then((r) => {
      setUsers(r.data.items)
      setTotal(r.data.total)
    })
  }

  useEffect(() => { load() }, [page, role])

  const toggleActive = async (u: User) => {
    const path = u.is_active ? 'deactivate' : 'reactivate'
    await api.patch(`/api/admin/users/${u.id}/${path}`)
    load()
  }

  const filtered = search
    ? users.filter((u) => u.full_name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    : users

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-gray-900">Users</h1>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value); setPage(1) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">All roles</option>
          <option value="student">Student</option>
          <option value="admin">Admin</option>
          <option value="affiliation_partner">Affiliate</option>
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Email', 'Role', 'Status', 'Action'].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{u.full_name}</td>
                <td className="px-5 py-3 text-gray-500">{u.email}</td>
                <td className="px-5 py-3 capitalize text-gray-600">{u.role.replace('_', ' ')}</td>
                <td className="px-5 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => toggleActive(u)}
                    className={`text-xs px-3 py-1 rounded-lg border transition ${
                      u.is_active ? 'border-red-300 text-red-600 hover:bg-red-50' : 'border-green-300 text-green-600 hover:bg-green-50'
                    }`}
                  >
                    {u.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{total} total users</span>
        <div className="flex gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded-lg disabled:opacity-40">Prev</button>
          <span className="px-3 py-1">Page {page}</span>
          <button disabled={page * limit >= total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded-lg disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  )
}
