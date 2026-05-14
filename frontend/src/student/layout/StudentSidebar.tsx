import { NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Bot, BookOpen, ClipboardList, MessageSquare, Users, TrendingUp, Settings, Library, CreditCard, LogOut, Sun, Moon } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'

const NAV_ITEMS = [
  { to: '/student/tutor',      icon: Bot,          label: 'Tutor'        },
  { to: '/student/practice',   icon: BookOpen,      label: 'Practice'     },
  { to: '/student/mock-tests', icon: ClipboardList, label: 'Mock Tests'   },
  { to: '/student/consultant', icon: MessageSquare, label: 'Consultant'   },
  { to: '/student/community',  icon: Users,         label: 'Community'    },
  { to: '/student/progress',   icon: TrendingUp,    label: 'Progress'     },
  { to: '/student/syllabus',   icon: Library,       label: 'Syllabus'     },
  { to: '/student/payment',    icon: CreditCard,    label: 'Subscription' },
  { to: '/student/settings',   icon: Settings,      label: 'Settings'     },
]

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function StudentSidebar({ isOpen, onClose }: Props) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const sidebarContent = (
    <aside className="w-60 flex-shrink-0 bg-study-surface border-r border-white/[0.06] flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.05] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/company-logo.png" alt="NeuraFix Bridge" className="w-10 h-10 rounded-lg object-contain flex-shrink-0" />
          <div>
            <span className="text-base font-bold bg-gradient-to-r from-indigo-400 to-teal-400 bg-clip-text text-transparent leading-none">
              NeuraFix Bridge
            </span>
            <p className="text-slate-500 text-[10px] leading-none mt-0.5">by NeuraFix AI</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-study-hover transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto dark-scrollbar">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600/15 text-indigo-400 border-l-2 border-indigo-500 pl-[10px]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-study-hover border-l-2 border-transparent pl-[10px]'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User area */}
      <div className="px-4 py-4 border-t border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-300 text-xs font-medium truncate">{user?.full_name || 'Student'}</p>
            <p className="text-slate-500 text-[10px] truncate">{user?.email || ''}</p>
          </div>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-study-hover transition-colors"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            onClick={logout}
            title="Log out"
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:flex h-full">{sidebarContent}</div>

      {/* Mobile: animated drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/50 z-30 md:hidden"
              onClick={onClose}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed inset-y-0 left-0 z-40 md:hidden"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
