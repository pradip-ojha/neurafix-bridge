import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../lib/api'

type Step = 'role' | 'stream'

export default function Onboarding() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [step, setStep] = useState<Step>('role')
  const [stream, setStream] = useState<'science' | 'management' | null>(null)
  const [schoolName, setSchoolName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRoleSelect = async (role: 'student' | 'affiliation_partner') => {
    setLoading(true)
    setError('')
    try {
      await api.post('/api/onboarding/set-role', { role })
      if (role === 'affiliation_partner') {
        await refreshUser()
        navigate('/affiliation', { replace: true })
      } else {
        setStep('stream')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleStreamSubmit = async () => {
    if (!stream || !schoolName.trim()) return
    setLoading(true)
    setError('')
    try {
      await api.post('/api/onboarding/student/set-stream', {
        stream,
        school_name: schoolName.trim(),
      })
      await refreshUser()
      navigate('/student/tutor', { replace: true })
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'role') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to HamroGuru</h1>
          <p className="text-gray-500 mb-8 text-sm">How will you be using HamroGuru?</p>

          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleRoleSelect('student')}
              disabled={loading}
              className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all disabled:opacity-50 group"
            >
              <GraduationCap size={36} className="text-indigo-500 group-hover:text-indigo-700" />
              <div className="text-center">
                <p className="font-semibold text-gray-800">Student</p>
                <p className="text-xs text-gray-500 mt-1">Prepare for class 11 entrance exams</p>
              </div>
            </button>

            <button
              onClick={() => handleRoleSelect('affiliation_partner')}
              disabled={loading}
              className="flex flex-col items-center gap-3 p-6 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all disabled:opacity-50 group"
            >
              <Users size={36} className="text-green-500 group-hover:text-green-700" />
              <div className="text-center">
                <p className="font-semibold text-gray-800">Affiliation Partner</p>
                <p className="text-xs text-gray-500 mt-1">Refer and earn commissions</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Almost there!</h1>
        <p className="text-gray-500 mb-8 text-sm">Tell us about your studies so we can personalise your experience.</p>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">Which stream are you preparing for?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setStream('science')}
              className={`p-4 border-2 rounded-xl text-sm font-medium transition-all ${
                stream === 'science'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-700 hover:border-indigo-300'
              }`}
            >
              Science
            </button>
            <button
              onClick={() => setStream('management')}
              className={`p-4 border-2 rounded-xl text-sm font-medium transition-all ${
                stream === 'management'
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-700 hover:border-indigo-300'
              }`}
            >
              Management & Humanities
            </button>
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-sm font-medium text-gray-700 mb-1">Current School</label>
          <input
            type="text"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder="Your school name"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={handleStreamSubmit}
          disabled={!stream || !schoolName.trim() || loading}
          className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {loading ? 'Setting up…' : 'Get started'}
        </button>
      </div>
    </div>
  )
}
