import { useEffect, useState, FormEvent, ChangeEvent } from 'react'
import { Plus, Edit2, Check, X, FileText, ChevronDown, ChevronUp, Upload, Trash2 } from 'lucide-react'
import api from '../../lib/api'

interface StreamConfig {
  total_questions: number
  total_time_minutes: number
  question_distribution: Record<string, number>
  class_level_distribution?: Record<string, number> | null
}

interface College {
  id: string
  name: string
  location: string | null
  science_config: StreamConfig | null
  management_config: StreamConfig | null
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

interface SubjectOption {
  key: string
  label: string
}

const MAIN_SUBJECTS: SubjectOption[] = [
  { key: 'mathematics', label: 'Mathematics' },
  { key: 'optional_math', label: 'Optional Math' },
  { key: 'english', label: 'English' },
  { key: 'science', label: 'Science' },
]

type StreamKey = 'science' | 'management'

const EMPTY_STREAM_STATE = { total_questions: 0, total_time_minutes: 0, distribution: {} as Record<string, number> }

function StreamConfigForm({
  subjects,
  total_questions,
  total_time_minutes,
  distribution,
  onChange,
}: {
  subjects: SubjectOption[]
  total_questions: number
  total_time_minutes: number
  distribution: Record<string, number>
  onChange: (patch: { total_questions?: number; total_time_minutes?: number; distribution?: Record<string, number> }) => void
}) {
  const setSubjectCount = (s: string, v: number) => {
    const next = { ...distribution }
    if (v === 0) delete next[s]
    else next[s] = v
    onChange({ distribution: next })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Total Questions</label>
          <input
            type="number" min={0}
            value={total_questions}
            onChange={(e) => onChange({ total_questions: Number(e.target.value) })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Total Time (minutes)</label>
          <input
            type="number" min={0}
            value={total_time_minutes}
            onChange={(e) => onChange({ total_time_minutes: Number(e.target.value) })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-2">Questions per subject (leave 0 to exclude)</p>
        <div className="grid grid-cols-3 gap-2">
          {subjects.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <label className="text-xs text-gray-600 w-32 truncate">{s.label}</label>
              <input
                type="number" min={0}
                value={distribution[s.key] ?? 0}
                onChange={(e) => setSubjectCount(s.key, Number(e.target.value))}
                className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CollegeForm({ initial, subjects, onSave, onCancel }: {
  initial?: Partial<College>
  subjects: SubjectOption[]
  onSave: (data: any) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [activeTab, setActiveTab] = useState<StreamKey>('science')

  const initStream = (cfg: StreamConfig | null | undefined) => ({
    total_questions: cfg?.total_questions ?? 0,
    total_time_minutes: cfg?.total_time_minutes ?? 0,
    distribution: cfg?.question_distribution ?? {},
  })

  const [science, setScience] = useState(initStream(initial?.science_config))
  const [management, setManagement] = useState(initStream(initial?.management_config))

  const patchScience = (patch: { total_questions?: number; total_time_minutes?: number; distribution?: Record<string, number> }) =>
    setScience((prev) => ({ ...prev, ...patch }))
  const patchManagement = (patch: { total_questions?: number; total_time_minutes?: number; distribution?: Record<string, number> }) =>
    setManagement((prev) => ({ ...prev, ...patch }))

  const buildConfig = (state: typeof EMPTY_STREAM_STATE): StreamConfig | null => {
    if (state.total_questions === 0 && state.total_time_minutes === 0 && Object.keys(state.distribution).length === 0) {
      return null
    }
    return {
      total_questions: state.total_questions,
      total_time_minutes: state.total_time_minutes,
      question_distribution: state.distribution,
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      name,
      location: location || null,
      science_config: buildConfig(science),
      management_config: buildConfig(management),
    })
  }

  const TAB_LABELS: Record<StreamKey, string> = { science: 'Science', management: 'Management' }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <input
          placeholder="College name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          placeholder="Location (optional)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Stream tabs */}
      <div>
        <div className="flex gap-1 border-b border-gray-200 mb-4">
          {(['science', 'management'] as StreamKey[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {TAB_LABELS[tab]} stream
            </button>
          ))}
        </div>

        {activeTab === 'science' && (
          <StreamConfigForm
            subjects={subjects}
            total_questions={science.total_questions}
            total_time_minutes={science.total_time_minutes}
            distribution={science.distribution}
            onChange={patchScience}
          />
        )}
        {activeTab === 'management' && (
          <StreamConfigForm
            subjects={subjects}
            total_questions={management.total_questions}
            total_time_minutes={management.total_time_minutes}
            distribution={management.distribution}
            onChange={patchManagement}
          />
        )}
        <p className="text-xs text-gray-400 mt-2">Leave a stream tab blank (all zeros) to not configure it.</p>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-indigo-700 transition"
        >
          <Check size={14} /> {initial?.id ? 'Save Changes' : 'Add College'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-2 border border-gray-300 text-gray-600 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition"
          >
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

  const [sylYear, setSylYear] = useState('')
  const [sylName, setSylName] = useState('')
  const [sylFile, setSylFile] = useState<File | null>(null)
  const [uploadingSyl, setUploadingSyl] = useState(false)

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
          <input type="number" placeholder="Year" value={sylYear} onChange={(e) => setSylYear(e.target.value)} required
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          <input type="text" placeholder="Display name" value={sylName} onChange={(e) => setSylName(e.target.value)} required
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          <input type="file" accept=".pdf"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSylFile(e.target.files?.[0] || null)}
            required={!sylFile}
            className="block text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-700" />
          <button type="submit" disabled={uploadingSyl}
            className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
            <Upload size={11} /> {uploadingSyl ? 'Uploading...' : 'Upload Syllabus'}
          </button>
        </form>
      </div>

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
          <input type="number" placeholder="Year" value={ppYear} onChange={(e) => setPpYear(e.target.value)} required
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
          <input type="file" accept=".pdf"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPpFile(e.target.files?.[0] || null)}
            required={!ppFile}
            className="block text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-indigo-50 file:text-indigo-700" />
          <button type="submit" disabled={uploadingPp}
            className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
            <Upload size={11} /> {uploadingPp ? 'Uploading...' : 'Upload Paper'}
          </button>
        </form>
      </div>
    </div>
  )
}

function StreamConfigBadge({ label, cfg }: { label: string; cfg: StreamConfig | null }) {
  if (!cfg) return null
  return (
    <div className="mt-1">
      <span className="text-xs font-medium text-gray-500">{label}:</span>
      <span className="text-xs text-gray-600 ml-1">{cfg.total_questions} questions · {cfg.total_time_minutes} min</span>
      {Object.keys(cfg.question_distribution).length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {Object.entries(cfg.question_distribution).map(([s, n]) => (
            <span key={s} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
              {s.replace(/_/g, ' ')}: {n}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Colleges() {
  const [colleges, setColleges] = useState<College[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>(MAIN_SUBJECTS)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<College | null>(null)
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())

  const load = () => api.get('/api/admin/colleges').then((r) => setColleges(r.data))

  useEffect(() => {
    load()
    api.get('/api/admin/extra-subjects')
      .then((r) => {
        const extra: SubjectOption[] = (r.data as { subject_key: string; display_name: string }[])
          .map((s) => ({ key: s.subject_key, label: s.display_name }))
        setSubjects([...MAIN_SUBJECTS, ...extra])
      })
      .catch(() => {})
  }, [])

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
          <CollegeForm subjects={subjects} onSave={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {colleges.map((c) => (
        <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-5">
          {editing?.id === c.id ? (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Editing: {c.name}</h2>
              <CollegeForm
                initial={editing}
                subjects={subjects}
                onSave={(d) => handleUpdate(c.id, d)}
                onCancel={() => setEditing(null)}
              />
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
                  <StreamConfigBadge label="Science" cfg={c.science_config} />
                  <StreamConfigBadge label="Management" cfg={c.management_config} />
                  {!c.science_config && !c.management_config && (
                    <p className="text-xs text-amber-600">No exam format configured yet.</p>
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
