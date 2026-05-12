import { useNavigate, useOutletContext } from 'react-router-dom'
import { Calculator, BookOpen, Microscope, PenLine, ChevronRight, Lock } from 'lucide-react'
import { motion } from 'framer-motion'

interface SubjectCard {
  key: string
  display: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  gradient: string
}

const SCIENCE_SUBJECTS: SubjectCard[] = [
  { key: 'compulsory_math',    display: 'Compulsory Mathematics', icon: Calculator, gradient: 'from-blue-600 to-indigo-700' },
  { key: 'compulsory_english', display: 'Compulsory English',     icon: BookOpen,   gradient: 'from-emerald-500 to-teal-600' },
  { key: 'compulsory_science', display: 'Compulsory Science',     icon: Microscope, gradient: 'from-violet-600 to-purple-800' },
  { key: 'optional_math',      display: 'Optional Mathematics',   icon: PenLine,    gradient: 'from-orange-500 to-amber-600' },
]

const MANAGEMENT_SUBJECTS: SubjectCard[] = [
  { key: 'compulsory_math',    display: 'Compulsory Mathematics', icon: Calculator, gradient: 'from-blue-600 to-indigo-700' },
  { key: 'compulsory_english', display: 'Compulsory English',     icon: BookOpen,   gradient: 'from-emerald-500 to-teal-600' },
]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
}
const item = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

export default function SubjectGrid() {
  const navigate = useNavigate()
  const { stream, subscriptionStatus } = useOutletContext<{ stream: string; subscriptionStatus: string | null }>()

  const subjects = stream === 'management' ? MANAGEMENT_SUBJECTS : SCIENCE_SUBJECTS
  const isBlocked = subscriptionStatus !== null && subscriptionStatus !== 'trial' && subscriptionStatus !== 'active'

  const handleSubjectClick = (key: string) => {
    if (isBlocked) {
      navigate('/student/payment')
      return
    }
    navigate(`/student/tutor/${key}`)
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Your Subjects</h1>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 font-medium capitalize">
            {stream} stream
          </span>
        </div>
        <p className="text-slate-500 text-sm">Select a subject to start learning with your personal AI tutor.</p>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
      >
        {subjects.map((subject) => {
          const Icon = subject.icon
          const locked = isBlocked
          return (
            <motion.button
              key={subject.key}
              variants={item}
              onClick={() => handleSubjectClick(subject.key)}
              className="bg-study-card border border-white/[0.07] rounded-2xl overflow-hidden text-left study-card-hover group focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              {/* Gradient icon zone */}
              <div className={`relative h-28 flex items-center justify-center ${locked ? 'bg-study-elevated' : `bg-gradient-to-br ${subject.gradient}`}`}>
                {locked && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <Lock size={24} className="text-slate-500" />
                    <span className="text-slate-500 text-xs font-medium">Subscription required</span>
                  </div>
                )}
                {!locked && (
                  <>
                    <div className="absolute inset-0 bg-black/10" />
                    <Icon size={44} className="text-white/90 relative" />
                  </>
                )}
              </div>

              {/* Card body */}
              <div className="p-5 flex items-start justify-between">
                <div>
                  <p className={`font-semibold text-sm leading-snug ${locked ? 'text-slate-500' : 'text-slate-200 group-hover:text-white'} transition-colors`}>
                    {subject.display}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {locked ? 'Unlock with subscription' : 'Tutor · Notes · Practice'}
                  </p>
                </div>
                {!locked && (
                  <ChevronRight
                    size={16}
                    className="text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5"
                  />
                )}
              </div>
            </motion.button>
          )
        })}
      </motion.div>
    </div>
  )
}
