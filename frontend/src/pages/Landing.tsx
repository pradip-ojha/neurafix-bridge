import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Bot, BookOpen, BarChart2, Trophy, Users, CheckCircle,
  XCircle, ChevronDown, ChevronRight, Menu, X, Play,
  Target, Compass, Lightbulb, Globe, Clock, Sparkles, TrendingUp,
  MessageSquare, FileText, Star, ArrowRight, GraduationCap,
  Search, Zap,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FAQ {
  id: number
  question: string
  answer: string
}

interface Stats {
  students_registered: number
  mock_tests_attempted: number
  questions_practiced: number
  ai_tutor_messages: number
  career_guidance_sessions: number
  practice_sessions_completed: number
  students_registered_rate: number
  mock_tests_attempted_rate: number
  questions_practiced_rate: number
  ai_tutor_messages_rate: number
  career_guidance_sessions_rate: number
  practice_sessions_completed_rate: number
}

// ─── Default FAQs (fallback if no admin FAQs) ─────────────────────────────────

const DEFAULT_FAQS: FAQ[] = [
  {
    id: 1,
    question: 'How do I get access to NeuraFix Bridge?',
    answer:
      'Create an account and complete your student profile to get started. Access to the platform is granted after registration.',
  },
  {
    id: 2,
    question: 'Is this a bridge course?',
    answer:
      'No. NeuraFix Bridge is an online AI-powered preparation platform that provides mock tests, smart practice sessions, study resources, AI tutor support, and career guidance.',
  },
  {
    id: 3,
    question: 'Who can use NeuraFix Bridge?',
    answer: 'SEE appeared students preparing for Class 11 entrance exams can use it.',
  },
  {
    id: 4,
    question: 'Can I attempt mock tests?',
    answer:
      'Yes. Students can attempt entrance-focused mock tests and use them to improve their preparation.',
  },
  {
    id: 5,
    question: 'Can I ask questions to the AI tutor?',
    answer:
      'Yes. Students can ask questions and get instant explanations from the AI tutor.',
  },
  {
    id: 6,
    question: 'What does the career counselor agent do?',
    answer:
      'The career counselor agent helps students explore streams, colleges, future study options, and possible career paths after SEE.',
  },
  {
    id: 7,
    question: 'Can it help me choose between Science and Management?',
    answer:
      'Yes. The career guidance feature can help students think through their interests, strengths, goals, and future options before choosing a stream.',
  },
  {
    id: 8,
    question: 'Do I need to install an app?',
    answer: 'No. Students can access NeuraFix Bridge directly from the website.',
  },
]

// ─── Animated counter (count-up on enter, then live-ticking) ─────────────────

function useCountUp(target: number, ratePerDay = 0, duration = 1800) {
  const [count, setCount] = useState(0)
  const started = useRef(false)
  const liveValue = useRef(target)
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { liveValue.current = target }, [target])

  useEffect(() => {
    const el = ref.current
    if (!el || started.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return
        started.current = true
        const start = performance.now()
        const step = (now: number) => {
          const p = Math.min((now - start) / duration, 1)
          setCount(Math.round(p * target))
          if (p < 1) {
            requestAnimationFrame(step)
          } else {
            liveValue.current = target
            if (ratePerDay > 0) {
              // convert per-day rate → per-second, tick every second
              const perSecond = ratePerDay / 86400
              ticker.current = setInterval(() => {
                liveValue.current += perSecond
                setCount(Math.round(liveValue.current))
              }, 1000)
            }
          }
        }
        requestAnimationFrame(step)
      },
      { threshold: 0.3 },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (ticker.current) clearInterval(ticker.current)
    }
  }, [target, duration, ratePerDay])

  return { count, ref }
}

function StatCard({ value, label, icon: Icon, ratePerDay = 0 }: { value: number; label: string; icon: React.ElementType; ratePerDay?: number }) {
  const { count, ref } = useCountUp(value, ratePerDay)
  const display = count >= 1000 ? `${(count / 1000).toFixed(1)}k+` : count.toString()
  return (
    <div ref={ref} className="flex flex-col items-center gap-2 p-6 rounded-2xl bg-white/5 border border-white/10">
      <Icon size={22} className="text-indigo-400" />
      <span className="text-3xl font-bold text-white">{display}</span>
      <span className="text-sm text-slate-400 text-center">{label}</span>
    </div>
  )
}

// ─── Mock UI components (CSS-built product visuals) ───────────────────────────

