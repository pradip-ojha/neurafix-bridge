import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { Send, Plus, PanelLeftOpen, PanelLeftClose, ChevronDown, Bot, Lightbulb } from 'lucide-react'
import { useSubjectChapters } from '../hooks/useSubjectChapters'
import DarkSkeleton from './DarkSkeleton'
import AIThinkingState from './AIThinkingState'
import MarkdownRenderer from './MarkdownRenderer'
import { useMobileLayout } from '../../contexts/MobileLayoutContext'
import api from '../../lib/api'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Session {
  id: string
  title: string
  session_date: string
  agent_type: string
  subject: string | null
}

interface Props {
  subject: string
}

type TutorMode = 'fast' | 'thinking' | 'deep_thinking'

function groupSessionsByDate(sessions: Session[]) {
  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const groups: Record<string, Session[]> = {}
  for (const s of sessions) {
    const key =
      s.session_date === today     ? 'Today'     :
      s.session_date === yesterday ? 'Yesterday' :
      s.session_date
    if (!groups[key]) groups[key] = []
    groups[key].push(s)
  }
  return groups
}

const SUGGESTIONS = [
  'Explain the main concepts in this chapter',
  'What are common mistakes students make here?',
  'Give me a practice problem to solve',
]

export default function TutorChat({ subject }: Props) {
  const [sessions, setSessions]             = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages]             = useState<Message[]>([])
  const [input, setInput]                   = useState('')
  const [chapter, setChapter]               = useState<string>('')
  const [mode, setMode]                     = useState<TutorMode>('fast')
  const [isStreaming, setIsStreaming]        = useState(false)
  const [streamingText, setStreamingText]   = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [sidebarOpen, setSidebarOpen]       = useState(window.innerWidth >= 768)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)

  const { mainSidebarOpen } = useMobileLayout()
  const { chapters } = useSubjectChapters(subject)

  useEffect(() => {
    if (chapters.length > 0 && !chapter) setChapter(chapters[0].id)
  }, [chapter, chapters])

  useEffect(() => {
    if (mainSidebarOpen && window.innerWidth < 768) setSidebarOpen(false)
  }, [mainSidebarOpen])

  const fetchSessions = async () => {
    setLoadingSessions(true)
    try {
      const res = await api.get(`/api/tutor/sessions?subject=${subject}`)
      setSessions(res.data)
    } catch {} finally { setLoadingSessions(false) }
  }

  useEffect(() => { fetchSessions() }, [subject])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const loadSession = async (sessionId: string) => {
    setLoadingMessages(true)
    setActiveSessionId(sessionId)
    try {
      const res = await api.get<{ role: string; content: string }[]>(`/api/tutor/sessions/${sessionId}/messages`)
      setMessages(res.data.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })))
    } catch {} finally { setLoadingMessages(false) }
  }

  const startNewChat = () => {
    setActiveSessionId(null)
    setMessages([])
    setStreamingText('')
  }

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || isStreaming) return
    if (!chapter) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Select a chapter before starting tutor chat.' }])
      return
    }

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setMessages((prev) => [...prev, { role: 'user', content: msg }])
    setIsStreaming(true)
    setStreamingText('')

    const doFetch = (t: string) => fetch('/api/tutor/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ subject, message: msg, session_id: activeSessionId, chapter, mode }),
    })

    try {
      let response = await doFetch(localStorage.getItem('token') ?? '')

      if (response.status === 401) {
        try {
          const r = await api.post('/api/auth/refresh', { refresh_token: localStorage.getItem('refresh_token') })
          localStorage.setItem('token', r.data.access_token)
          if (r.data.refresh_token) localStorage.setItem('refresh_token', r.data.refresh_token)
          response = await doFetch(r.data.access_token)
        } catch {
          window.location.href = '/login'
          setIsStreaming(false)
          return
        }
      }

      if (response.status === 429) {
        setMessages((prev) => [...prev, { role: 'assistant', content: "You've reached today's limit for this feature. Upgrade to paid for more access: /student/payment" }])
        setStreamingText('')
        return
      }
      if (!response.ok || !response.body) {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
        setStreamingText('')
        return
      }

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let buffer      = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.chunk) { accumulated += data.chunk; setStreamingText(accumulated) }
            if (data.done) {
              const finalText = data.full_text || accumulated
              setMessages((prev) => [...prev, { role: 'assistant', content: finalText }])
              setStreamingText('')
              if (data.session_id) setActiveSessionId(data.session_id)
              fetchSessions()
            }
            if (data.error) {
              setMessages((prev) => [...prev, { role: 'assistant', content: data.error }])
              setStreamingText('')
            }
          } catch {}
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
      setStreamingText('')
    } finally {
      setIsStreaming(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`
  }

  const sessionGroups = groupSessionsByDate(sessions)

  return (
    <div className="flex h-full bg-study-bg relative">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-10 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Session history sidebar */}
      <div
        className={`
          flex-shrink-0 bg-study-surface border-r border-white/[0.06] flex flex-col
          transition-all duration-200 overflow-hidden
          ${sidebarOpen
            ? 'w-56 fixed md:relative inset-y-0 left-0 z-20 md:z-auto'
            : 'w-0'}
        `}
      >
        <div className="w-56 p-3 border-b border-white/[0.05]">
          <button
            onClick={() => { startNewChat(); if (window.innerWidth < 768) setSidebarOpen(false) }}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors"
          >
            <Plus size={15} />
            New Chat
          </button>
        </div>

        <div className="w-56 flex-1 overflow-y-auto py-2 dark-scrollbar">
          {loadingSessions ? (
            <div className="px-3 py-2 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <DarkSkeleton key={i} className="h-7 w-full" variant="block" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-slate-500 px-4 py-3">No sessions yet.</p>
          ) : (
            Object.entries(sessionGroups).map(([date, dateSessions]) => (
              <div key={date} className="mb-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-4 py-1">
                  {date}
                </p>
                {dateSessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { loadSession(s.id); if (window.innerWidth < 768) setSidebarOpen(false) }}
                    className={`w-full text-left px-4 py-2 text-xs truncate transition-colors rounded-lg mx-1 ${
                      s.id === activeSessionId
                        ? 'bg-study-elevated text-slate-200 font-medium'
                        : 'text-slate-400 hover:bg-study-hover hover:text-slate-200'
                    }`}
                  >
                    {s.title || 'Chat session'}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Chapter selector bar */}
        <div className="bg-study-surface border-b border-white/[0.06] px-3 py-2 flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-study-hover transition-colors flex-shrink-0"
            title={sidebarOpen ? 'Hide history' : 'Show history'}
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>
          <span className="text-xs text-slate-500 whitespace-nowrap">Chapter:</span>
          <div className="relative">
            <select
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              className="text-xs bg-study-card border border-white/[0.1] text-slate-300 rounded-xl px-3 py-1.5 pr-7 focus:outline-none focus:border-indigo-500/40 appearance-none cursor-pointer"
            >
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>{ch.display_name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 dark-scrollbar">
          {loadingMessages && (
            <div className="flex justify-start">
              <div className="space-y-2 px-5 py-4 bg-study-card border border-white/[0.07] rounded-2xl rounded-bl-sm w-64">
                {[...[75, 100, 85, 60]].map((w, i) => (
                  <DarkSkeleton key={i} className={`h-3`} style={{ width: `${w}%` } as React.CSSProperties} />
                ))}
              </div>
            </div>
          )}

          {!loadingMessages && messages.length === 0 && !streamingText && (
            <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center">
                <Bot size={28} className="text-indigo-400" />
              </div>
              <div className="text-center">
                <p className="text-slate-300 text-sm font-medium mb-1">Your AI tutor is ready</p>
                <p className="text-slate-500 text-xs">
                  Ask anything about{' '}
                  {chapter
                    ? chapters.find((c) => c.id === chapter)?.display_name || chapter
                    : 'the selected chapter'}
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-study-card border border-white/[0.07] rounded-xl text-slate-400 text-xs hover:text-slate-200 hover:border-indigo-500/20 hover:bg-study-elevated transition-colors text-left"
                  >
                    <Lightbulb size={13} className="text-indigo-400 flex-shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex animate-fade-in-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'user' ? (
                <div className="max-w-[75%] bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[85%] bg-study-card border border-white/[0.07] rounded-2xl rounded-bl-sm px-5 py-4">
                  <MarkdownRenderer content={msg.content} />
                </div>
              )}
            </div>
          ))}

          {/* Streaming bubble */}
          {streamingText && (
            <div className="flex justify-start animate-fade-in-up">
              <div className="max-w-[85%] bg-study-card border border-white/[0.07] rounded-2xl rounded-bl-sm px-5 py-4">
                <MarkdownRenderer content={streamingText} />
                <span className="inline-block w-1.5 h-3.5 bg-indigo-400 ml-1 animate-blink rounded-sm align-middle" />
              </div>
            </div>
          )}

          {/* Thinking indicator */}
          {isStreaming && !streamingText && (
            <div className="flex justify-start">
              <AIThinkingState />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="bg-study-surface border-t border-white/[0.06] px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold">Mode</span>
            <div className="flex rounded-xl border border-white/[0.08] bg-study-card p-1">
              {[
                { value: 'fast', label: 'Fast' },
                { value: 'thinking', label: 'Thinking' },
                { value: 'deep_thinking', label: 'Deep' },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMode(item.value as TutorMode)}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                    mode === item.value
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 bg-study-card border border-white/[0.1] rounded-xl px-4 py-2.5 focus-within:border-indigo-500/40 focus-within:ring-1 focus-within:ring-indigo-500/10 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isStreaming}
                placeholder="Ask your tutor a question…"
                rows={1}
                className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none disabled:opacity-60 max-h-36"
              />
            </div>
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isStreaming || !chapter}
              className="flex-shrink-0 p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-1.5 text-center">
            Chapter is required · Fast uses limited context · Thinking uses full context · Deep adds RAG notes
          </p>
        </div>
      </div>
    </div>
  )
}
