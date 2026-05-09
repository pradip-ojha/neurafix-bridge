import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Send, Plus, ChevronDown, ChevronUp, CalendarDays } from 'lucide-react'

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

interface Timeline {
  content: string | null
  version: number
  updated_at: string | null
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

export default function Consultant() {
  const navigate = useNavigate()
  const { subscriptionStatus } = useOutletContext<{ stream: string; subscriptionStatus: string | null }>()

  useEffect(() => {
    if (subscriptionStatus !== null && subscriptionStatus !== 'active') {
      navigate('/student/payment', { replace: true })
    }
  }, [subscriptionStatus, navigate])

  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  useEffect(() => {
    fetchSessions()
    fetchTimeline()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const loadSession = async (sessionId: string) => {
    setLoadingMessages(true)
    setActiveSessionId(sessionId)
    setMessages([])
    setStreamingText('')
    try {
      const res = await fetch(`/api/consultant/sessions/${sessionId}/messages`, {
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

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      const response = await fetch('/api/consultant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          message: text,
          session_id: activeSessionId,
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
              if (data.session_id) setActiveSessionId(data.session_id)
              fetchSessions()
              fetchTimeline()
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`
  }

  const sessionGroups = groupSessionsByDate(sessions)

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <div className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-gray-100">
          <button
            onClick={startNewChat}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <Plus size={16} />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {sessions.length === 0 ? (
            <p className="text-xs text-gray-400 px-4 py-3">No sessions yet. Start a conversation!</p>
          ) : (
            Object.entries(sessionGroups).map(([date, dateSessions]) => (
              <div key={date} className="mb-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-1">{date}</p>
                {dateSessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => loadSession(s.id)}
                    className={`w-full text-left px-4 py-2 text-sm truncate transition-colors ${
                      s.id === activeSessionId
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
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
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loadingMessages && (
            <div className="text-center text-sm text-gray-400">Loading messages…</div>
          )}

          {!loadingMessages && messages.length === 0 && !streamingText && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CalendarDays size={24} className="text-indigo-600" />
                </div>
                <p className="text-gray-700 font-medium mb-1">Your Personal Consultant</p>
                <p className="text-gray-400 text-sm">
                  Ask about your preparation plan, study strategies, stream choice, college recommendations, or anything else about your future.
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

        {/* Collapsible preparation plan panel */}
        <div className="border-t border-gray-200 bg-white flex-shrink-0">
          <button
            onClick={() => setTimelineOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <CalendarDays size={13} />
              Preparation Plan
              {timeline?.version ? (
                <span className="text-gray-400 font-normal">v{timeline.version}</span>
              ) : null}
            </span>
            {timelineOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>

          {timelineOpen && (
            <div className="px-4 pb-3 max-h-36 overflow-y-auto">
              {timeline?.content ? (
                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{timeline.content}</p>
              ) : (
                <p className="text-xs text-gray-400 italic">
                  No preparation plan yet. Ask your consultant to create one for you!
                </p>
              )}
            </div>
          )}
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
              placeholder="Ask about your plan, study strategy, stream choice, colleges… (Enter to send)"
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
            Your consultant uses web search for college and career information — answers may take a moment.
          </p>
        </div>
      </div>
    </div>
  )
}
