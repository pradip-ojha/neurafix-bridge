import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, CreditCard, Gift, BookOpen,
  HelpCircle, FileText, Plus, Building2, Clock, Settings,
  Bell, LogOut, Megaphone,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const nav = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/referrals', label: 'Referrals', icon: Gift },
  { to: '/admin/community', label: 'Community', icon: Megaphone },
  { label: 'Content', type: 'group' },
  { to: '/admin/content/rag-notes', label: 'RAG Notes', icon: BookOpen },
  { to: '/admin/content/questions', label: 'Questions', icon: HelpCircle },
  { to: '/admin/content/level-notes', label: 'Level Notes', icon: FileText },
  { to: '/admin/content/extra-subjects', label: 'Extra Subjects', icon: Plus },
  { label: 'Configuration', type: 'group' },
  { to: '/admin/colleges', label: 'Colleges', icon: Building2 },
  { to: '/admin/subject-timing', label: 'Subject Timing', icon: Clock },
  { to: '/admin/config', label: 'Platform Config', icon: Settings },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
]

export default function Sidebar() {
  const { logout, user } = useAuth()

  const initials = (user?.full_name ?? 'A')
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <aside className="w-60 bg-slate-900 text-slate-300 flex flex-col h-screen fixed left-0 top-0">
      <div className="px-5 py-5 border-b border-slate-700/60">
        <span className="text-white font-bold text-base tracking-tight">NeuraFix AI</span>
        <p className="text-slate-500 text-xs mt-0.5">Admin Panel</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
        {nav.map((item, i) => {
          if (item.type === 'group') {
            return (
              <p key={i} className="px-3 pt-5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
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
                `flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-400 font-medium'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              <Icon size={15} />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t border-slate-700/60 p-3 space-y-0.5">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="w-7 h-7 rounded-full bg-indigo-600/30 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-indigo-400">{initials}</span>
          </div>
          <span className="text-xs text-slate-400 truncate flex-1">{user?.full_name ?? 'Admin'}</span>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-500 hover:text-red-400 w-full rounded-lg hover:bg-white/5 transition-colors"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
