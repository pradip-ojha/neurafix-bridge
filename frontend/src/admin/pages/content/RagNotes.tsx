import { useEffect, useRef, useState } from 'react'
import { Upload, Trash2, RefreshCw } from 'lucide-react'
import api from '../../../lib/api'

interface Note {
  id: string
  note_id: string
  subject: string
  chapter: string
  display_name: string
  status: string
  total_chunks: number | null
  error_message: string | null
  created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-600',
  processing: 'bg-blue-100 text-blue-600',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-600',
}

export default function RagNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [subject, setSubject] = useState('')
  const [chapter, setChapter] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = () => api.get('/api/admin/rag/notes').then((r) => setNotes(r.data))

  useEffect(() => {
    load()
    pollRef.current = setInterval(() => {
      setNotes((prev) => {
        const hasProcessing = prev.some((n) => n.status === 'processing' || n.status === 'queued')
        if (hasProcessing) load()
        return prev
      })
    }, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
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
      fd.append('display_name', displayName)
      fd.append('file', file)
      await api.post('/api/admin/rag/upload-note', fd)
      setSubject(''); setChapter(''); setDisplayName(''); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      load()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const deleteNote = async (noteId: string) => {
    if (!confirm('Delete this note and all its vectors?')) return
    await api.delete(`/api/admin/rag/notes/${noteId}`)
    load()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">RAG Notes</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Upload Note</h2>
        <form onSubmit={handleUpload} className="grid grid-cols-2 gap-4">
          <input placeholder="Subject (e.g. mathematics, science, english, optional_math)" value={subject} onChange={(e) => setSubject(e.target.value)} required className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Chapter (e.g. sets)" value={chapter} onChange={(e) => setChapter(e.target.value)} required className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input ref={fileRef} type="file" accept=".txt,.md" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          {error && <p className="col-span-2 text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={uploading} className="col-span-2 flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-lg py-2 text-sm hover:bg-indigo-700 disabled:opacity-50 transition">
            <Upload size={15} />
            {uploading ? 'Uploading…' : 'Upload & Process'}
          </button>
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Display Name', 'Subject', 'Chapter', 'Status', 'Chunks', 'Date', ''].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {notes.map((n) => (
              <tr key={n.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{n.display_name}</td>
                <td className="px-5 py-3 text-gray-500">{n.subject}</td>
                <td className="px-5 py-3 text-gray-500">{n.chapter}</td>
                <td className="px-5 py-3">
                  <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium w-fit ${STATUS_COLORS[n.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {(n.status === 'processing' || n.status === 'queued') && <RefreshCw size={10} className="animate-spin" />}
                    {n.status}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-500">{n.total_chunks ?? '—'}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{new Date(n.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-3">
                  <button onClick={() => deleteNote(n.note_id)} className="text-red-400 hover:text-red-600 transition">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {notes.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">No notes uploaded</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
