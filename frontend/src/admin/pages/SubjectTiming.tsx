import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import api from '../../lib/api'

interface TimingRow {
  id: string
  subject: string
  difficulty: string
  seconds_per_question: number
}

export default function SubjectTiming() {
  const [rows, setRows] = useState<TimingRow[]>([])
  const [edits, setEdits] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  const load = () => api.get('/api/admin/subject-timing').then((r) => setRows(r.data))
  useEffect(() => { load() }, [])

  const setValue = (id: string, val: number) => setEdits((e) => ({ ...e, [id]: val }))

  const save = async (row: TimingRow) => {
    const val = edits[row.id] ?? row.seconds_per_question
    setSaving((s) => ({ ...s, [row.id]: true }))
    await api.patch(`/api/admin/subject-timing/${row.id}`, { seconds_per_question: val })
    setSaving((s) => ({ ...s, [row.id]: false }))
    setEdits((e) => { const n = { ...e }; delete n[row.id]; return n })
    load()
  }

  const grouped = rows.reduce<Record<string, TimingRow[]>>((acc, r) => {
    if (!acc[r.subject]) acc[r.subject] = []
    acc[r.subject].push(r)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Subject Timing</h1>
      <p className="text-sm text-gray-500">Set seconds per question by subject and difficulty level.</p>

      {Object.entries(grouped).map(([subject, sRows]) => (
        <div key={subject} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-700 capitalize">{subject.replace(/_/g, ' ')}</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {sRows.map((row) => {
              const current = edits[row.id] ?? row.seconds_per_question
              const dirty = edits[row.id] !== undefined && edits[row.id] !== row.seconds_per_question
              return (
                <div key={row.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <span className={`text-sm capitalize font-medium ${
                      row.difficulty === 'easy' ? 'text-green-600' :
                      row.difficulty === 'medium' ? 'text-yellow-600' :
                      'text-red-600'
                    }`}>{row.difficulty}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={10}
                      value={current}
                      onChange={(e) => setValue(row.id, Number(e.target.value))}
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-gray-400">sec/q</span>
                    <button
                      onClick={() => save(row)}
                      disabled={!dirty || saving[row.id]}
                      className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition ${
                        dirty ? 'border-indigo-300 text-indigo-600 hover:bg-indigo-50' : 'border-gray-200 text-gray-300 cursor-default'
                      }`}
                    >
                      <Save size={12} />
                      {saving[row.id] ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {rows.length === 0 && <p className="text-gray-400 text-sm text-center py-12">No timing config found</p>}
    </div>
  )
}
