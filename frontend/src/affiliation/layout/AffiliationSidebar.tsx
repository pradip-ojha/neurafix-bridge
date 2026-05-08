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
  const { logout } = useAuth()

  return (
    <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="px-6 py-5 border-b border-gray-100">
        <span className="text-lg font-bold text-indigo-700">HamroGuru</span>
        <p className="text-xs text-gray-400 mt-0.5">Affiliate</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
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
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors w-full"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
