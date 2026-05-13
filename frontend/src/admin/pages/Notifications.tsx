import { useState } from 'react'
import { Bell } from 'lucide-react'
import api from '../../lib/api'

export default function Notifications() {
  const [target, setTarget] = useState<'all' | 'paid' | 'free'>('all')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true); setResult(null)
    try {
      await api.post('/api/admin/notifications/send', { target, title, body })
      setResult('Notification queued successfully')
      setTitle(''); setBody('')
    } catch {
      setResult('Failed to send notification')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900">Push Notifications</h1>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <form onSubmit={handleSend} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Target</label>
            <div className="flex gap-3">
              {(['all', 'paid', 'free'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" value={t} checked={target === t} onChange={() => setTarget(t)} className="accent-indigo-600" />
                  <span className="text-sm capitalize text-gray-700">{t}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Notification title" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={4} placeholder="Notification message…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>

          {result && <p className={`text-sm ${result.includes('Failed') ? 'text-red-500' : 'text-green-600'}`}>{result}</p>}

          <button type="submit" disabled={sending}
            className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50 transition">
            <Bell size={14} />
            {sending ? 'Sending…' : 'Send Notification'}
          </button>
        </form>
      </div>

      <p className="text-xs text-gray-400">Note: push delivery is a placeholder — real push integration will be added in a later phase.</p>
    </div>
  )
}
