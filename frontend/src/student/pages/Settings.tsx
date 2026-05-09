import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react'
import { User, GraduationCap, FileText, ChevronRight, ExternalLink } from 'lucide-react'
import api from '../../lib/api'

interface Profile {
  full_name: string | null
  stream: string | null
  school_name: string | null
  school_address: string | null
  class_8_scores: { gpa?: number; percentage?: number } | null
  class_9_scores: { gpa?: number; percentage?: number } | null
  class_10_scores: { gpa?: number; percentage?: number } | null
  see_gpa: number | null
  marksheet_urls: { year: string; url: string }[] | null
  profile_completion_pct: number
}

const SECTIONS = ['personal', 'academic', 'marksheets'] as const
type Section = typeof SECTIONS[number]

const SECTION_META: Record<Section, { label: string; icon: ReactNode }> = {
  personal: { label: 'Personal Info', icon: <User size={16} /> },
  academic: { label: 'Academic Background', icon: <GraduationCap size={16} /> },
  marksheets: { label: 'Marksheets', icon: <FileText size={16} /> },
}

const YEAR_OPTIONS = ['Class 8 Final', 'Class 9 Final', 'Class 10 Final', 'SEE']

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      {children}
    </div>
  )
}

function SaveButton({ loading, saved }: { loading: boolean; saved: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={loading}
        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
      >
        {loading ? 'Saving...' : 'Save'}
      </button>
      {saved && <span className="text-sm text-green-600">Saved!</span>}
    </div>
  )
}

