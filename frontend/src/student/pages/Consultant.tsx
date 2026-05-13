import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { Send, Plus, ChevronDown, ChevronUp, CalendarDays, Compass, Lightbulb, Menu } from 'lucide-react'
import AIThinkingState from '../components/AIThinkingState'
import MarkdownRenderer from '../components/MarkdownRenderer'
import DarkSkeleton from '../components/DarkSkeleton'
import { useMobileLayout } from '../../contexts/MobileLayoutContext'

interface Message { role: 'user' | 'assistant'; content: string }
interface Session { id: string; title: string; session_date: string; agent_type: string; subject: string | null }
interface Timeline { content: string | null; version: number; updated_at: string | null }
type ConsultantMode = 'normal' | 'thinking'

function groupSessionsByDate(sessions: Session[]) {
  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const groups: Record<string, Session[]> = {}
  for (const s of sessions) {
    const key = s.session_date === today ? 'Today' : s.session_date === yesterday ? 'Yesterday' : s.session_date
    if (!groups[key]) groups[key] = []
    groups[key].push(s)
  }
  return groups
}

const SUGGESTIONS = [
  'Create a preparation timeline for me',
  'What are my weak areas and how to improve?',
  'Which stream should I choose based on my goals?',
  'Recommend colleges for my target career',
]

const CONSULTANT_NORMAL_STEPS = [
  'Reviewing your preparation data…',
  'Analysing your progress…',
  'Crafting personalised advice…',
]

const CONSULTANT_THINKING_STEPS = [
  'Reviewing your preparation data…',
  'Searching for latest information…',
  'Analysing your progress…',
  'Crafting personalised advice…',
]

