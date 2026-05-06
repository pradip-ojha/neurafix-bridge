import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import api from '../../../lib/api'

interface Subject {
  id: string
  subject_key: string
  display_name: string
  is_active: boolean
  created_at: string
}

export default function ExtraSubjects() {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const load = () => api.get('/api/admin/extra-subjects').then((r) => setSubjects(r.data))
  useEffect(() => { load() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/api/admin/extra-subjects', { subject_key: key, display_name: name })
      setKey(''); setName('')
      load()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add subject')
    }
  }

  const toggle = async (k: string) => {
    await api.patch(`/api/admin/extra-subjects/${k}/toggle`)
    load()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Extra Subjects</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Add Extra Subject</h2>
        <form onSubmit={handleAdd} className="flex gap-3">
          <input placeholder="Subject key (e.g. gk)" value={key} onChange={(e) => setKey(e.target.value)} required className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Display name (e.g. General Knowledge)" value={name} onChange={(e) => setName(e.target.value)} required className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button type="submit" className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-indigo-700 transition">
            <Plus size={15} /> Add
          </button>
        </form>
        {error && <p className="mt-2 text-red-500 text-sm">{error}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Key', 'Display Name', 'Status', 'Created', 'Action'].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {subjects.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-mono text-xs text-gray-600">{s.subject_key}</td>
                <td className="px-5 py-3 font-medium text-gray-900">{s.display_name}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-3">
                  <button onClick={() => toggle(s.subject_key)}
                    className={`text-xs px-3 py-1 border rounded-lg transition ${s.is_active ? 'border-gray-300 text-gray-500 hover:bg-gray-50' : 'border-green-300 text-green-600 hover:bg-green-50'}`}>
                    {s.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {subjects.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No extra subjects added</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
