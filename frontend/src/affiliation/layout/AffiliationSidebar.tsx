import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Share2, CreditCard, DollarSign, LogOut, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const NAV_ITEMS = [
  { to: '/affiliation', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/affiliation/referral-tools', icon: Share2, label: 'Referral Tools' },
  { to: '/affiliation/payment-details', icon: CreditCard, label: 'Payment Details' },
  { to: '/affiliation/earnings', icon: DollarSign, label: 'Earnings' },
]

interface Props {
  onClose?: () => void
}

export default function AffiliationSidebar({ onClose }: Props) {
  const { logout, user } = useAuth()

  const initials = (user?.full_name ?? 'P')
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col h-full shadow-sm">
      {/* Logo / brand */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/company-logo.png" alt="NeuraFix Bridge" className="h-8 w-auto flex-shrink-0" />
          <div className="min-w-0">
            <span className="text-sm font-bold text-gray-900 tracking-tight leading-tight block truncate">
              NeuraFix Bridge
            </span>
            <p className="text-xs text-gray-400 leading-tight">Partner Portal</p>
          </div>
        </div>
        {/* Close button — only visible on mobile */}
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded-lg text-gray-400 hover:bg-gray-100 flex-shrink-0"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-100 space-y-0.5">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-indigo-600">{initials}</span>
          </div>
          <span className="text-xs text-gray-500 truncate flex-1">{user?.full_name ?? 'Partner'}</span>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-red-500 transition-colors w-full"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
