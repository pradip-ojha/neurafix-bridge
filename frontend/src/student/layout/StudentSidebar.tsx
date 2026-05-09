import { NavLink } from 'react-router-dom'
import { X, Bot, BookOpen, ClipboardList, MessageSquare, Users, TrendingUp, Settings, Library, CreditCard } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/student/tutor', icon: Bot, label: 'Tutor' },
  { to: '/student/practice', icon: BookOpen, label: 'Practice' },
  { to: '/student/mock-tests', icon: ClipboardList, label: 'Mock Tests' },
  { to: '/student/consultant', icon: MessageSquare, label: 'Consultant' },
  { to: '/student/community', icon: Users, label: 'Community' },
  { to: '/student/progress', icon: TrendingUp, label: 'Progress' },
  { to: '/student/syllabus', icon: Library, label: 'Syllabus' },
  { to: '/student/payment', icon: CreditCard, label: 'Subscription' },
  { to: '/student/settings', icon: Settings, label: 'Settings' },
]

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function StudentSidebar({ isOpen, onClose }: Props) {
  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full
          transform transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0 md:z-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <span className="text-lg font-bold text-indigo-700">HamroGuru</span>
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
