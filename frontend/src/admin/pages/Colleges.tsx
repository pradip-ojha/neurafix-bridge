import { useEffect, useState, FormEvent, ChangeEvent } from 'react'
import { Plus, Edit2, Check, X, FileText, ChevronDown, ChevronUp, Upload, Trash2 } from 'lucide-react'
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

interface Syllabus {
  id: string
  year: number
  display_name: string
  file_url: string
}

interface Paper {
  id: string
  year: number
  file_url: string
}

const SUBJECTS = ['mathematics', 'optional_math', 'english', 'science', 'gk', 'iq', 'computer_science']

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

function CollegeDocuments({ collegeId }: { collegeId: string }) {
  const [syllabi, setSyllabi] = useState<Syllabus[]>([])
  const [papers, setPapers] = useState<Paper[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)

  // Syllabus upload state
  const [sylYear, setSylYear] = useState('')
  const [sylName, setSylName] = useState('')
  const [sylFile, setSylFile] = useState<File | null>(null)
  const [uploadingSyl, setUploadingSyl] = useState(false)

  // Past paper upload state
  const [ppYear, setPpYear] = useState('')
  const [ppFile, setPpFile] = useState<File | null>(null)
  const [uploadingPp, setUploadingPp] = useState(false)

  const loadDocs = () => {
    setLoadingDocs(true)
    Promise.all([
      api.get(`/api/colleges/${collegeId}/syllabus`),
      api.get(`/api/colleges/${collegeId}/past-questions`),
    ])
      .then(([s, p]) => { setSyllabi(s.data); setPapers(p.data) })
      .catch(() => {})
      .finally(() => setLoadingDocs(false))
  }

  useEffect(() => { loadDocs() }, [collegeId])

  const handleSyllabusUpload = async (e: FormEvent) => {
    e.preventDefault()
    if (!sylFile || !sylYear || !sylName) return
    setUploadingSyl(true)
    try {
      const fd = new FormData()
      fd.append('year', sylYear)
      fd.append('display_name', sylName)
      fd.append('file', sylFile)
      await api.post(`/api/admin/colleges/${collegeId}/syllabus`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setSylYear(''); setSylName(''); setSylFile(null)
      loadDocs()
    } catch { /* ignore */ }
    finally { setUploadingSyl(false) }
  }

  const handlePaperUpload = async (e: FormEvent) => {
    e.preventDefault()
    if (!ppFile || !ppYear) return
    setUploadingPp(true)
    try {
      const fd = new FormData()
      fd.append('year', ppYear)
      fd.append('file', ppFile)
      await api.post(`/api/admin/colleges/${collegeId}/past-questions`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPpYear(''); setPpFile(null)
      loadDocs()
    } catch { /* ignore */ }
    finally { setUploadingPp(false) }
  }

  if (loadingDocs) return <p className="text-xs text-gray-400 py-2">Loading documents...</p>

  return (
    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-6">
      {/* Syllabus section */}
      <div>
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Syllabus</h4>
        {syllabi.length > 0 && (
          <ul className="space-y-1 mb-3">
            {syllabi.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-xs text-gray-600">
                <FileText size={12} className="text-indigo-400 flex-shrink-0" />
                <a href={s.file_url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 truncate">
                  {s.display_name} ({s.year})
                </a>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handleSyllabusUpload} className="space-y-2">
          <input
            type="number"
            placeholder="Year"
            value={sylYear}
            onChange={(e) => setSylYear(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <input
            type="text"
            placeholder="Display name"
            value={sylName}
            onChange={(e) => setSylName(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <input
            type="file"
            accept=".pdf"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSylFile(e.target.files?.[0] || null)}
            required={!sylFile}
            className="block text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-700"
          />
          <button
            type="submit"
            disabled={uploadingSyl}
            className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            <Upload size={11} /> {uploadingSyl ? 'Uploading...' : 'Upload Syllabus'}
          </button>
        </form>
      </div>

      {/* Past questions section */}
      <div>
        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Past Question Papers</h4>
        {papers.length > 0 && (
          <ul className="space-y-1 mb-3">
            {papers.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs text-gray-600">
                <FileText size={12} className="text-indigo-400 flex-shrink-0" />
                <a href={p.file_url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">
                  Paper {p.year}
                </a>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={handlePaperUpload} className="space-y-2">
          <input
            type="number"
            placeholder="Year"
            value={ppYear}
            onChange={(e) => setPpYear(e.target.value)}
            required
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <input
            type="file"
            accept=".pdf"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPpFile(e.target.files?.[0] || null)}
            required={!ppFile}
            className="block text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-700"
          />
          <button
            type="submit"
            disabled={uploadingPp}
            className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            <Upload size={11} /> {uploadingPp ? 'Uploading...' : 'Upload Paper'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function Colleges() {
  const [colleges, setColleges] = useState<College[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<College | null>(null)
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())

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

  const handleDelete = async (c: College) => {
    if (!window.confirm(`Delete "${c.name}"? This cannot be undone.`)) return
    await api.delete(`/api/admin/colleges/${c.id}`)
    load()
  }

  const toggleDocs = (id: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
            <>
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
                  <button onClick={() => toggleDocs(c.id)} className="flex items-center gap-1 text-xs border border-gray-300 text-gray-500 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition">
                    {expandedDocs.has(c.id) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    Documents
                  </button>
                  <button onClick={() => setEditing(c)} className="p-1.5 text-gray-400 hover:text-indigo-600 transition"><Edit2 size={15} /></button>
                  <button onClick={() => toggleActive(c)} className={`text-xs px-3 py-1.5 border rounded-lg transition ${c.is_active ? 'border-gray-300 text-gray-500 hover:bg-gray-50' : 'border-green-300 text-green-600 hover:bg-green-50'}`}>
                    {c.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={() => handleDelete(c)} className="p-1.5 text-gray-400 hover:text-red-600 transition"><Trash2 size={15} /></button>
                </div>
              </div>

              {expandedDocs.has(c.id) && <CollegeDocuments collegeId={c.id} />}
            </>
          )}
        </div>
      ))}

      {colleges.length === 0 && !showForm && (
        <p className="text-gray-400 text-sm text-center py-12">No colleges added yet</p>
      )}
    </div>
  )
}
