import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import HealthCheck from './components/HealthCheck'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HealthCheck />} />
        {/* Routes for admin, student, affiliation added in later phases */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
