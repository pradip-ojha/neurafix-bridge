import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import PracticeTab from '../components/PracticeTab'

const SUBJECTS: Record<string, { label: string; stream: string[] }> = {
  compulsory_math: { label: 'Compulsory Mathematics', stream: ['science', 'management'] },
  compulsory_english: { label: 'Compulsory English', stream: ['science', 'management'] },
  compulsory_science: { label: 'Compulsory Science', stream: ['science'] },
  optional_math: { label: 'Optional Mathematics', stream: ['science'] },
}

export default function Practice() {
  const navigate = useNavigate()
  const { subscriptionStatus } = useOutletContext<{ stream: string; subscriptionStatus: string | null }>()

  useEffect(() => {
    if (subscriptionStatus !== null && subscriptionStatus !== 'trial' && subscriptionStatus !== 'active') {
      navigate('/student/payment', { replace: true })
    }
  }, [subscriptionStatus, navigate])

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)

  if (selectedSubject) {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setSelectedSubject(null)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-gray-900">
            Practice — {SUBJECTS[selectedSubject]?.label || selectedSubject}
          </h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <PracticeTab subject={selectedSubject} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Practice</h1>
      <p className="text-sm text-gray-500 mb-6">Choose a subject to start a practice session.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        {Object.entries(SUBJECTS).map(([key, val]) => (
          <button
            key={key}
            onClick={() => setSelectedSubject(key)}
            className="bg-white border border-gray-200 rounded-xl p-5 text-left hover:border-indigo-400 hover:bg-indigo-50 transition-colors group"
          >
            <h3 className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">
              {val.label}
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {val.stream.join(' & ')} stream
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
