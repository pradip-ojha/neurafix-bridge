import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import StudentSidebar from './StudentSidebar'
import api from '../../lib/api'

export default function StudentLayout() {
  const { user } = useAuth()
  const [profilePct, setProfilePct] = useState<number | null>(null)
  const [stream, setStream] = useState<string>('science')

  useEffect(() => {
    api.get('/api/profile/student')
      .then((res) => {
        const pct = res.data?.completion_percentage ?? res.data?.profile_completion_pct ?? null
        setProfilePct(pct)
        const s = res.data?.stream || res.data?.student_profile?.stream || 'science'
        setStream(s)
      })
      .catch(() => {})
  }, [])

  const showBanner = profilePct !== null && profilePct < 100

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <StudentSidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {showBanner && (
          <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2 flex items-center justify-between">
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
          <Outlet context={{ stream }} />
        </main>
      </div>
    </div>
  )
}
