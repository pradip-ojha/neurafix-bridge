import { useEffect, useState } from 'react'
import { Plus, Edit2, Check, X } from 'lucide-react'
import api from '../../lib/api'

interface College {
  id: string
  name: string
  location: string | null
  total_questions: number
  total_time_minutes: number
  question_distribution: Record<string, number>
  is_active: boolean
}

const SUBJECTS = ['compulsory_math', 'optional_math', 'compulsory_english', 'compulsory_science', 'gk', 'iq', 'computer_science']

function CollegeForm({ initial, onSave, onCancel }: {
  initial?: Partial<College>
  onSave: (data: any) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [totalQ, setTotalQ] = useState(initial?.total_questions ?? 100)
  const [totalTime, setTotalTime] = useState(initial?.total_time_minutes ?? 120)
  const [dist, setDist] = useState<Record<string, number>>(initial?.question_distribution ?? {})

  const setSubjectCount = (s: string, v: number) => {
    if (v === 0) { const d = { ...dist }; delete d[s]; setDist(d) }
    else setDist({ ...dist, [s]: v })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({ name, location: location || null, total_questions: totalQ, total_time_minutes: totalTime, question_distribution: dist })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <input placeholder="College name" value={name} onChange={(e) => setName(e.target.value)} required className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <div>
          <label className="block text-xs text-gray-500 mb-1">Total Questions</label>
          <input type="number" value={totalQ} onChange={(e) => setTotalQ(Number(e.target.value))} min={1} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Total Time (minutes)</label>
          <input type="number" value={totalTime} onChange={(e) => setTotalTime(Number(e.target.value))} min={1} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Question distribution (leave 0 to exclude)</p>
        <div className="grid grid-cols-3 gap-2">
          {SUBJECTS.map((s) => (
            <div key={s} className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-32 truncate">{s.replace(/_/g, ' ')}</label>
              <input
                type="number" min={0}
                value={dist[s] ?? 0}
                onChange={(e) => setSubjectCount(s, Number(e.target.value))}
                className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-indigo-700 transition">
          <Check size={14} /> {initial?.id ? 'Save Changes' : 'Add College'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex items-center gap-2 border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition">
            <X size={14} /> Cancel
          </button>
        )}
      </div>
    </form>
  )
}

export default function Colleges() {
  const [colleges, setColleges] = useState<College[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<College | null>(null)

  const load = () => api.get('/api/admin/colleges').then((r) => setColleges(r.data))
  useEffect(() => { load() }, [])

  const handleCreate = async (data: any) => {
    await api.post('/api/admin/colleges', data)
    setShowForm(false)
    load()
  }

  const handleUpdate = async (id: string, data: any) => {
    await api.patch(`/api/admin/colleges/${id}`, data)
    setEditing(null)
    load()
  }

  const toggleActive = async (c: College) => {
    await api.patch(`/api/admin/colleges/${c.id}`, { is_active: !c.is_active })
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Colleges</h1>
        {!showForm && !editing && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-indigo-700 transition">
            <Plus size={14} /> Add College
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New College</h2>
          <CollegeForm onSave={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {colleges.map((c) => (
        <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-5">
          {editing?.id === c.id ? (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Editing: {c.name}</h2>
              <CollegeForm initial={editing} onSave={(d) => handleUpdate(c.id, d)} onCancel={() => setEditing(null)} />
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-gray-900">{c.name}</h2>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {c.location && <p className="text-sm text-gray-500">{c.location}</p>}
                <p className="text-sm text-gray-600">{c.total_questions} questions · {c.total_time_minutes} min</p>
                {Object.keys(c.question_distribution).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {Object.entries(c.question_distribution).map(([s, n]) => (
                      <span key={s} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">{s.replace(/_/g, ' ')}: {n}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(c)} className="p-1.5 text-gray-400 hover:text-indigo-600 transition"><Edit2 size={15} /></button>
                <button onClick={() => toggleActive(c)} className={`text-xs px-3 py-1.5 border rounded-lg transition ${c.is_active ? 'border-gray-300 text-gray-500 hover:bg-gray-50' : 'border-green-300 text-green-600 hover:bg-green-50'}`}>
                  {c.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {colleges.length === 0 && !showForm && (
        <p className="text-gray-400 text-sm text-center py-12">No colleges added yet</p>
      )}
    </div>
  )
}
