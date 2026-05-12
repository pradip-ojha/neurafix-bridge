import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { Send, Download, BookOpen, MessageSquare, Zap, PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import AIThinkingState from './AIThinkingState'
import MarkdownRenderer from './MarkdownRenderer'
import DarkSkeleton from './DarkSkeleton'
import { useMobileLayout } from '../../contexts/MobileLayoutContext'

interface CapsuleItem {
  id: string
  capsule_date: string
  created_at: string
}

interface Message { role: 'user' | 'assistant'; content: string }

interface Props { subject: string }

interface SectionItem { text: string; sub?: string; type?: string }
interface McqOption { id: string; text: string; correct: boolean }
interface CapsuleSection {
  id: string; items?: SectionItem[]; text?: string
  question?: string; options?: McqOption[]; explanation?: string
}
interface CapsuleJson { sections: CapsuleSection[] }

const SECTION_CONFIG: Record<string, { label: string; border: string; heading: string; icon: string; bg: string }> = {
  key_concepts:    { label: 'Key Concepts',     bg: 'bg-indigo-600/10', border: 'border-indigo-500/20', heading: 'text-indigo-400',  icon: '💡' },
  watch_out:       { label: 'Watch Out For',    bg: 'bg-red-600/10',    border: 'border-red-500/20',    heading: 'text-red-400',     icon: '⚠️' },
  remember:        { label: 'Remember',         bg: 'bg-green-600/10',  border: 'border-green-500/20',  heading: 'text-green-400',   icon: '🧠' },
  tomorrows_focus: { label: "Tomorrow's Focus", bg: 'bg-violet-600/10', border: 'border-violet-500/20', heading: 'text-violet-400',  icon: '🎯' },
  quick_review:    { label: 'Quick Review',     bg: 'bg-amber-600/10',  border: 'border-amber-500/20',  heading: 'text-amber-400',   icon: '📝' },
}

function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g
  let last = 0; let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    if (match[1] !== undefined) parts.push(<strong key={match.index} className="font-semibold text-slate-200">{match[1]}</strong>)
    else if (match[2] !== undefined) parts.push(<em key={match.index} className="italic text-slate-300">{match[2]}</em>)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length > 0 ? parts : [text]
}

