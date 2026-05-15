import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  children: React.ReactNode
  role?: string
}

export default function ProtectedRoute({ children, role }: Props) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <div className="flex items-center justify-center h-screen text-gray-500">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to="/" replace />

  if (user.role === 'student' && user.email_verified === false && location.pathname !== '/verify-email') {
    return <Navigate to={`/verify-email?email=${encodeURIComponent(user.email)}`} replace />
  }

  return <>{children}</>
}
