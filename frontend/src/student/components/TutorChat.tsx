import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { Send, Plus, ChevronDown, PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import { SUBJECT_CHAPTERS, Chapter } from '../constants/subjectStructure'
import Skeleton from '../../components/Skeleton'

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

function groupSessionsByDate(sessions: Session[]) {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  const groups: Record<string, Session[]> = {}
  for (const s of sessions) {
    const key =
      s.session_date === today
        ? 'Today'
        : s.session_date === yesterday
        ? 'Yesterday'
        : s.session_date
    if (!groups[key]) groups[key] = []
    groups[key].push(s)
  }
  return groups
}

export default function TutorChat({ subject }: Props) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [chapter, setChapter] = useState<string>('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const chapters: Chapter[] = SUBJECT_CHAPTERS[subject] || []

  const fetchSessions = async () => {
    setLoadingSessions(true)
    try {
      const res = await fetch(`/api/tutor/sessions?subject=${subject}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      })
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
      }
    } catch {} finally {
      setLoadingSessions(false)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, [subject])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const loadSession = async (sessionId: string) => {
    setLoadingMessages(true)
    setActiveSessionId(sessionId)
    try {
      const res = await fetch(`/api/tutor/sessions/${sessionId}/messages`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
      })
      if (res.ok) {
        const data: { role: string; content: string }[] = await res.json()
        setMessages(data.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })))
      }
    } catch {} finally {
      setLoadingMessages(false)
    }
  }

  const startNewChat = () => {
    setActiveSessionId(null)
    setMessages([])
    setStreamingText('')
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setIsStreaming(true)
    setStreamingText('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      const response = await fetch('/api/tutor/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          subject,
          message: text,
          session_id: activeSessionId,
          chapter: chapter || null,
        }),
      })

      if (response.status === 402) {
        window.location.href = '/student/payment'
        return
      }
      if (response.status === 429) {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'You have reached your daily message limit. It resets tomorrow.' }])
        setStreamingText('')
        return
      }
      if (!response.ok) {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
        setStreamingText('')
        return
      }
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      let buffer = ''

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
            if (data.chunk) {
              accumulated += data.chunk
              setStreamingText(accumulated)
            }
            if (data.done) {
              const finalText = data.full_text || accumulated
              setMessages((prev) => [...prev, { role: 'assistant', content: finalText }])
              setStreamingText('')
              if (data.session_id) {
                setActiveSessionId(data.session_id)
              }
              fetchSessions()
            }
            if (data.error) {
              setMessages((prev) => [...prev, { role: 'assistant', content: data.error }])
              setStreamingText('')
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
      setStreamingText('')
    } finally {
      setIsStreaming(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Auto-resize textarea
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`
  }

  const sessionGroups = groupSessionsByDate(sessions)

  return (
    <div className="flex h-full relative">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-10 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Session history sidebar */}
      <div
        className={`
          flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden
          transition-all duration-200
          md:relative md:translate-x-0
          ${sidebarOpen
            ? 'w-64 fixed md:relative inset-y-0 left-0 z-20 md:z-auto translate-x-0'
            : 'w-0 md:w-0'}
        `}
      >
        <div className="w-64 p-3 border-b border-gray-100">
          <button
            onClick={() => { startNewChat(); if (window.innerWidth < 768) setSidebarOpen(false) }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <Plus size={16} />
            New Chat
          </button>
        </div>

        <div className="w-64 flex-1 overflow-y-auto py-2">
          {loadingSessions ? (
            <div className="px-3 py-2 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" variant="block" />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-gray-400 px-4 py-3">No sessions yet. Start chatting!</p>
          ) : (
            Object.entries(sessionGroups).map(([date, dateSessions]) => (
              <div key={date} className="mb-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-1">{date}</p>
                {dateSessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { loadSession(s.id); if (window.innerWidth < 768) setSidebarOpen(false) }}
                    className={`w-full text-left px-4 py-2 text-sm truncate transition-colors ${
                      s.id === activeSessionId
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
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
        {/* Chapter selector */}
        <div className="bg-white border-b border-gray-100 px-3 py-2 flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 flex-shrink-0"
            title={sidebarOpen ? 'Hide history' : 'Show history'}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
          <span className="text-xs text-gray-500 whitespace-nowrap">Chapter:</span>
          <div className="relative">
            <select
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 pr-8 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer"
            >
              <option value="">No specific chapter</option>
              {chapters.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.display_name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loadingMessages && (
            <div className="text-center text-sm text-gray-400">Loading messages…</div>
          )}

          {!loadingMessages && messages.length === 0 && !streamingText && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-sm">
                <p className="text-gray-400 text-sm">
                  Ask your tutor anything about{' '}
                  {chapter
                    ? SUBJECT_CHAPTERS[subject]?.find((c) => c.id === chapter)?.display_name || chapter
                    : 'any topic'}.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* Live streaming bubble */}
          {streamingText && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl px-4 py-3 text-sm bg-white border border-gray-200 text-gray-800 whitespace-pre-wrap leading-relaxed">
                {streamingText}
                <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse rounded-sm" />
              </div>
            </div>
          )}

          {isStreaming && !streamingText && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 bg-white border border-gray-200">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="bg-white border-t border-gray-200 px-4 py-3 flex-shrink-0">
          <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="Ask your tutor a question… (Enter to send, Shift+Enter for new line)"
              rows={1}
              className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none disabled:opacity-60 max-h-36"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              className="flex-shrink-0 p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5 text-center">
            AI tutors can make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div>
  )
}
