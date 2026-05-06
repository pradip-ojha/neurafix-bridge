import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2 } from 'lucide-react'
import api from '../../../lib/api'

interface Note {
  id: string
  subject: string
  chapter: string
  level: number
  display_name: string
  r2_url: string
  created_at: string
}

export default function LevelNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [subject, setSubject] = useState('')
  const [chapter, setChapter] = useState('')
  const [level, setLevel] = useState(1)
  const [displayName, setDisplayName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = () => api.get('/api/admin/level-notes').then((r) => setNotes(r.data))
  useEffect(() => { load() }, [])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setError(''); setUploading(true)
    try {
      const fd = new FormData()
      fd.append('subject', subject)
      fd.append('chapter', chapter)
      fd.append('level', String(level))
      fd.append('display_name', displayName)
      fd.append('file', file)
      await api.post('/api/admin/level-notes', fd)
      setSubject(''); setChapter(''); setDisplayName(''); setFile(null); setLevel(1)
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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Level Notes</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Upload PDF Note</h2>
        <form onSubmit={handleUpload} className="grid grid-cols-2 gap-4">
          <input placeholder="Subject (e.g. compulsory_math)" value={subject} onChange={(e) => setSubject(e.target.value)} required className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Chapter (e.g. sets)" value={chapter} onChange={(e) => setChapter(e.target.value)} required className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value={1}>Level 1 — Strong</option>
            <option value={2}>Level 2 — Average</option>
            <option value={3}>Level 3 — Weak</option>
          </select>
          <input ref={fileRef} type="file" accept=".pdf" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          {error && <p className="col-span-2 text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={uploading} className="col-span-2 flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-lg py-2 text-sm hover:bg-indigo-700 disabled:opacity-50 transition">
            <Upload size={15} />
            {uploading ? 'Uploading…' : 'Upload Note'}
          </button>
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Display Name', 'Subject', 'Chapter', 'Level', 'Date', ''].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {notes.map((n) => (
              <tr key={n.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">
                  <a href={n.r2_url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">{n.display_name}</a>
                </td>
                <td className="px-5 py-3 text-gray-500">{n.subject}</td>
                <td className="px-5 py-3 text-gray-500">{n.chapter}</td>
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    n.level === 1 ? 'bg-green-100 text-green-700' :
                    n.level === 2 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-600'
                  }`}>Level {n.level}</span>
                </td>
                <td className="px-5 py-3 text-gray-500 text-xs">{new Date(n.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-3">
                  <button onClick={() => deleteNote(n.id)} className="text-red-400 hover:text-red-600 transition">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {notes.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No level notes uploaded</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
