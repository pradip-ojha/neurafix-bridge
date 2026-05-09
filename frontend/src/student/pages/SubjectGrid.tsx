import { useNavigate, useOutletContext } from 'react-router-dom'
import { Calculator, BookOpen, Microscope, PenLine } from 'lucide-react'

interface SubjectCard {
  key: string
  display: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  color: string
  textColor: string
}

const SCIENCE_SUBJECTS: SubjectCard[] = [
  { key: 'compulsory_math', display: 'Compulsory Mathematics', icon: Calculator, color: 'bg-blue-500', textColor: 'text-blue-700' },
  { key: 'compulsory_english', display: 'Compulsory English', icon: BookOpen, color: 'bg-green-500', textColor: 'text-green-700' },
  { key: 'compulsory_science', display: 'Compulsory Science', icon: Microscope, color: 'bg-purple-500', textColor: 'text-purple-700' },
  { key: 'optional_math', display: 'Optional Mathematics', icon: PenLine, color: 'bg-orange-500', textColor: 'text-orange-700' },
]

const MANAGEMENT_SUBJECTS: SubjectCard[] = [
  { key: 'compulsory_math', display: 'Compulsory Mathematics', icon: Calculator, color: 'bg-blue-500', textColor: 'text-blue-700' },
  { key: 'compulsory_english', display: 'Compulsory English', icon: BookOpen, color: 'bg-green-500', textColor: 'text-green-700' },
]

export default function SubjectGrid() {
  const navigate = useNavigate()
  const { stream, subscriptionStatus } = useOutletContext<{ stream: string; subscriptionStatus: string | null }>()

  const subjects = stream === 'management' ? MANAGEMENT_SUBJECTS : SCIENCE_SUBJECTS

  const handleSubjectClick = (key: string) => {
    if (subscriptionStatus !== null && subscriptionStatus !== 'active') {
      navigate('/student/payment')
      return
    }
    navigate(`/student/tutor/${key}`)
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Your Subjects</h1>
      <p className="text-gray-500 text-sm mb-8">Select a subject to start learning with your personal tutor.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {subjects.map((subject) => {
          const Icon = subject.icon
          const locked = subscriptionStatus !== null && subscriptionStatus !== 'active'
          return (
            <button
              key={subject.key}
              onClick={() => handleSubjectClick(subject.key)}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden text-left hover:shadow-md transition-shadow group"
            >
              <div className={`${locked ? 'bg-gray-300' : subject.color} h-24 flex items-center justify-center`}>
                <Icon size={40} className="text-white" />
              </div>
              <div className="p-4">
                <p className={`font-semibold text-sm leading-snug transition-colors ${locked ? 'text-gray-400' : 'text-gray-800 group-hover:text-indigo-700'}`}>
                  {subject.display}
                </p>
                <p className="text-xs text-gray-400 mt-1">{locked ? 'Subscription required' : 'Tutor · Notes · Practice'}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