function ItemList({ items, sectionId }: { items: SectionItem[]; sectionId: string }) {
  const dotColor = sectionId === 'watch_out' ? 'bg-red-400' : sectionId === 'remember' ? 'bg-green-500' : 'bg-indigo-400'
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className={`mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${dotColor}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-relaxed text-slate-300">{parseInline(item.text)}</p>
            {item.sub && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.sub}</p>}
            {item.type === 'mnemonic' && (
              <span className="inline-block mt-1 text-xs font-medium text-teal-400 bg-teal-600/10 border border-teal-500/20 rounded px-1.5 py-0.5">MNEMONIC</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function QuickReview({ question, options, explanation }: { question: string; options: McqOption[]; explanation: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-300 leading-relaxed">{question}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          let cls = 'text-left px-3 py-2 rounded-xl border text-xs transition-colors '
          if (!selected) cls += 'border-white/[0.1] bg-study-elevated hover:border-amber-500/30 text-slate-300 cursor-pointer'
          else if (opt.id === selected) cls += opt.correct ? 'border-green-500/40 bg-green-600/10 text-green-300 font-medium cursor-default' : 'border-red-500/40 bg-red-600/10 text-red-300 cursor-default'
          else if (opt.correct) cls += 'border-green-500/30 bg-green-600/10 text-green-400 cursor-default'
          else cls += 'border-transparent text-slate-600 cursor-default'
          return (
            <button key={opt.id} onClick={() => { if (!selected) setSelected(opt.id) }} disabled={!!selected} className={cls}>
              <span className="font-semibold mr-1.5">{opt.id}.</span>{opt.text}
              {selected && opt.correct && <span className="ml-1">✓</span>}
            </button>
          )
        })}
      </div>
      {selected && <p className="text-xs text-slate-400 bg-study-elevated border border-white/[0.07] rounded-xl px-3 py-2 leading-relaxed"><span className="font-semibold text-amber-400">Explanation: </span>{explanation}</p>}
      {!selected && <p className="text-xs text-slate-600">Click an option to reveal the answer.</p>}
    </div>
  )
}

function CapsuleContent({ content }: { content: string }) {
  let parsed: CapsuleJson | null = null
  try { const obj = JSON.parse(content); if (obj?.sections?.length > 0) parsed = obj } catch {}
  if (!parsed) return <MarkdownRenderer content={content} />
  return (
    <div className="space-y-4">
      {parsed.sections.map((section) => {
        const cfg = SECTION_CONFIG[section.id]
        if (!cfg) return null
        return (
          <div key={section.id} className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-5`}>
            <h3 className={`text-sm font-semibold ${cfg.heading} mb-3 flex items-center gap-1.5`}>
              <span>{cfg.icon}</span>{cfg.label}
            </h3>
            {(section.id === 'key_concepts' || section.id === 'watch_out' || section.id === 'remember') && section.items && (
              <ItemList items={section.items} sectionId={section.id} />
            )}
            {section.id === 'tomorrows_focus' && section.text && (
              <p className="text-sm leading-relaxed text-slate-300">{parseInline(section.text)}</p>
            )}
            {section.id === 'quick_review' && section.question && section.options && (
              <QuickReview question={section.question} options={section.options} explanation={section.explanation || ''} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function groupByMonth(items: CapsuleItem[]) {
  const groups: Record<string, CapsuleItem[]> = {}
  for (const item of items) {
    const month = item.capsule_date.slice(0, 7)
    if (!groups[month]) groups[month] = []
    groups[month].push(item)
  }
  return groups
}

function formatDate(dateStr: string) {
  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function CapsuleTab({ subject }: Props) {
  const [history, setHistory]               = useState<CapsuleItem[]>([])
  const [selectedDate, setSelectedDate]     = useState<string | null>(null)
  const [capsuleContent, setCapsuleContent] = useState<string | null>(null)
  const [capsuleStatus, setCapsuleStatus]  = useState<'loading' | 'not_generated' | 'ok'>('loading')
  const [activeView, setActiveView]         = useState<'capsule' | 'chat'>('capsule')
  const [sidebarOpen, setSidebarOpen]       = useState(window.innerWidth >= 768)
  const { mainSidebarOpen } = useMobileLayout()

  const [messages, setMessages]             = useState<Message[]>([])
  const [input, setInput]                   = useState('')
  const [isStreaming, setIsStreaming]       = useState(false)
  const [streamingText, setStreamingText]  = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)

  const fetchHistory = async () => {
    try {
      const res = await fetch(`/api/capsule/${subject}/history`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      })
      if (res.ok) setHistory(await res.json())
    } catch {}
  }

  const fetchTodayCapsule = async () => {
    setCapsuleStatus('loading')
    try {
      const res = await fetch(`/api/capsule/${subject}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'not_generated') { setCapsuleStatus('not_generated'); setCapsuleContent(null); setSelectedDate(null) }
        else { setCapsuleStatus('ok'); setCapsuleContent(data.content); setSelectedDate(data.capsule_date) }
      }
    } catch { setCapsuleStatus('not_generated') }
  }

  const fetchCapsuleByDate = async (dateStr: string) => {
    setCapsuleStatus('loading')
    try {
      const res = await fetch(`/api/capsule/${subject}/${dateStr}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      })
      if (res.ok) {
        const data = await res.json()
        setCapsuleStatus('ok'); setCapsuleContent(data.content); setSelectedDate(data.capsule_date)
        setMessages([]); setActiveView('capsule')
      }
    } catch {}
  }

  useEffect(() => { fetchHistory(); fetchTodayCapsule() }, [subject])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingText])
  useEffect(() => {
    if (mainSidebarOpen && window.innerWidth < 768) setSidebarOpen(false)
  }, [mainSidebarOpen])

  const downloadCapsule = () => {
    if (!capsuleContent || !selectedDate) return
    let text = capsuleContent
    try { text = JSON.stringify(JSON.parse(capsuleContent), null, 2) } catch {}
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `capsule-${subject}-${selectedDate}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setInput(''); if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setIsStreaming(true); setStreamingText('')
    try {
      const response = await fetch(`/api/capsule/${subject}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('token')}` },
        body: JSON.stringify({ message: text, capsule_date: selectedDate }),
      })
      if (response.status === 402) { window.location.href = '/student/payment'; return }
      if (response.status === 429) { setMessages((prev) => [...prev, { role: 'assistant', content: 'Daily limit reached. Resets tomorrow.' }]); setStreamingText(''); return }
      if (!response.ok || !response.body) { setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]); setStreamingText(''); return }
      const reader = response.body.getReader(); const decoder = new TextDecoder()
      let accumulated = ''; let buffer = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.chunk) { accumulated += data.chunk; setStreamingText(accumulated) }
            if (data.done) { setMessages((prev) => [...prev, { role: 'assistant', content: data.full_text || accumulated }]); setStreamingText('') }
            if (data.error) { setMessages((prev) => [...prev, { role: 'assistant', content: data.error }]); setStreamingText('') }
          } catch {}
        }
      }
    } catch { setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]); setStreamingText('') }
    finally { setIsStreaming(false) }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`
  }

  const monthGroups = groupByMonth(history)

  return (
    <div className="flex h-full bg-study-bg relative overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-10 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`flex-shrink-0 bg-study-surface border-r border-white/[0.06] flex flex-col overflow-hidden transition-all duration-200 md:relative ${sidebarOpen ? 'w-48 fixed md:relative inset-y-0 left-0 z-20 md:z-auto' : 'w-0'}`}>
        <div className="w-48 p-3 border-b border-white/[0.05]">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-1">Past Capsules</p>
        </div>
        <div className="w-48 flex-1 overflow-y-auto py-2 dark-scrollbar">
          {history.length === 0 ? (
            <p className="text-xs text-slate-600 px-4 py-3">No capsules yet.</p>
          ) : (
            Object.entries(monthGroups).map(([month, items]) => (
              <div key={month} className="mb-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-4 py-1">
                  {new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => fetchCapsuleByDate(item.capsule_date)}
                    className={`w-full text-left px-4 py-2 text-xs transition-colors border-l-2 ${
                      item.capsule_date === selectedDate
                        ? 'bg-teal-600/15 text-teal-400 border-teal-500 pl-[14px]'
                        : 'text-slate-400 hover:bg-study-hover hover:text-slate-200 border-transparent pl-[14px]'
                    }`}
                  >
                    {formatDate(item.capsule_date)}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Always-visible header with sidebar toggle */}
        <div className="bg-study-surface border-b border-white/[0.06] px-3 py-2 flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-study-hover flex-shrink-0 transition-colors"
            title={sidebarOpen ? 'Hide history' : 'Show history'}
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
          {capsuleStatus === 'ok' && capsuleContent && (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex gap-1 bg-study-card rounded-xl p-1">
                <button
                  onClick={() => setActiveView('capsule')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeView === 'capsule' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <BookOpen size={12} />Capsule
                </button>
                <button
                  onClick={() => setActiveView('chat')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeView === 'chat' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <MessageSquare size={12} />Ask
                </button>
              </div>
              <div className="ml-auto flex items-center gap-3 flex-shrink-0">
                {selectedDate && <span className="text-xs text-slate-500">{formatDate(selectedDate)}</span>}
                <button onClick={downloadCapsule} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
                  <Download size={12} />Download
                </button>
              </div>
            </div>
          )}
        </div>

        {capsuleStatus === 'loading' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="space-y-2 w-64 p-8">
              {[...Array(5)].map((_, i) => <DarkSkeleton key={i} className="h-4" />)}
            </div>
          </div>
        )}

        {capsuleStatus === 'not_generated' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-sm px-6">
              <div className="w-14 h-14 bg-teal-600/10 border border-teal-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Zap size={24} className="text-teal-400" />
              </div>
              <p className="text-slate-300 font-medium mb-2">No capsule yet</p>
              <p className="text-sm text-slate-500 leading-relaxed">
                Today's capsule is generated after your study session ends. Come back after 10 PM.
              </p>
            </div>
          </div>
        )}

        {capsuleStatus === 'ok' && capsuleContent && activeView === 'capsule' && (
          <div className="flex-1 overflow-y-auto px-5 py-5 dark-scrollbar">
            {selectedDate && (
              <div className="flex items-center gap-2 mb-5">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-600/15 text-teal-400 border border-teal-500/20 font-medium">
                  Daily Capsule
                </span>
                <span className="text-xs text-slate-500">{formatDate(selectedDate)}</span>
              </div>
            )}
            <CapsuleContent content={capsuleContent} />
          </div>
        )}

        {capsuleStatus === 'ok' && capsuleContent && activeView === 'chat' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 dark-scrollbar">
              {messages.length === 0 && !streamingText && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-slate-500">Ask anything about today's capsule content.</p>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex animate-fade-in-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'user' ? (
                    <div className="max-w-[75%] bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">{msg.content}</div>
                  ) : (
                    <div className="max-w-[85%] bg-study-card border border-white/[0.07] rounded-2xl rounded-bl-sm px-5 py-4">
                      <MarkdownRenderer content={msg.content} />
                    </div>
                  )}
                </div>
              ))}
              {streamingText && (
                <div className="flex justify-start animate-fade-in-up">
                  <div className="max-w-[85%] bg-study-card border border-white/[0.07] rounded-2xl rounded-bl-sm px-5 py-4">
                    <MarkdownRenderer content={streamingText} />
                    <span className="inline-block w-1.5 h-3.5 bg-indigo-400 ml-1 animate-blink rounded-sm align-middle" />
                  </div>
                </div>
              )}
              {isStreaming && !streamingText && <div className="flex justify-start"><AIThinkingState /></div>}
              <div ref={messagesEndRef} />
            </div>
            <div className="bg-study-surface border-t border-white/[0.06] px-4 py-3 flex-shrink-0">
              <div className="flex items-end gap-2">
                <div className="flex-1 bg-study-card border border-white/[0.1] rounded-xl px-4 py-2.5 focus-within:border-indigo-500/40 focus-within:ring-1 focus-within:ring-indigo-500/10 transition-all">
                  <textarea
                    ref={textareaRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
                    disabled={isStreaming} placeholder="Ask about today's capsule…"
                    rows={1} className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none disabled:opacity-60 max-h-36"
                  />
                </div>
                <button onClick={sendMessage} disabled={!input.trim() || isStreaming} className="flex-shrink-0 p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
