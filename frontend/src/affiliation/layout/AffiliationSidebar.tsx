import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Share2, CreditCard, DollarSign, LogOut } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const NAV_ITEMS = [
  { to: '/affiliation', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/affiliation/referral-tools', icon: Share2, label: 'Referral Tools' },
  { to: '/affiliation/payment-details', icon: CreditCard, label: 'Payment Details' },
  { to: '/affiliation/earnings', icon: DollarSign, label: 'Earnings' },
]

export default function AffiliationSidebar() {
  const { logout, user } = useAuth()

  const initials = (user?.full_name ?? 'P')
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col h-full shadow-sm">
      <div className="px-5 py-5 border-b border-gray-100">
        <span className="text-base font-bold text-gray-900 tracking-tight">NeuraFix AI</span>
        <p className="text-xs text-gray-400 mt-0.5">Partner Portal</p>
      </div>
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
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