function MockTestUI() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f1729] shadow-2xl overflow-hidden text-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#101625]">
        <span className="text-slate-300 font-medium">Mock Test — Science Stream</span>
        <span className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
          <Clock size={12} /> 42:30
        </span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Question 12 of 50</span>
          <span className="text-indigo-400">Mathematics</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full w-[24%] rounded-full bg-indigo-500" />
        </div>
        <p className="text-slate-200 leading-snug pt-1">
          If the roots of x² − 5x + k = 0 are equal, the value of k is:
        </p>
        <div className="space-y-2 pt-1">
          {['A.  k = 25/4', 'B.  k = 5', 'C.  k = −5', 'D.  k = 5/2'].map((opt, i) => (
            <div
              key={i}
              className={`px-3 py-2 rounded-lg border text-slate-300 cursor-pointer transition-colors ${
                i === 0 ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300' : 'border-white/10 hover:border-white/20'
              }`}
            >
              {opt}
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-1">
          <button className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium">Next →</button>
        </div>
      </div>
    </div>
  )
}

function TutorUI() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f1729] shadow-2xl overflow-hidden text-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#101625]">
        <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center">
          <Bot size={12} className="text-white" />
        </div>
        <span className="text-slate-300 font-medium">AI Tutor — Compulsory Math</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex justify-end">
          <div className="max-w-[80%] bg-indigo-600/20 border border-indigo-500/20 rounded-xl rounded-br-sm px-3 py-2 text-slate-200 text-xs">
            Can you explain how to find the HCF using the Euclidean algorithm?
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Bot size={10} className="text-white" />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl rounded-tl-sm px-3 py-2 text-slate-300 text-xs space-y-1.5">
            <p>Great question! The Euclidean algorithm works like this:</p>
            <p><span className="text-indigo-400 font-medium">Step 1:</span> Divide the larger number by the smaller one.</p>
            <p><span className="text-indigo-400 font-medium">Step 2:</span> Replace the larger with the smaller, and the smaller with the remainder.</p>
            <p><span className="text-indigo-400 font-medium">Step 3:</span> Repeat until remainder = 0. The last divisor is the HCF.</p>
            <p className="text-slate-400">Example: HCF(48, 18) → 48 = 2×18 + 12 → 18 = 1×12 + 6 → 12 = 2×6 + 0 → HCF = <span className="text-green-400 font-bold">6</span></p>
          </div>
        </div>
      </div>
    </div>
  )
}

