import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import OfflineBanner from './components/OfflineBanner'
import Landing from './pages/Landing'
import Login from './auth/Login'
import Register from './auth/Register'
import VerifyEmail from './auth/VerifyEmail'
import AdminLayout from './admin/layout/AdminLayout'
import Dashboard from './admin/pages/Dashboard'
import Users from './admin/pages/Users'
import Payments from './admin/pages/Payments'
import Referrals from './admin/pages/Referrals'
import RagNotes from './admin/pages/content/RagNotes'
import Questions from './admin/pages/content/Questions'
import LevelNotes from './admin/pages/content/LevelNotes'
import ExtraSubjects from './admin/pages/content/ExtraSubjects'
import SubjectChapters from './admin/pages/content/SubjectChapters'
import Colleges from './admin/pages/Colleges'
import SubjectTiming from './admin/pages/SubjectTiming'
import Config from './admin/pages/Config'
import Notifications from './admin/pages/Notifications'
import AdminCommunity from './admin/pages/Community'
import HomepageConfig from './admin/pages/HomepageConfig'
import Onboarding from './student/pages/Onboarding'
import StudentLayout from './student/layout/StudentLayout'
import SubjectGrid from './student/pages/SubjectGrid'
import SubjectDetail from './student/pages/SubjectDetail'
import Practice from './student/pages/Practice'
import MockTests from './student/pages/MockTests'
import Consultant from './student/pages/Consultant'
import Community from './student/pages/Community'
import Progress from './student/pages/Progress'
import Settings from './student/pages/Settings'
import Payment from './student/pages/Payment'
import Syllabus from './student/pages/Syllabus'
import AffiliationLayout from './affiliation/layout/AffiliationLayout'
import AffiliateDashboard from './affiliation/pages/Dashboard'
import ReferralTools from './affiliation/pages/ReferralTools'
import PaymentDetails from './affiliation/pages/PaymentDetails'
import Earnings from './affiliation/pages/Earnings'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <OfflineBanner />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />

          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            }
          />

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
            <Route path="content/subject-chapters" element={<SubjectChapters />} />
            <Route path="colleges" element={<Colleges />} />
            <Route path="subject-timing" element={<SubjectTiming />} />
            <Route path="config" element={<Config />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="community" element={<AdminCommunity />} />
            <Route path="homepage" element={<HomepageConfig />} />
          </Route>

          <Route
            path="/student"
            element={
              <ProtectedRoute role="student">
                <StudentLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="tutor" replace />} />
            <Route path="tutor" element={<SubjectGrid />} />
            <Route path="tutor/:subject" element={<SubjectDetail />} />
            <Route path="practice" element={<Practice />} />
            <Route path="mock-tests" element={<MockTests />} />
            <Route path="consultant" element={<Consultant />} />
            <Route path="community" element={<Community />} />
            <Route path="progress" element={<Progress />} />
            <Route path="syllabus" element={<Syllabus />} />
            <Route path="payment" element={<Payment />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route
            path="/affiliation"
            element={
              <ProtectedRoute role="affiliation_partner">
                <AffiliationLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AffiliateDashboard />} />
            <Route path="referral-tools" element={<ReferralTools />} />
            <Route path="payment-details" element={<PaymentDetails />} />
            <Route path="earnings" element={<Earnings />} />
          </Route>

          <Route path="/" element={<Landing />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
