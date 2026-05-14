import { useState, useEffect, FormEvent } from 'react'
import api from '../../lib/api'
import { Plus, Pencil, Trash2, CheckCircle, XCircle, Save, Globe } from 'lucide-react'

interface FAQ {
  id: number
  question: string
  answer: string
  display_order: number
  is_active: boolean
}

const emptyForm = { question: '', answer: '', display_order: 0, is_active: true }

export default function HomepageConfig() {
  const [tab, setTab] = useState<'faqs' | 'demo'>('faqs')

  // ── FAQs ──────────────────────────────────────────────────────────────────
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [faqsLoading, setFaqsLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [faqError, setFaqError] = useState('')

  // ── Demo video ────────────────────────────────────────────────────────────
  const [demoUrl, setDemoUrl] = useState('')
  const [demoLoading, setDemoLoading] = useState(true)
  const [demoSaving, setDemoSaving] = useState(false)
  const [demoMsg, setDemoMsg] = useState('')

  useEffect(() => {
    loadFaqs()
    loadDemo()
  }, [])

  async function loadFaqs() {
    setFaqsLoading(true)
    try {
      const { data } = await api.get<FAQ[]>('/api/admin/faqs')
      setFaqs(data)
    } finally {
      setFaqsLoading(false)
    }
  }

  async function loadDemo() {
    setDemoLoading(true)
    try {
      const { data } = await api.get<{ demo_video_url: string | null }>('/api/admin/homepage')
      setDemoUrl(data.demo_video_url ?? '')
    } catch {
      // fallback: try public endpoint
      try {
        const { data } = await api.get<{ demo_video_url: string | null }>('/api/public/homepage')
        setDemoUrl(data.demo_video_url ?? '')
      } catch {}
    } finally {
      setDemoLoading(false)
    }
  }

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setFaqError('')
    setFormOpen(true)
  }

  function openEdit(faq: FAQ) {
    setEditingId(faq.id)
    setForm({ question: faq.question, answer: faq.answer, display_order: faq.display_order, is_active: faq.is_active })
    setFaqError('')
    setFormOpen(true)
  }

  async function submitFaq(e: FormEvent) {
    e.preventDefault()
    if (!form.question.trim() || !form.answer.trim()) {
      setFaqError('Question and answer are required.')
      return
    }
    setSaving(true)
    setFaqError('')
    try {
      if (editingId !== null) {
        await api.put(`/api/admin/faqs/${editingId}`, form)
      } else {
        await api.post('/api/admin/faqs', form)
      }
      setFormOpen(false)
      await loadFaqs()
    } catch {
      setFaqError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteFaq(id: number) {
    if (!confirm('Delete this FAQ?')) return
    try {
      await api.delete(`/api/admin/faqs/${id}`)
      await loadFaqs()
    } catch {
      alert('Failed to delete.')
    }
  }

  async function saveDemo(e: FormEvent) {
    e.preventDefault()
    setDemoSaving(true)
    setDemoMsg('')
    try {
      await api.patch('/api/admin/homepage', { demo_video_url: demoUrl.trim() || null })
      setDemoMsg('Saved.')
    } catch {
      setDemoMsg('Failed to save.')
    } finally {
      setDemoSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-slate-100 mb-1">Homepage Configuration</h1>
      <p className="text-sm text-slate-400 mb-6">Manage the public landing page FAQs and demo video.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-700/60">
        {(['faqs', 'demo'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px capitalize ${
              tab === t ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t === 'faqs' ? 'FAQs' : 'Demo Video'}
          </button>
        ))}
      </div>

      {/* FAQs tab */}
      {tab === 'faqs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">FAQs displayed on the public homepage. Sorted by display order.</p>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={14} /> Add FAQ
            </button>
          </div>

          {/* Form */}
          {formOpen && (
            <form onSubmit={submitFaq} className="rounded-xl border border-indigo-500/30 bg-indigo-600/5 p-5 space-y-4">
              <p className="font-medium text-slate-200 text-sm">{editingId !== null ? 'Edit FAQ' : 'New FAQ'}</p>
              {faqError && <p className="text-red-400 text-xs">{faqError}</p>}
              <div>
                <label className="text-xs text-slate-400 block mb-1">Question</label>
                <textarea
                  rows={2}
                  value={form.question}
                  onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2 resize-none focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Answer</label>
                <textarea
                  rows={4}
                  value={form.answer}
                  onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2 resize-none focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Display Order</label>
                  <input
                    type="number"
                    value={form.display_order}
                    onChange={(e) => setForm((f) => ({ ...f, display_order: parseInt(e.target.value) || 0 }))}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-end gap-2 pb-0.5">
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                      className="rounded accent-indigo-600"
                    />
                    Active (shown on page)
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
                  <Save size={13} /> {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setFormOpen(false)} className="text-sm text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* List */}
          {faqsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-800 animate-pulse" />)}
            </div>
          ) : faqs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">No FAQs yet. Add your first FAQ above.</div>
          ) : (
            <div className="space-y-2">
              {faqs.map((faq) => (
                <div key={faq.id} className="flex items-start gap-3 p-4 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {faq.is_active
                        ? <CheckCircle size={13} className="text-green-400 flex-shrink-0" />
                        : <XCircle size={13} className="text-slate-500 flex-shrink-0" />}
                      <p className="text-sm font-medium text-slate-200 truncate">{faq.question}</p>
                      <span className="text-xs text-slate-500 ml-auto flex-shrink-0">order: {faq.display_order}</span>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2">{faq.answer}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(faq)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-indigo-400 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteFaq(faq.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Demo Video tab */}
      {tab === 'demo' && (
        <div className="max-w-xl space-y-4">
          <p className="text-sm text-slate-400">Set the demo video URL shown on the public homepage. Supports YouTube or direct video URLs. Leave blank to show a placeholder.</p>
          <form onSubmit={saveDemo} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Demo Video URL</label>
              {demoLoading ? (
                <div className="h-10 rounded-lg bg-slate-800 animate-pulse" />
              ) : (
                <div className="flex gap-2">
                  <div className="flex items-center gap-2 flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3">
                    <Globe size={14} className="text-slate-500 flex-shrink-0" />
                    <input
                      type="url"
                      value={demoUrl}
                      onChange={(e) => setDemoUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="flex-1 bg-transparent text-slate-200 text-sm py-2.5 focus:outline-none placeholder:text-slate-600"
                    />
                  </div>
                  {demoUrl && (
                    <button type="button" onClick={() => setDemoUrl('')} className="text-xs text-slate-500 hover:text-slate-300 px-2">
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
            {demoMsg && (
              <p className={`text-xs ${demoMsg === 'Saved.' ? 'text-green-400' : 'text-red-400'}`}>{demoMsg}</p>
            )}
            <button
              type="submit"
              disabled={demoSaving || demoLoading}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <Save size={13} /> {demoSaving ? 'Saving…' : 'Save Demo URL'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
