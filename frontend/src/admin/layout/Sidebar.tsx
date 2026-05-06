import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, CreditCard, Gift, BookOpen,
  HelpCircle, FileText, Plus, Building2, Clock, Settings,
  Bell, LogOut,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const nav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/referrals', label: 'Referrals', icon: Gift },
  { label: 'Content', type: 'group' },
  { to: '/admin/content/rag-notes', label: 'RAG Notes', icon: BookOpen },
  { to: '/admin/content/questions', label: 'Questions', icon: HelpCircle },
  { to: '/admin/content/level-notes', label: 'Level Notes', icon: FileText },
  { to: '/admin/content/extra-subjects', label: 'Extra Subjects', icon: Plus },
  { label: 'Settings', type: 'group' },
  { to: '/admin/colleges', label: 'Colleges', icon: Building2 },
  { to: '/admin/subject-timing', label: 'Subject Timing', icon: Clock },
  { to: '/admin/config', label: 'Config', icon: Settings },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
]

export default function Sidebar() {
  const { logout } = useAuth()

  return (
    <aside className="w-60 bg-gray-900 text-gray-300 flex flex-col h-screen fixed left-0 top-0">
      <div className="px-6 py-5 border-b border-gray-700">
        <span className="text-white font-bold text-lg">HamroGuru Admin</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 space-y-0.5">
        {nav.map((item, i) => {
          if (item.type === 'group') {
            return (
              <p key={i} className="px-6 pt-5 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {item.label}
              </p>
            )
          }
          const Icon = item.icon!
          return (
            <NavLink
              key={item.to}
              to={item.to!}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-2 text-sm transition ${
                  isActive ? 'bg-indigo-600 text-white' : 'hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon size={16} />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-gray-700 p-4">
        <button
          onClick={logout}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white w-full transition"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