export default function Settings() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<Section>('personal')
  const [hasPractice, setHasPractice] = useState<boolean | null>(null)

  const [fullName, setFullName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [schoolAddress, setSchoolAddress] = useState('')
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [savedPersonal, setSavedPersonal] = useState(false)

  const [class8Gpa, setClass8Gpa] = useState('')
  const [class8Pct, setClass8Pct] = useState('')
  const [class9Gpa, setClass9Gpa] = useState('')
  const [class9Pct, setClass9Pct] = useState('')
  const [class10Gpa, setClass10Gpa] = useState('')
  const [class10Pct, setClass10Pct] = useState('')
  const [seeGpa, setSeeGpa] = useState('')
  const [savingAcademic, setSavingAcademic] = useState(false)
  const [savedAcademic, setSavedAcademic] = useState(false)

  const [markYear, setMarkYear] = useState(YEAR_OPTIONS[0])
  const [markFile, setMarkFile] = useState<File | null>(null)
  const [uploadingMark, setUploadingMark] = useState(false)
  const [markError, setMarkError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      api.get('/api/profile/student').then(r => {
        const p = r.data as Profile
        setProfile(p)
        setFullName(p.full_name ?? '')
        setSchoolName(p.school_name ?? '')
        setSchoolAddress(p.school_address ?? '')
        setClass8Gpa(String(p.class_8_scores?.gpa ?? ''))
        setClass8Pct(String(p.class_8_scores?.percentage ?? ''))
        setClass9Gpa(String(p.class_9_scores?.gpa ?? ''))
        setClass9Pct(String(p.class_9_scores?.percentage ?? ''))
        setClass10Gpa(String(p.class_10_scores?.gpa ?? ''))
        setClass10Pct(String(p.class_10_scores?.percentage ?? ''))
        setSeeGpa(String(p.see_gpa ?? ''))
      }),
      api.get('/api/practice/history?limit=1')
        .then(r => setHasPractice(Array.isArray(r.data) && r.data.length > 0))
        .catch(() => setHasPractice(true)),
    ]).finally(() => setLoading(false))
  }, [])

  async function savePersonal(e: FormEvent) {
    e.preventDefault()
    setSavingPersonal(true)
    setSavedPersonal(false)
    try {
      const r = await api.patch('/api/profile/student', {
        full_name: fullName || null,
        school_name: schoolName || null,
        school_address: schoolAddress || null,
      })
      setProfile(p => p ? { ...p, ...r.data } : r.data)
      setSavedPersonal(true)
      setTimeout(() => setSavedPersonal(false), 3000)
    } catch {}
    setSavingPersonal(false)
  }

  async function saveAcademic(e: FormEvent) {
    e.preventDefault()
    setSavingAcademic(true)
    setSavedAcademic(false)
    try {
      const build = (gpa: string, pct: string) =>
        gpa || pct
          ? { ...(gpa ? { gpa: parseFloat(gpa) } : {}), ...(pct ? { percentage: parseFloat(pct) } : {}) }
          : null
      const r = await api.patch('/api/profile/student', {
        class_8_scores: build(class8Gpa, class8Pct),
        class_9_scores: build(class9Gpa, class9Pct),
        class_10_scores: build(class10Gpa, class10Pct),
        see_gpa: seeGpa ? parseFloat(seeGpa) : null,
      })
      setProfile(p => p ? { ...p, ...r.data } : r.data)
      setSavedAcademic(true)
      setTimeout(() => setSavedAcademic(false), 3000)
    } catch {}
    setSavingAcademic(false)
  }

  async function uploadMarksheet(e: FormEvent) {
    e.preventDefault()
    if (!markFile) { setMarkError('Select a file.'); return }
    setUploadingMark(true)
    setMarkError('')
    try {
      const fd = new FormData()
      fd.append('year', markYear)
      fd.append('file', markFile)
      await api.post('/api/profile/student/upload-marksheet', fd)
      const r = await api.get('/api/profile/student')
      setProfile(r.data)
      setMarkFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      setMarkError('Upload failed. Please try again.')
    }
    setUploadingMark(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
  }

  const completion = profile?.profile_completion_pct ?? 0

  return (
    <div className="flex h-full overflow-hidden">
      {/* Section sidebar */}
      <aside className="w-52 flex-shrink-0 border-r border-gray-200 bg-gray-50 p-4 space-y-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">Profile</p>
        {SECTIONS.map(sec => (
          <button
            key={sec}
            onClick={() => setActiveSection(sec)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === sec
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-600 hover:bg-white hover:text-gray-900'
            }`}
          >
            {SECTION_META[sec].icon}
            {SECTION_META[sec].label}
            {activeSection === sec && <ChevronRight size={14} className="ml-auto" />}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 max-w-2xl space-y-6">

        {/* Profile completion bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Profile completion</span>
            <span className="text-xs font-semibold text-gray-700">{completion}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                completion >= 80 ? 'bg-green-500' : completion >= 50 ? 'bg-indigo-500' : 'bg-amber-400'
              }`}
              style={{ width: `${completion}%` }}
            />
          </div>
          {completion < 60 && (
            <p className="text-xs text-gray-400 mt-1">Complete your profile to get better personalised tutoring.</p>
          )}
        </div>

        {/* Mock test prompt */}
        {hasPractice === false && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center justify-between">
            <span>Take your first mock test to help your tutor understand your starting level.</span>
            <a
              href="/student/mock-tests"
              className="ml-3 flex items-center gap-1 text-amber-700 font-semibold whitespace-nowrap hover:underline"
            >
              Go <ExternalLink size={13} />
            </a>
          </div>
        )}

        {/* Personal Info */}
        {activeSection === 'personal' && (
          <form onSubmit={savePersonal} className="space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Personal Info</h2>
            <Field label="Full Name">
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Your full name"
                className={inputCls}
              />
            </Field>
            <Field label="School Name">
              <input
                type="text"
                value={schoolName}
                onChange={e => setSchoolName(e.target.value)}
                placeholder="e.g. Kathmandu Model Higher Secondary School"
                className={inputCls}
              />
            </Field>
            <Field label="School Address">
              <input
                type="text"
                value={schoolAddress}
                onChange={e => setSchoolAddress(e.target.value)}
                placeholder="District / City"
                className={inputCls}
              />
            </Field>
            <SaveButton loading={savingPersonal} saved={savedPersonal} />
          </form>
        )}

        {/* Academic Background */}
        {activeSection === 'academic' && (
          <form onSubmit={saveAcademic} className="space-y-5">
            <h2 className="text-base font-semibold text-gray-900">Academic Background</h2>
            {(
              [
                ['Class 8', class8Gpa, setClass8Gpa, class8Pct, setClass8Pct],
                ['Class 9', class9Gpa, setClass9Gpa, class9Pct, setClass9Pct],
                ['Class 10', class10Gpa, setClass10Gpa, class10Pct, setClass10Pct],
              ] as [string, string, (v: string) => void, string, (v: string) => void][]
            ).map(([label, gpa, setGpa, pct, setPct]) => (
              <div key={label} className="space-y-2">
                <p className="text-sm font-medium text-gray-700">{label} Scores</p>
                <div className="flex gap-3">
                  <Field label="GPA (out of 4.00)" className="flex-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="4"
                      value={gpa}
                      onChange={e => setGpa(e.target.value)}
                      placeholder="e.g. 3.60"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Percentage" className="flex-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={pct}
                      onChange={e => setPct(e.target.value)}
                      placeholder="e.g. 87.5"
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <Field label="SEE GPA">
              <input
                type="number"
                step="0.01"
                min="0"
                max="4"
                value={seeGpa}
                onChange={e => setSeeGpa(e.target.value)}
                placeholder="e.g. 3.85"
                className={`${inputCls} max-w-xs`}
              />
            </Field>
            <SaveButton loading={savingAcademic} saved={savedAcademic} />
          </form>
        )}

        {/* Marksheets */}
        {activeSection === 'marksheets' && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-gray-900">Marksheets</h2>

            {(profile?.marksheet_urls ?? []).length > 0 ? (
              <div className="space-y-1 bg-white border border-gray-200 rounded-lg overflow-hidden">
                {(profile?.marksheet_urls ?? []).map(entry => (
                  <div key={entry.year} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-700">{entry.year}</span>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                    >
                      View <ExternalLink size={11} />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No marksheets uploaded yet.</p>
            )}

            <form onSubmit={uploadMarksheet} className="space-y-3 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Upload New</p>
              <Field label="Year / Exam">
                <select
                  value={markYear}
                  onChange={e => setMarkYear(e.target.value)}
                  className={inputCls}
                >
                  {YEAR_OPTIONS.map(y => <option key={y}>{y}</option>)}
                </select>
              </Field>
              <Field label="File (PDF or image)">
                <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-lg px-3 py-3 cursor-pointer hover:bg-gray-50">
                  <span className="text-sm text-gray-500">{markFile ? markFile.name : 'Choose file'}</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={e => setMarkFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </Field>
              {markError && <p className="text-xs text-red-500">{markError}</p>}
              <button
                type="submit"
                disabled={uploadingMark}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {uploadingMark ? 'Uploading...' : 'Upload'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
