import { FormEvent, useEffect, useState } from 'react'
import { Edit2, Plus, Trash2, X } from 'lucide-react'
import api from '../../../lib/api'

const SUBJECTS = [
  { key: 'mathematics', label: 'Compulsory Math' },
  { key: 'optional_math', label: 'Optional Math' },
  { key: 'english', label: 'Compulsory English' },
  { key: 'science', label: 'Compulsory Science' },
]

interface Chapter {
  id: string
  subject: string
  chapter_id: string
  display_name: string
  topics: any[]
  sort_order: number
  updated_at: string
}

interface FormState {
  display_name: string
  sort_order: number
  chapter_json: string
}

const emptyForm: FormState = {
  display_name: '',
  sort_order: 0,
  chapter_json: '{\n  "chapter": "compound_interest",\n  "topics": [\n    {\n      "topic": "compound_interest_basics",\n      "subtopics": [\n        "meaning_of_compound_interest",\n        "compound_amount"\n      ]\n    }\n  ]\n}',
}

export default function SubjectChapters() {
  const [subject, setSubject] = useState(SUBJECTS[0].key)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Chapter | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/admin/subject-chapters', { params: { subject } })
      setChapters(res.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load subject chapters')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [subject])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm, sort_order: chapters.length + 1 })
    setModalOpen(true)
    setError('')
  }

  const openEdit = (chapter: Chapter) => {
    setEditing(chapter)
    setForm({
      display_name: chapter.display_name,
      sort_order: chapter.sort_order,
      chapter_json: JSON.stringify({ chapter: chapter.chapter_id, topics: chapter.topics }, null, 2),
    })
    setModalOpen(true)
    setError('')
  }

  const parseChapterJson = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(form.chapter_json)
    } catch (err: any) {
      throw new Error(err.message || 'Invalid JSON')
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Chapter JSON must be an object')
    }
    const chapterJson = parsed as { chapter?: unknown; topics?: unknown }
    if (!chapterJson.chapter || typeof chapterJson.chapter !== 'string') {
      throw new Error('Chapter JSON requires a string "chapter" field')
    }
    if (!Array.isArray(chapterJson.topics)) {
      throw new Error('Chapter JSON requires a "topics" array')
    }
    return chapterJson
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    let chapterJson: any
    try {
      chapterJson = parseChapterJson()
    } catch (err: any) {
      setError(err.message)
      return
    }

    try {
      if (editing) {
        await api.patch(`/api/admin/subject-chapters/${editing.chapter_id}`, {
          subject,
          display_name: form.display_name,
          sort_order: Number(form.sort_order),
          chapter_json: chapterJson,
        })
      } else {
        await api.post('/api/admin/subject-chapters', {
          subject,
          display_name: form.display_name,
          sort_order: Number(form.sort_order),
          chapter_json: chapterJson,
        })
      }
      setModalOpen(false)
      await load()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save chapter')
    }
  }

  const deleteChapter = async (chapter: Chapter) => {
    if (!window.confirm(`Delete ${chapter.display_name}? This cannot be undone.`)) return
    setError('')
    try {
      await api.delete(`/api/admin/subject-chapters/${chapter.chapter_id}`, { params: { subject } })
      await load()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete chapter')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Subject Chapters</h1>
          <p className="text-sm text-gray-500 mt-1">Manage chapter, topic, and subtopic structures used by AI and RAG.</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-indigo-700 transition">
          <Plus size={15} /> Add Chapter
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-2 flex gap-2">
        {SUBJECTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSubject(s.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${subject === s.key ? 'bg-slate-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Order', 'Chapter ID', 'Display Name', 'Topics', 'Updated', 'Actions'].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {chapters.map((chapter) => (
              <tr key={chapter.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 text-gray-600">{chapter.sort_order}</td>
                <td className="px-5 py-3 font-mono text-xs text-gray-600">{chapter.chapter_id}</td>
                <td className="px-5 py-3 font-medium text-gray-900">{chapter.display_name}</td>
                <td className="px-5 py-3 text-gray-500">{chapter.topics?.length || 0}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{new Date(chapter.updated_at).toLocaleDateString()}</td>
                <td className="px-5 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(chapter)} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-200">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => deleteChapter(chapter)} className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && chapters.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No chapters found</td></tr>
            )}
            {loading && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Loading chapters...</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Edit Chapter' : 'Add Chapter'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600">Display Name</span>
                  <input
                    value={form.display_name}
                    onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                    placeholder="Optional; defaults from chapter"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-600">Sort Order</span>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-xs font-medium text-gray-600">Chapter JSON</span>
                <textarea
                  value={form.chapter_json}
                  onChange={(e) => setForm({ ...form, chapter_json: e.target.value })}
                  rows={16}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono"
                />
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700">
                  {editing ? 'Save Changes' : 'Create Chapter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
