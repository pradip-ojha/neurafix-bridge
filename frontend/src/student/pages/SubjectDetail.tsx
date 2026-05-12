import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Menu } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import TutorChat from '../components/TutorChat'
import PracticeTab from '../components/PracticeTab'
import CapsuleTab from '../components/CapsuleTab'
import NotesTab from '../components/NotesTab'
import { useMobileLayout } from '../../contexts/MobileLayoutContext'

type Tab = 'tutor' | 'notes' | 'capsule' | 'practice'

const SUBJECT_DISPLAY: Record<string, string> = {
  compulsory_math:    'Compulsory Mathematics',
  optional_math:      'Optional Mathematics',
  compulsory_english: 'Compulsory English',
  compulsory_science: 'Compulsory Science',
}

const SUBJECT_SHORT: Record<string, string> = {
  compulsory_math:    'Math',
  optional_math:      'Opt. Math',
  compulsory_english: 'English',
  compulsory_science: 'Science',
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'tutor',    label: 'Tutor'   },
  { key: 'notes',    label: 'Notes'   },
  { key: 'capsule',  label: 'Capsule' },
  { key: 'practice', label: 'Practice'},
]

export default function SubjectDetail() {
  const { subject } = useParams<{ subject: string }>()
  const [activeTab, setActiveTab] = useState<Tab>('tutor')
  const { setTopBarVisible, openMainSidebar } = useMobileLayout()

  useEffect(() => {
    setTopBarVisible(false)
    return () => setTopBarVisible(true)
  }, [setTopBarVisible])

  if (!subject) return null

  const subjectDisplay = SUBJECT_DISPLAY[subject] || subject
  const subjectShort   = SUBJECT_SHORT[subject]   || subject

  return (
    <div className="flex flex-col h-full bg-study-bg">
      {/* Integrated header + tabs */}
      <div className="bg-study-surface border-b border-white/[0.06] px-4 md:px-5 flex items-center justify-between h-14 flex-shrink-0">
        {/* Left: menu (mobile) + back + subject name */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={openMainSidebar}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-study-hover transition-colors flex-shrink-0"
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
          <Link
            to="/student/tutor"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-study-hover transition-colors flex-shrink-0"
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 className="text-sm font-semibold text-slate-100 truncate hidden sm:block">{subjectDisplay}</h1>
          <h1 className="text-sm font-semibold text-slate-100 truncate sm:hidden">{subjectShort}</h1>
        </div>

        {/* Right: pill tabs */}
        <div className="flex items-center gap-1 bg-study-card rounded-xl p-1 flex-shrink-0 relative">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-colors z-10 ${
                activeTab === tab.key
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {activeTab === tab.key && (
                <motion.div
                  layoutId="tab-pill"
                  className="absolute inset-0 bg-indigo-600 rounded-lg z-[-1]"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
                />
              )}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {activeTab === 'tutor'    && <TutorChat subject={subject} />}
            {activeTab === 'notes'    && <NotesTab subject={subject} />}
            {activeTab === 'capsule'  && <CapsuleTab subject={subject} />}
            {activeTab === 'practice' && <PracticeTab subject={subject} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