function PracticeUI() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f1729] shadow-2xl overflow-hidden text-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#101625]">
        <Target size={14} className="text-violet-400" />
        <span className="text-slate-300 font-medium">Smart Practice</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {['Compulsory Math', 'Compulsory Science', 'Comp. English', 'Optional Math'].map((s, i) => (
            <div key={i} className={`px-3 py-2 rounded-lg border text-xs text-center cursor-pointer ${i === 0 ? 'border-violet-500 bg-violet-500/10 text-violet-300' : 'border-white/10 text-slate-400'}`}>
              {s}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 border-t border-white/10 pt-3">
          <BookOpen size={12} /> <span className="text-slate-300">Chapter:</span> Sets and Functions
        </div>
        <div className="space-y-1">
          {[
            { label: 'Total Questions', val: '20', color: 'text-slate-200' },
            { label: 'Correct', val: '14', color: 'text-green-400' },
            { label: 'Wrong', val: '6', color: 'text-red-400' },
          ].map(({ label, val, color }) => (
            <div key={label} className="flex justify-between text-xs">
              <span className="text-slate-400">{label}</span>
              <span className={`font-semibold ${color}`}>{val}</span>
            </div>
          ))}
        </div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full w-[70%] rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" />
        </div>
      </div>
    </div>
  )
}

function ProgressUI() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f1729] shadow-2xl overflow-hidden text-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#101625]">
        <TrendingUp size={14} className="text-green-400" />
        <span className="text-slate-300 font-medium">Progress Overview</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { val: '78%', label: 'Avg Score', color: 'text-green-400' },
            { val: '24', label: 'Mock Tests', color: 'text-indigo-400' },
            { val: '340', label: 'Questions', color: 'text-violet-400' },
          ].map(({ val, label, color }) => (
            <div key={label} className="p-2 rounded-lg bg-white/5 border border-white/10">
              <div className={`text-lg font-bold ${color}`}>{val}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>
        <div className="space-y-2 pt-1">
          {[
            { label: 'Mathematics', pct: 82, color: 'bg-indigo-500' },
            { label: 'Science', pct: 68, color: 'bg-violet-500' },
            { label: 'English', pct: 91, color: 'bg-green-500' },
          ].map(({ label, pct, color }) => (
            <div key={label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-300">{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ResourcesUI() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f1729] shadow-2xl overflow-hidden text-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#101625]">
        <FileText size={14} className="text-amber-400" />
        <span className="text-slate-300 font-medium">Study Resources</span>
      </div>
      <div className="flex h-36">
        <div className="w-32 border-r border-white/10 p-2 space-y-1">
          {['Algebra', 'Geometry', 'Trigonometry', 'Statistics'].map((ch, i) => (
            <div key={ch} className={`px-2 py-1.5 rounded text-xs cursor-pointer ${i === 0 ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:bg-white/5'}`}>
              {ch}
            </div>
          ))}
        </div>
        <div className="flex-1 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-300">Chapter Notes — Algebra</p>
          <div className="space-y-1 text-xs text-slate-400">
            <div className="flex items-center gap-1.5"><CheckCircle size={10} className="text-green-400" /> Polynomials and Factorisation</div>
            <div className="flex items-center gap-1.5"><CheckCircle size={10} className="text-green-400" /> Quadratic Equations</div>
            <div className="flex items-center gap-1.5"><CheckCircle size={10} className="text-green-400" /> Simultaneous Equations</div>
          </div>
          <button className="mt-1 flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300">
            <FileText size={10} /> Open PDF
          </button>
        </div>
      </div>
    </div>
  )
}

function CareerUI() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f1729] shadow-2xl overflow-hidden text-sm">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#101625]">
        <Compass size={14} className="text-rose-400" />
        <span className="text-slate-300 font-medium">Career Counselor</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex justify-end">
          <div className="max-w-[80%] bg-rose-600/20 border border-rose-500/20 rounded-xl rounded-br-sm px-3 py-2 text-slate-200 text-xs">
            I am confused between Science and Management. How should I decide?
          </div>
        </div>
        <div className="flex gap-2">
          <div className="w-5 h-5 rounded-full bg-rose-600 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Compass size={10} className="text-white" />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl rounded-tl-sm px-3 py-2 text-xs space-y-1.5">
            <p className="text-slate-300">Great question. Let me help you think through this:</p>
            <div className="space-y-1">
              {[
                { icon: '🔬', text: 'Science → Medicine, Engineering, Research' },
                { icon: '📊', text: 'Management → Business, Finance, Administration' },
              ].map(({ icon, text }) => (
                <div key={text} className="text-slate-400">{icon} {text}</div>
              ))}
            </div>
            <p className="text-slate-400 text-xs">What subjects do you enjoy most? Tell me more about your goals.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── FAQ Accordion item ───────────────────────────────────────────────────────

function FAQItem({ faq }: { faq: FAQ }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-slate-200 font-medium pr-4">{faq.question}</span>
        {open ? <ChevronDown size={16} className="text-indigo-400 flex-shrink-0" /> : <ChevronRight size={16} className="text-slate-500 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-4 text-slate-400 text-sm leading-relaxed border-t border-white/10 pt-3">
          {faq.answer}
        </div>
      )}
    </div>
  )
}

// ─── Dashboard hero mockup ────────────────────────────────────────────────────

function HeroDashboard() {
  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/20 via-violet-500/10 to-transparent blur-2xl pointer-events-none" />
      <div className="relative rounded-2xl border border-white/10 bg-[#0d1527] shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#101625]">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="text-xs text-slate-400 ml-2">NeuraFix Bridge — Student Dashboard</span>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3">
          <div className="col-span-2 bg-gradient-to-r from-indigo-600/20 to-violet-600/20 border border-indigo-500/20 rounded-xl p-3">
            <p className="text-xs text-indigo-300 font-medium">Today's Preparation</p>
            <p className="text-slate-200 text-sm mt-0.5">Quadratic Equations — Chapter 4</p>
            <div className="flex gap-2 mt-2">
              <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">Practice due</span>
              <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full">Capsule ready</span>
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <p className="text-xs text-slate-400">Mock Score</p>
            <p className="text-2xl font-bold text-green-400">78%</p>
            <p className="text-xs text-slate-500 mt-1">↑ 6% from last week</p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <p className="text-xs text-slate-400">Weak Topics</p>
            <p className="text-sm text-amber-400 font-medium mt-0.5">Trigonometry</p>
            <p className="text-xs text-slate-500 mt-1">3 topics flagged</p>
          </div>
          <div className="col-span-2 bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-rose-600/20 flex items-center justify-center flex-shrink-0">
              <Compass size={14} className="text-rose-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Career Counselor</p>
              <p className="text-sm text-slate-200">Ready to plan your next step</p>
            </div>
            <ChevronRight size={14} className="text-slate-500 ml-auto" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Landing component ───────────────────────────────────────────────────

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [stats, setStats] = useState<Stats>({
    students_registered: 0,
    mock_tests_attempted: 0,
    questions_practiced: 0,
    ai_tutor_messages: 0,
    career_guidance_sessions: 0,
    practice_sessions_completed: 0,
    students_registered_rate: 0,
    mock_tests_attempted_rate: 0,
    questions_practiced_rate: 0,
    ai_tutor_messages_rate: 0,
    career_guidance_sessions_rate: 0,
    practice_sessions_completed_rate: 0,
  })
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [demoUrl, setDemoUrl] = useState<string | null>(null)

  const featuresRef = useRef<HTMLElement>(null)
  const careerRef = useRef<HTMLElement>(null)
  const demoRef = useRef<HTMLElement>(null)
  const howRef = useRef<HTMLElement>(null)
  const faqRef = useRef<HTMLElement>(null)

  useEffect(() => {
    fetch('/api/public/stats').then((r) => r.json()).then(setStats).catch(() => {})
    fetch('/api/public/faqs').then((r) => r.json()).then(setFaqs).catch(() => {})
    fetch('/api/public/homepage').then((r) => r.json()).then((d) => setDemoUrl(d.demo_video_url)).catch(() => {})
  }, [])

  const scrollTo = (ref: React.RefObject<HTMLElement | null>) => {
    setMobileMenuOpen(false)
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const activeFaqs = faqs.length > 0 ? faqs : DEFAULT_FAQS

  const isYouTube = (url: string) =>
    url.includes('youtube.com') || url.includes('youtu.be')

  const embedUrl = (url: string) => {
    const m = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    return m ? `https://www.youtube.com/embed/${m[1]}` : url
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--study-base))] text-slate-100 font-['Inter',ui-sans-serif,sans-serif]">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#101625]/80 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/company-logo.png" alt="NeuraFix" className="w-10 h-10 object-contain" />
            <span className="text-lg font-bold text-white tracking-tight">NeuraFix Bridge</span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <button onClick={() => scrollTo(featuresRef)} className="hover:text-white transition-colors">Features</button>
            <button onClick={() => scrollTo(careerRef)} className="hover:text-white transition-colors">Career Guidance</button>
            <button onClick={() => scrollTo(demoRef)} className="hover:text-white transition-colors">Demo</button>
            <button onClick={() => scrollTo(howRef)} className="hover:text-white transition-colors">How It Works</button>
            <button onClick={() => scrollTo(faqRef)} className="hover:text-white transition-colors">FAQ</button>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="text-sm text-slate-400 hover:text-white transition-colors px-3 py-1.5">Login</Link>
            <Link to="/register" className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">Register</Link>
          </div>

          <button className="md:hidden text-slate-400" onClick={() => setMobileMenuOpen((o) => !o)}>
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#101625] px-4 py-4 space-y-3">
            {[
              { label: 'Features', ref: featuresRef },
              { label: 'Career Guidance', ref: careerRef },
              { label: 'Demo', ref: demoRef },
              { label: 'How It Works', ref: howRef },
              { label: 'FAQ', ref: faqRef },
            ].map(({ label, ref }) => (
              <button key={label} onClick={() => scrollTo(ref)} className="block w-full text-left text-sm text-slate-400 hover:text-white py-1">
                {label}
              </button>
            ))}
            <div className="flex gap-3 pt-2 border-t border-white/10">
              <Link to="/login" className="flex-1 text-center text-sm py-2 border border-white/10 rounded-lg text-slate-300 hover:bg-white/5">Login</Link>
              <Link to="/register" className="flex-1 text-center text-sm py-2 bg-indigo-600 rounded-lg text-white font-medium hover:bg-indigo-500">Register</Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-20 pb-24 px-4 sm:px-6">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
          <div className="absolute top-20 right-1/4 w-64 h-64 bg-violet-600/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-indigo-600/10 border border-indigo-500/20 text-indigo-300 text-xs px-3 py-1.5 rounded-full">
              <Sparkles size={12} />
              AI-Powered Platform for SEE Students
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight">
              AI-Powered Class 11 Entrance Preparation for SEE Students
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed">
              Prepare smarter with mock tests, smart practice sessions, AI tutor support, career guidance, and personalized study support built for Nepali students.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/register" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-semibold transition-colors">
                Start Preparation <ArrowRight size={16} />
              </Link>
              <button onClick={() => scrollTo(demoRef)} className="flex items-center gap-2 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white px-6 py-3 rounded-xl transition-colors">
                <Play size={14} /> Watch Demo
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Built by NeuraFix AI to make quality entrance preparation and guidance accessible for every SEE student.
            </p>
          </div>
          <div className="hidden md:block">
            <HeroDashboard />
          </div>
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <section className="py-16 px-4 sm:px-6 bg-white/[0.02] border-y border-white/[0.06]">
        <div className="max-w-7xl mx-auto text-center mb-10">
          <h2 className="text-2xl font-bold text-white">Students are already preparing smarter with NeuraFix Bridge</h2>
          <p className="text-slate-400 mt-2">See how students are learning, practicing, and getting guidance through the platform.</p>
          <p className="text-xs text-slate-500 mt-1">Platform activity overview</p>
        </div>
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard value={stats.students_registered} ratePerDay={stats.students_registered_rate} label="Students Registered" icon={Users} />
          <StatCard value={stats.mock_tests_attempted} ratePerDay={stats.mock_tests_attempted_rate} label="Mock Tests Attempted" icon={Trophy} />
          <StatCard value={stats.questions_practiced} ratePerDay={stats.questions_practiced_rate} label="Questions Practiced" icon={Target} />
          <StatCard value={stats.ai_tutor_messages} ratePerDay={stats.ai_tutor_messages_rate} label="AI Tutor Messages Sent" icon={MessageSquare} />
          <StatCard value={stats.career_guidance_sessions} ratePerDay={stats.career_guidance_sessions_rate} label="Career Guidance Sessions" icon={Compass} />
          <StatCard value={stats.practice_sessions_completed} ratePerDay={stats.practice_sessions_completed_rate} label="Practice Sessions Completed" icon={CheckCircle} />
        </div>
      </section>

      {/* ── Demo Video ─────────────────────────────────────────────────────── */}
      <section ref={demoRef} className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-3">See how NeuraFix Bridge works</h2>
          <p className="text-slate-400 mb-10">Watch a quick demo of mock tests, AI tutor support, career guidance, smart practice sessions, and progress tracking.</p>
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/15 to-violet-500/10 blur-2xl pointer-events-none" />
            {demoUrl ? (
              <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                {isYouTube(demoUrl) ? (
                  <iframe
                    src={embedUrl(demoUrl)}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="NeuraFix Bridge Demo"
                  />
                ) : (
                  <video src={demoUrl} controls className="w-full h-full object-cover" />
                )}
              </div>
            ) : (
              <div className="relative aspect-video rounded-2xl border border-white/10 bg-white/5 flex flex-col items-center justify-center gap-4 shadow-2xl">
                <div className="w-16 h-16 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                  <Play size={24} className="text-indigo-400 ml-1" />
                </div>
                <p className="text-slate-400 font-medium">Demo video coming soon</p>
              </div>
            )}
          </div>
          <div className="mt-8">
            <Link to="/register" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-semibold transition-colors">
              Start Preparation <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Problem ────────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 bg-white/[0.02] border-y border-white/[0.06]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Class 11 entrance preparation can feel confusing after SEE</h2>
          <p className="text-slate-400 mb-10">
            After SEE, many students want to prepare seriously for Class 11 entrance exams, but they often do not know where to start, what to practice, which stream to choose, or how to plan their future study path.
          </p>
          <div className="grid sm:grid-cols-2 gap-3 text-left mb-10">
            {[
              'Scattered notes and random questions make preparation confusing.',
              'Students do not always know which topics are important.',
              'Many students cannot get instant help when they are stuck.',
              'It is difficult to track weak areas and improvement.',
              'Students often feel confused about stream selection after SEE.',
              'Many students do not know how to research colleges, career paths, and future study options.',
            ].map((pain) => (
              <div key={pain} className="flex gap-3 items-start p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                <XCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-slate-300">{pain}</p>
              </div>
            ))}
          </div>
          <p className="text-slate-300 font-medium">
            NeuraFix Bridge brings preparation, practice, AI tutor support, progress tracking, and career guidance into one organized platform.
          </p>
        </div>
      </section>

      {/* ── What is NeuraFix Bridge ─────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">What is NeuraFix Bridge?</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              NeuraFix Bridge is an AI-powered online preparation and guidance platform for SEE students preparing for Class 11 entrance exams. It provides mock tests, smart practice sessions, AI tutor support, organized study resources, progress tracking, and a personal career counselor agent to help students make better decisions after SEE.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: Target, title: 'Entrance-focused', body: 'Built around the preparation needs of SEE students entering Class 11.', color: 'text-indigo-400' },
              { icon: Zap, title: 'AI-supported', body: 'Students can ask questions and receive instant learning support.', color: 'text-violet-400' },
              { icon: Compass, title: 'Career-aware', body: 'Students can explore streams, colleges, and future career paths with AI guidance.', color: 'text-rose-400' },
              { icon: Lightbulb, title: 'Structured', body: 'Subjects, practice, tests, guidance, and progress are organized in one platform.', color: 'text-amber-400' },
            ].map(({ icon: Icon, title, body, color }) => (
              <div key={title} className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                <Icon size={22} className={color} />
                <p className="font-semibold text-white">{title}</p>
                <p className="text-sm text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Showcase ──────────────────────────────────────────────── */}
      <section ref={featuresRef} className="py-20 px-4 sm:px-6 bg-white/[0.02] border-y border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-3">Everything you need to prepare better</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              From mock tests to career guidance, NeuraFix Bridge helps students practice, understand, improve, and plan their next step after SEE.
            </p>
          </div>
          <div className="space-y-20">
            {[
              {
                title: 'Practice with entrance-focused mock tests',
                text: 'Attempt mock tests designed for Class 11 entrance preparation and build confidence before the real exam.',
                ui: <MockTestUI />,
                reverse: false,
              },
              {
                title: 'Get instant help from the AI tutor',
                text: 'Ask questions when you are confused and get clear explanations that help you understand difficult concepts faster.',
                ui: <TutorUI />,
                reverse: true,
              },
              {
                title: 'Strengthen weak topics with smart practice',
                text: 'Practice subject-wise, chapter-wise, and topic-wise questions so your preparation becomes focused and effective.',
                ui: <PracticeUI />,
                reverse: false,
              },
              {
                title: 'Track your preparation progress',
                text: 'See your mock test performance, weak areas, improvement history, and preparation progress in one place.',
                ui: <ProgressUI />,
                reverse: true,
              },
              {
                title: 'Learn from organized study resources',
                text: 'Access important concepts, notes, and entrance-focused learning materials organized by subject and topic.',
                ui: <ResourcesUI />,
                reverse: false,
              },
              {
                title: 'Get personal career guidance',
                text: 'Use the career counselor agent to explore streams, future study options, colleges, and possible career paths after SEE.',
                ui: <CareerUI />,
                reverse: true,
              },
            ].map(({ title, text, ui, reverse }) => (
              <div key={title} className={`grid md:grid-cols-2 gap-12 items-center ${reverse ? 'md:[&>*:first-child]:order-2' : ''}`}>
                <div className="space-y-4">
                  <h3 className="text-2xl font-bold text-white">{title}</h3>
                  <p className="text-slate-400 text-lg leading-relaxed">{text}</p>
                  <Link to="/register" className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors">
                    Get started <ChevronRight size={14} />
                  </Link>
                </div>
                <div className="relative">
                  <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-indigo-500/10 to-violet-500/5 blur-2xl pointer-events-none" />
                  <div className="relative">{ui}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Career Counselor ───────────────────────────────────────────────── */}
      <section ref={careerRef} className="py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 bg-rose-600/10 border border-rose-500/20 text-rose-300 text-xs px-3 py-1.5 rounded-full">
              <Compass size={12} /> Personal AI Career Counselor
            </div>
            <h2 className="text-3xl font-bold text-white">Meet your personal AI career counselor</h2>
            <p className="text-slate-400 leading-relaxed">
              NeuraFix Bridge does not only help students prepare for entrance exams. It also helps them make better decisions about their future.
            </p>
            <p className="text-slate-400 leading-relaxed">
              After SEE, many students are unsure which stream to choose, which colleges to explore, and what career paths may fit their interests. The NeuraFix Bridge career counselor agent helps students research options, compare paths, and think clearly before making important academic decisions.
            </p>
            <ul className="space-y-2">
              {[
                'Explore Science, Management, and other study streams',
                'Research possible career paths based on interests',
                'Understand what different streams can lead to',
                'Compare colleges and future study options',
                'Ask personal questions about academic direction',
                'Get guidance before making important decisions',
              ].map((point) => (
                <li key={point} className="flex items-center gap-2.5 text-sm text-slate-300">
                  <CheckCircle size={14} className="text-rose-400 flex-shrink-0" />
                  {point}
                </li>
              ))}
            </ul>
            <Link to="/register" className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-6 py-3 rounded-xl font-semibold transition-colors">
              Explore Career Guidance <ArrowRight size={16} />
            </Link>
          </div>
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-rose-500/15 to-violet-500/10 blur-2xl pointer-events-none" />
            <div className="relative rounded-2xl border border-white/10 bg-[#0f1729] shadow-2xl overflow-hidden text-sm">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#101625]">
                <div className="w-6 h-6 rounded-full bg-rose-600 flex items-center justify-center">
                  <Compass size={12} className="text-white" />
                </div>
                <span className="text-slate-300 font-medium">Career Counselor — NeuraFix Bridge</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-rose-600/20 border border-rose-500/20 rounded-xl rounded-br-sm px-3 py-2.5 text-slate-200 text-xs">
                    I am confused between Science and Management. How should I decide?
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-rose-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Compass size={11} className="text-white" />
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl rounded-tl-sm px-3 py-2.5 text-xs space-y-2 flex-1">
                    <p className="text-slate-200 font-medium">Let me help you think through this carefully.</p>
                    <div className="space-y-1.5">
                      {[
                        { icon: '🔬', stream: 'Science', desc: 'Best for: Medicine, Engineering, Research, Technology' },
                        { icon: '📊', stream: 'Management', desc: 'Best for: Business, Finance, Entrepreneurship, Administration' },
                      ].map(({ icon, stream, desc }) => (
                        <div key={stream} className="bg-white/5 rounded-lg p-2">
                          <p className="text-slate-200 font-medium text-xs">{icon} {stream}</p>
                          <p className="text-slate-400 text-xs mt-0.5">{desc}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-slate-400">To guide you better: What subjects do you enjoy most? Do you have any career goals in mind? Your interests and strengths matter more than the stream's difficulty.</p>
                    <p className="text-indigo-300 text-xs">I can also research colleges for both streams and help you compare future options.</p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="max-w-[85%] bg-rose-600/20 border border-rose-500/20 rounded-xl rounded-br-sm px-3 py-2 text-slate-200 text-xs">
                    I enjoy Mathematics and want to explore engineering...
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Different ──────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 bg-white/[0.02] border-y border-white/[0.06]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Why NeuraFix Bridge is different</h2>
            <p className="text-slate-400">Instead of scattered preparation, students get a structured platform for learning, practice, progress, and future guidance.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
              <p className="text-slate-400 font-semibold text-lg">Random preparation</p>
              <ul className="space-y-3">
                {[
                  'Scattered notes and questions',
                  'No instant learning support',
                  'Limited practice structure',
                  'No progress tracking',
                  'No personal career guidance',
                  'Students remain confused about next steps',
                ].map((p) => (
                  <li key={p} className="flex gap-2.5 items-center text-sm text-slate-400">
                    <XCircle size={14} className="text-red-400 flex-shrink-0" /> {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-600/10 to-violet-600/5 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <img src="/company-logo.png" alt="NeuraFix" className="w-8 h-8 object-contain" />
                <p className="font-semibold text-white text-lg">NeuraFix Bridge</p>
              </div>
              <ul className="space-y-3">
                {[
                  'Organized entrance-focused resources',
                  'AI tutor support',
                  'Mock tests and smart practice sessions',
                  'Progress and weak-topic insights',
                  'Personal AI career counselor',
                  'Guidance for streams, colleges, and career paths',
                ].map((p) => (
                  <li key={p} className="flex gap-2.5 items-center text-sm text-slate-200">
                    <CheckCircle size={14} className="text-green-400 flex-shrink-0" /> {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────────────────────── */}
      <section ref={howRef} className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-3">Start preparing in 3 simple steps</h2>
          <p className="text-slate-400 mb-14">Get up and running in minutes — no complicated setup required.</p>
          <div className="grid sm:grid-cols-3 gap-8 mb-12">
            {[
              {
                num: '01',
                icon: GraduationCap,
                title: 'Create your account',
                body: 'Create your student account and enter the preparation platform.',
                color: 'text-indigo-400 bg-indigo-600/10 border-indigo-500/20',
              },
              {
                num: '02',
                icon: BookOpen,
                title: 'Practice, learn, and take mock tests',
                body: 'Choose subjects, attempt mock tests, use smart practice sessions, and study important concepts.',
                color: 'text-violet-400 bg-violet-600/10 border-violet-500/20',
              },
              {
                num: '03',
                icon: Compass,
                title: 'Improve with AI tutor and career guidance',
                body: 'Ask questions, review explanations, track weak areas, and get guidance for streams, colleges, and career paths.',
                color: 'text-rose-400 bg-rose-600/10 border-rose-500/20',
              },
            ].map(({ num, icon: Icon, title, body, color }) => (
              <div key={num} className="flex flex-col items-center text-center space-y-4">
                <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center ${color}`}>
                  <Icon size={22} />
                </div>
                <span className="text-xs font-bold text-slate-500 tracking-widest">{num}</span>
                <p className="font-semibold text-white text-lg leading-snug">{title}</p>
                <p className="text-sm text-slate-400">{body}</p>
              </div>
            ))}
          </div>
          <Link to="/register" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-semibold transition-colors">
            Start Preparation <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── Who Can Use It ─────────────────────────────────────────────────── */}
      <section className="py-20 px-4 sm:px-6 bg-white/[0.02] border-y border-white/[0.06]">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-3">Built for SEE students preparing for their next step</h2>
          <p className="text-slate-400 mb-10">NeuraFix Bridge is designed for students who want a clear, structured, and accessible way to prepare after SEE.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { icon: GraduationCap, label: 'SEE appeared students' },
              { icon: Target, label: 'Students preparing for Class 11 entrance exams' },
              { icon: Search, label: 'Students confused about which stream to choose' },
              { icon: Globe, label: 'Students researching colleges and future options' },
              { icon: BookOpen, label: 'Students applying for Science, Management, or other streams' },
              { icon: Star, label: 'Parents who want better preparation support' },
              { icon: Users, label: 'Schools and communities supporting SEE graduates' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2.5 p-4 rounded-2xl bg-white/5 border border-white/10">
                <Icon size={20} className="text-indigo-400" />
                <p className="text-sm text-slate-300 text-center">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Mission ────────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6 bg-gradient-to-b from-indigo-900/20 to-transparent">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h2 className="text-4xl font-bold text-white leading-tight">Your SEE result is not the end. It is the beginning.</h2>
          <p className="text-slate-400 text-lg leading-relaxed">
            After SEE, many students feel confused about what to study, how to prepare, which stream to choose, and how to plan their future. NeuraFix Bridge is built to make preparation and guidance easier, smarter, and accessible for every student.
          </p>
          <p className="text-slate-400 leading-relaxed">
            We believe every student deserves the right learning support, enough practice, and clear guidance when making important academic decisions.
          </p>
          <div className="pt-2">
            <Link to="/register" className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-xl font-semibold transition-colors">
              Start Your Preparation <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section ref={faqRef} className="py-20 px-4 sm:px-6 bg-white/[0.02] border-y border-white/[0.06]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Frequently asked questions</h2>
            <p className="text-slate-400">Everything you need to know about NeuraFix Bridge.</p>
          </div>
          <div className="space-y-2">
            {activeFaqs.map((faq) => <FAQItem key={faq.id} faq={faq} />)}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-indigo-600/10 border border-indigo-500/20 text-indigo-300 text-xs px-3 py-1.5 rounded-full">
            <Sparkles size={12} /> Built for SEE students
          </div>
          <h2 className="text-4xl font-bold text-white leading-tight">Start your Class 11 entrance preparation today</h2>
          <p className="text-slate-400 text-lg">
            Join NeuraFix Bridge and prepare with AI tutor support, mock tests, smart practice sessions, progress tracking, and personal career guidance.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link to="/register" className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3.5 rounded-xl font-semibold text-lg transition-colors">
              Register <ArrowRight size={18} />
            </Link>
            <Link to="/login" className="flex items-center gap-2 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white px-8 py-3.5 rounded-xl text-lg transition-colors">
              Login
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-12 px-4 sm:px-6 bg-[#101625]">
        <div className="max-w-6xl mx-auto grid sm:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <img src="/company-logo.png" alt="NeuraFix" className="w-8 h-8 object-contain" />
              <span className="font-bold text-white">NeuraFix Bridge</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              AI-powered Class 11 entrance preparation and career guidance platform for SEE students.
            </p>
            <p className="text-xs text-slate-500">by NeuraFix AI</p>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-300">Quick Links</p>
            <div className="space-y-2">
              {[
                { label: 'Features', ref: featuresRef },
                { label: 'Career Guidance', ref: careerRef },
                { label: 'Demo', ref: demoRef },
                { label: 'How It Works', ref: howRef },
                { label: 'FAQ', ref: faqRef },
              ].map(({ label, ref }) => (
                <button key={label} onClick={() => scrollTo(ref)} className="block text-sm text-slate-400 hover:text-white transition-colors">
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-300">Account</p>
            <div className="space-y-2">
              <Link to="/login" className="block text-sm text-slate-400 hover:text-white transition-colors">Login</Link>
              <Link to="/register" className="block text-sm text-slate-400 hover:text-white transition-colors">Register</Link>
            </div>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-8 pt-6 border-t border-white/10 text-center">
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} NeuraFix AI. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
