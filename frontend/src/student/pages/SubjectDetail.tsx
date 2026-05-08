import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import TutorChat from '../components/TutorChat'
import PracticeTab from '../components/PracticeTab'

type Tab = 'tutor' | 'notes' | 'capsule' | 'practice'

const SUBJECT_DISPLAY: Record<string, string> = {
  compulsory_math: 'Compulsory Mathematics',
  optional_math: 'Optional Mathematics',
  compulsory_english: 'Compulsory English',
  compulsory_science: 'Compulsory Science',
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'tutor', label: 'Tutor Chat' },
  { key: 'notes', label: 'Notes' },
  { key: 'capsule', label: 'Daily Capsule' },
  { key: 'practice', label: 'Practice' },
]

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <p className="text-lg font-semibold text-gray-400">{label}</p>
        <p className="text-sm text-gray-300 mt-1">Coming soon</p>
      </div>
    </div>
  )
}

export default function SubjectDetail() {
  const { subject } = useParams<{ subject: string }>()
  const [activeTab, setActiveTab] = useState<Tab>('tutor')

  if (!subject) return null

  const subjectDisplay = SUBJECT_DISPLAY[subject] || subject

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4 flex-shrink-0">
        <Link to="/student/tutor" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">{subjectDisplay}</h1>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-6 flex-shrink-0">
        <div className="flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'tutor' && <TutorChat subject={subject} />}
        {activeTab === 'notes' && <Placeholder label="Notes — Coming in Phase 10" />}
        {activeTab === 'capsule' && <Placeholder label="Daily Capsule — Coming in Phase 9" />}
        {activeTab === 'practice' && <PracticeTab subject={subject} />}
      </div>
    </div>
  )
}
