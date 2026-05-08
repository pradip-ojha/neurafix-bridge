import { NavLink } from 'react-router-dom'
import {
  Bot,
  BookOpen,
  ClipboardList,
  MessageSquare,
  Users,
  TrendingUp,
  Settings,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/student/tutor', icon: Bot, label: 'Tutor' },
  { to: '/student/practice', icon: BookOpen, label: 'Practice' },
  { to: '/student/mock-tests', icon: ClipboardList, label: 'Mock Tests' },
  { to: '/student/consultant', icon: MessageSquare, label: 'Consultant' },
  { to: '/student/community', icon: Users, label: 'Community' },
  { to: '/student/progress', icon: TrendingUp, label: 'Progress' },
  { to: '/student/settings', icon: Settings, label: 'Settings' },
]

export default function StudentSidebar() {
  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="px-6 py-5 border-b border-gray-100">
        <span className="text-lg font-bold text-indigo-700">HamroGuru</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
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
  )
}
