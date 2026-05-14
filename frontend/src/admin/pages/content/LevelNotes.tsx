import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, FileText } from 'lucide-react'
import api from '../../../lib/api'

interface Note {
  id: string
  subject: string
  chapter: string
  level: number
  r2_url: string
  created_at: string
}

const LEVEL_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Level 1 — Strong', color: 'bg-green-100 text-green-700' },
  2: { label: 'Level 2 — Average', color: 'bg-yellow-100 text-yellow-700' },
  3: { label: 'Level 3 — Weak', color: 'bg-red-100 text-red-600' },
}

export default function LevelNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [activeLevel, setActiveLevel] = useState<1 | 2 | 3>(1)

  const [subject, setSubject] = useState('')
  const [chapter, setChapter] = useState('')
  const [level, setLevel] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () =>
    api.get('/api/admin/level-notes').then((r) => setNotes(r.data))

  useEffect(() => {
    load()
  }, [])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('subject', subject)
      fd.append('chapter', chapter)
      fd.append('level', String(level))
      fd.append('file', file)
      await api.post('/api/admin/level-notes', fd)
      setSubject('')
      setChapter('')
      setLevel(1)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      load()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const deleteNote = async (id: string) => {
    if (!confirm('Delete this level note?')) return
    await api.delete(`/api/admin/level-notes/${id}`)
    load()
  }

  const filtered = notes.filter((n) => n.level === activeLevel)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Level Notes</h1>
        <p className="text-gray-500 text-sm mt-1">Upload one PDF per subject, chapter, and level</p>
      </div>

      {/* Upload form */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Upload PDF Note</h2>
        <form onSubmit={handleUpload} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
            <input
              placeholder="e.g. mathematics, science, english, optional_math"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Chapter</label>
            <input
              placeholder="e.g. sets"
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Level</label>
            <select
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={1}>Level 1 — Strong foundation</option>
              <option value={2}>Level 2 — Average</option>
              <option value={3}>Level 3 — Weak foundation</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">PDF File</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </div>

          {error && (
            <p className="md:col-span-2 text-red-500 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={uploading}
            className="md:col-span-2 flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {uploading ? (
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block" />
            ) : (
              <Upload size={15} />
            )}
            {uploading ? 'Uploading…' : 'Upload Note'}
          </button>
        </form>
      </div>

      {/* Level tabs + list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-gray-200">
          {([1, 2, 3] as const).map((lvl) => {
            const count = notes.filter((n) => n.level === lvl).length
            const { label, color } = LEVEL_LABELS[lvl]
            return (
              <button
                key={lvl}
                onClick={() => setActiveLevel(lvl)}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                  activeLevel === lvl
                    ? 'border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50/40'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{label}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  activeLevel === lvl ? 'bg-indigo-100 text-indigo-700' : color
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Notes table */}
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Subject', 'Chapter', 'Uploaded', ''].map((h) => (
                <th
                  key={h}
                  className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((n) => (
              <tr key={n.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{n.subject}</td>
                <td className="px-5 py-3 text-gray-600">{n.chapter}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">
                  {new Date(n.created_at).toLocaleDateString()}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <a
                      href={n.r2_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                    >
                      <FileText size={13} /> View PDF
                    </a>
                    <button
                      onClick={() => deleteNote(n.id)}
                      className="text-red-400 hover:text-red-600 transition"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-gray-400">
                  No Level {activeLevel} notes uploaded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
