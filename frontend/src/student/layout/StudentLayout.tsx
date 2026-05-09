import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import StudentSidebar from './StudentSidebar'
import api from '../../lib/api'

export default function StudentLayout() {
  const { user } = useAuth()
  const [profilePct, setProfilePct] = useState<number | null>(null)
  const [stream, setStream] = useState<string>('science')
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    api.get('/api/profile/student')
      .then((res) => {
        const pct = res.data?.completion_percentage ?? res.data?.profile_completion_pct ?? null
        setProfilePct(pct)
        const s = res.data?.stream || res.data?.student_profile?.stream || 'science'
        setStream(s)
      })
      .catch(() => {})

    api.get('/api/subscription/status')
      .then((res) => setSubscriptionStatus(res.data.status ?? 'none'))
      .catch(() => setSubscriptionStatus('none'))
  }, [])

  const showProfileBanner = profilePct !== null && profilePct < 100
  const showSubBanner = subscriptionStatus !== null && subscriptionStatus !== 'active'

  const subBannerMessage =
    subscriptionStatus === 'trial'
      ? "You're on your free trial — subscribe to keep full access after it ends."
      : subscriptionStatus === 'expired'
      ? 'Your subscription has expired. Subscribe to continue using tutors, consultant, and practice.'
      : 'Subscribe to a paid plan to unlock tutors, consultant, and practice sessions.'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <StudentSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar with hamburger */}
        <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100"
          >
            <Menu size={20} />
          </button>
          <span className="text-base font-bold text-indigo-700">HamroGuru</span>
        </div>

        {showSubBanner && (
          <div className="bg-indigo-50 border-b border-indigo-200 px-4 md:px-6 py-2 flex items-center justify-between flex-shrink-0">
            <p className="text-sm text-indigo-800">{subBannerMessage}</p>
            <a
              href="/student/payment"
              className="text-xs font-medium text-indigo-900 underline hover:no-underline whitespace-nowrap ml-4"
            >
              Subscribe now
            </a>
          </div>
        )}

        {showProfileBanner && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-4 md:px-6 py-2 flex items-center justify-between flex-shrink-0">
            <p className="text-sm text-yellow-800">
              Complete your profile ({profilePct}%) to get better personalised tutoring.
            </p>
            <a
              href="/student/settings"
              className="text-xs font-medium text-yellow-900 underline hover:no-underline"
            >
              Complete profile
            </a>
          </div>
        )}

        <main className="flex-1 overflow-auto">
          <Outlet context={{ stream, subscriptionStatus }} />
        </main>
      </div>
    </div>
  )
}
