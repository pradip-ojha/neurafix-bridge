import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import api from '../../../lib/api'

interface UploadResult {
  accepted: number
  rejected: number
  errors: string[]
}

interface Stat {
  subject: string
  chapter: string
  difficulty: string
  count: number
}

export default function Questions() {
  const [tab, setTab] = useState<'main' | 'extra'>('main')
  const [subject, setSubject] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<Stat[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const loadStats = () => {
    const params: Record<string, string> = {}
    if (subject) params.subject = subject
    api.get('/api/admin/questions/stats', { params }).then((r) => setStats(r.data))
  }

  useEffect(() => { loadStats() }, [tab])

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return
    setError(''); setResult(null); setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (tab === 'extra') fd.append('subject', subject)
      const endpoint = tab === 'main' ? '/api/admin/questions/upload/main' : '/api/admin/questions/upload/extra'
      const res = await api.post(endpoint, fd)
      setResult(res.data)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      loadStats()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Questions</h1>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['main', 'extra'] as const).map((t) => (
          <button key={t} onClick={() => { setTab(t); setResult(null); setError('') }}
            className={`px-4 py-1.5 text-sm rounded-lg capitalize transition ${tab === t ? 'bg-white shadow font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'main' ? 'Main Subjects' : 'Extra Subjects'}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Upload JSON file</h2>
        <form onSubmit={handleUpload} className="space-y-3">
          {tab === 'extra' && (
            <input placeholder="Subject key (e.g. gk)" value={subject} onChange={(e) => setSubject(e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          )}
          <input ref={fileRef} type="file" accept=".json" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={uploading} className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50 transition">
            <Upload size={15} />
            {uploading ? 'Uploading…' : 'Upload Questions'}
          </button>
        </form>

        {result && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm space-y-1">
            <p className="text-green-600 font-medium">Accepted: {result.accepted}</p>
            <p className="text-red-500 font-medium">Rejected: {result.rejected}</p>
            {result.errors.length > 0 && (
              <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {result.errors.map((e, i) => <li key={i} className="text-red-400 text-xs">{e}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Question Pool Stats</h2>
          <button onClick={loadStats} className="text-xs text-indigo-500 hover:underline">Refresh</button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Subject', 'Chapter', 'Difficulty', 'Count'].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stats.map((s, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-5 py-2.5 text-gray-700">{s.subject}</td>
                <td className="px-5 py-2.5 text-gray-500">{s.chapter}</td>
                <td className="px-5 py-2.5 capitalize text-gray-500">{s.difficulty}</td>
                <td className="px-5 py-2.5 font-medium">{s.count}</td>
              </tr>
            ))}
            {stats.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">No questions uploaded</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
