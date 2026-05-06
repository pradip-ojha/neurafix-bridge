import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import HealthCheck from './components/HealthCheck'
import Login from './auth/Login'
import AdminLayout from './admin/layout/AdminLayout'
import Dashboard from './admin/pages/Dashboard'
import Users from './admin/pages/Users'
import Payments from './admin/pages/Payments'
import Referrals from './admin/pages/Referrals'
import RagNotes from './admin/pages/content/RagNotes'
import Questions from './admin/pages/content/Questions'
import LevelNotes from './admin/pages/content/LevelNotes'
import ExtraSubjects from './admin/pages/content/ExtraSubjects'
import Colleges from './admin/pages/Colleges'
import SubjectTiming from './admin/pages/SubjectTiming'
import Config from './admin/pages/Config'
import Notifications from './admin/pages/Notifications'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="payments" element={<Payments />} />
            <Route path="referrals" element={<Referrals />} />
            <Route path="content/rag-notes" element={<RagNotes />} />
            <Route path="content/questions" element={<Questions />} />
            <Route path="content/level-notes" element={<LevelNotes />} />
            <Route path="content/extra-subjects" element={<ExtraSubjects />} />
            <Route path="colleges" element={<Colleges />} />
            <Route path="subject-timing" element={<SubjectTiming />} />
            <Route path="config" element={<Config />} />
            <Route path="notifications" element={<Notifications />} />
          </Route>

          <Route path="/" element={<HealthCheck />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
