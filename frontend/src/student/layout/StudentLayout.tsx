import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, X, Sun, Moon } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { ThemeProvider } from '../../contexts/ThemeContext'
import { useTheme } from '../../contexts/ThemeContext'
import { MobileLayoutProvider } from '../../contexts/MobileLayoutContext'
import StudentSidebar from './StudentSidebar'
import api from '../../lib/api'

function MobileTopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { theme, toggleTheme } = useTheme()
  return (
    <div className="md:hidden bg-study-surface border-b border-white/[0.06] px-4 py-3 flex items-center gap-3 flex-shrink-0">
      <button
        onClick={onMenuClick}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-study-hover transition-colors"
      >
        <Menu size={20} />
      </button>
      <div className="flex items-center gap-2 flex-1">
        <img src="/company-logo.png" alt="NeuraFix Bridge" className="w-8 h-8 rounded-md object-contain" />
        <span className="text-base font-bold bg-gradient-to-r from-indigo-400 to-teal-400 bg-clip-text text-transparent">
          NeuraFix Bridge
        </span>
      </div>
      <button
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-study-hover transition-colors"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </div>
  )
}

function StudentLayoutInner() {
  const { user } = useAuth()
  const [profilePct, setProfilePct] = useState<number | null>(null)
  const [stream, setStream] = useState<string>('science')
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [topBarVisible, setTopBarVisible] = useState(true)
  const [profileBannerDismissed, setProfileBannerDismissed] = useState(
    () => sessionStorage.getItem('profile_banner_dismissed') === '1'
  )

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
  }, [user])

  const showProfileBanner = !profileBannerDismissed && profilePct !== null && profilePct < 100

  const dismissProfileBanner = () => {
    setProfileBannerDismissed(true)
    sessionStorage.setItem('profile_banner_dismissed', '1')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-study-base">
      <StudentSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {topBarVisible && (
          <MobileTopBar onMenuClick={() => setSidebarOpen(true)} />
        )}

        {/* Profile completion banner */}
        {showProfileBanner && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 md:px-6 py-2 flex items-center justify-between flex-shrink-0">
            <p className="text-sm text-amber-300">
              Complete your profile ({profilePct}%) for better personalised tutoring.
            </p>
            <div className="flex items-center gap-3 ml-4">
              <a
                href="/student/settings"
                className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap"
              >
                Complete now
              </a>
              <button
                onClick={dismissProfileBanner}
                className="text-amber-500 hover:text-amber-300 transition-colors"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        <MobileLayoutProvider
          topBarVisible={topBarVisible}
          setTopBarVisible={setTopBarVisible}
          openSidebar={() => setSidebarOpen(true)}
          mainSidebarOpen={sidebarOpen}
        >
          <main className="flex-1 overflow-auto bg-study-bg">
            <Outlet context={{ stream, subscriptionStatus }} />
          </main>
        </MobileLayoutProvider>
      </div>
    </div>
  )
}

export default function StudentLayout() {
  return (
    <ThemeProvider>
      <StudentLayoutInner />
    </ThemeProvider>
  )
}