export default function Consultant() {
  const [sessions, setSessions]               = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages]               = useState<Message[]>([])
  const [input, setInput]                     = useState('')
  const [mode, setMode]                       = useState<ConsultantMode>('normal')
  const [isStreaming, setIsStreaming]         = useState(false)
  const [streamingText, setStreamingText]     = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [timeline, setTimeline]               = useState<Timeline | null>(null)
  const [timelineOpen, setTimelineOpen]       = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/consultant/sessions', {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      })
      if (res.ok) setSessions(await res.json())
    } catch {}
  }

  const fetchTimeline = async () => {
    try {
      const res = await fetch('/api/consultant/timeline', {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      })
      if (res.ok) setTimeline(await res.json())
    } catch {}
  }

  const { setTopBarVisible, openMainSidebar } = useMobileLayout()
  useEffect(() => {
    setTopBarVisible(false)
    return () => setTopBarVisible(true)
  }, [setTopBarVisible])

  useEffect(() => { fetchSessions(); fetchTimeline() }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingText])

  const loadSession = async (sessionId: string) => {
    setLoadingMessages(true); setActiveSessionId(sessionId); setMessages([]); setStreamingText('')
    try {
      const res = await fetch(`/api/consultant/sessions/${sessionId}/messages`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      })
      if (res.ok) {
        const data: { role: string; content: string }[] = await res.json()
        setMessages(data.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })))
      }
    } catch {} finally { setLoadingMessages(false) }
  }

  const startNewChat = () => { setActiveSessionId(null); setMessages([]); setStreamingText('') }

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || isStreaming) return
    setInput(''); if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setMessages((prev) => [...prev, { role: 'user', content: msg }])
    setIsStreaming(true); setStreamingText('')
    try {
      const response = await fetch('/api/consultant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('token')}` },
        body: JSON.stringify({ message: msg, session_id: activeSessionId, mode }),
      })
      if (response.status === 429) { setMessages((prev) => [...prev, { role: 'assistant', content: "You've reached today's limit for this feature. Upgrade to paid for more access: /student/payment" }]); setStreamingText(''); return }
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
            if (data.done) {
              setMessages((prev) => [...prev, { role: 'assistant', content: data.full_text || accumulated }])
              setStreamingText(''); if (data.session_id) setActiveSessionId(data.session_id)
              fetchSessions(); fetchTimeline()
            }
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

  const sessionGroups = groupSessionsByDate(sessions)

  return (
    <div className="flex h-full bg-study-bg">
      {/* Left sidebar */}
      <div className="w-56 flex-shrink-0 bg-study-surface border-r border-white/[0.06] flex flex-col overflow-hidden hidden md:flex">
        <div className="p-3 border-b border-white/[0.05]">
          <button
            onClick={startNewChat}
            className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors"
          >
            <Plus size={15} />New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 dark-scrollbar">
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-500 px-4 py-3">No sessions yet.</p>
          ) : (
            Object.entries(sessionGroups).map(([date, dateSessions]) => (
              <div key={date} className="mb-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-4 py-1">{date}</p>
                {dateSessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => loadSession(s.id)}
                    className={`w-full text-left px-4 py-2 text-xs truncate transition-colors rounded-lg mx-1 ${
                      s.id === activeSessionId ? 'bg-study-elevated text-slate-200 font-medium' : 'text-slate-400 hover:bg-study-hover hover:text-slate-200'
                    }`}
                  >
                    {s.title || 'Consultant chat'}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top strip */}
        <div className="md:hidden bg-study-surface border-b border-white/[0.06] px-3 py-2 flex items-center gap-2 flex-shrink-0">
          <button
            onClick={openMainSidebar}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-study-hover transition-colors flex-shrink-0"
            aria-label="Open navigation"
          >
            <Menu size={16} />
          </button>
          <button
            onClick={startNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors ml-auto"
          >
            <Plus size={13} />New Chat
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 dark-scrollbar">
          {loadingMessages && (
            <div className="flex justify-start">
              <div className="space-y-2 px-5 py-4 bg-study-card border border-white/[0.07] rounded-2xl w-64">
                {[75, 100, 85, 60].map((w, i) => <DarkSkeleton key={i} className="h-3" style={{ width: `${w}%` } as React.CSSProperties} />)}
              </div>
            </div>
          )}

          {!loadingMessages && messages.length === 0 && !streamingText && (
            <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center">
                <Compass size={28} className="text-indigo-400" />
              </div>
              <div className="text-center">
                <p className="text-slate-300 text-sm font-medium mb-1">Your Personal Consultant</p>
                <p className="text-slate-500 text-xs max-w-xs">
                  Your advisor for preparation planning, strategy, stream choice, college selection, and career guidance.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="flex items-start gap-2 px-4 py-3 bg-study-card border border-white/[0.07] rounded-xl text-slate-400 text-xs hover:text-slate-200 hover:border-indigo-500/20 hover:bg-study-elevated transition-colors text-left"
                  >
                    <Lightbulb size={12} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                    {s}
                  </button>
                ))}
              </div>
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

          {isStreaming && !streamingText && (
            <div className="flex justify-start">
              <AIThinkingState steps={mode === 'thinking' ? CONSULTANT_THINKING_STEPS : CONSULTANT_NORMAL_STEPS} />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Collapsible preparation plan */}
        <div className="border-t border-white/[0.06] bg-study-surface flex-shrink-0">
          <button
            onClick={() => setTimelineOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-study-hover transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <CalendarDays size={13} />
              Preparation Timeline
              {timeline?.version ? <span className="text-slate-600 font-normal">v{timeline.version}</span> : null}
            </span>
            {timelineOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>

          {timelineOpen && (
            <div className="px-4 pb-3 max-h-36 overflow-y-auto dark-scrollbar">
              {timeline?.content ? (
                <div className="text-xs text-slate-400 leading-relaxed">
                  <MarkdownRenderer content={timeline.content} className="text-xs" />
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  No timeline yet. Ask your consultant to create a preparation plan for you.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="bg-study-surface border-t border-white/[0.06] px-4 py-3 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold">Mode</span>
            <div className="flex rounded-xl border border-white/[0.08] bg-study-card p-1">
              {[
                { value: 'normal', label: 'Normal' },
                { value: 'thinking', label: 'Thinking' },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMode(item.value as ConsultantMode)}
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
                ref={textareaRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
                disabled={isStreaming}
                placeholder="Ask about your plan, study strategy, stream choice, colleges…"
                rows={1}
                className="w-full bg-transparent text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none disabled:opacity-60 max-h-36"
              />
            </div>
            <button
              onClick={() => sendMessage()} disabled={!input.trim() || isStreaming}
              className="flex-shrink-0 p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-1.5 text-center">
            Normal uses preparation context only · Thinking adds web search for research-heavy questions
          </p>
        </div>
      </div>
    </div>
  )
}
