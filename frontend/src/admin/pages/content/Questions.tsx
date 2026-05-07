import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff, Trash2, Upload } from 'lucide-react'
import api from '../../../lib/api'

interface QuestionFile {
  id: string
  file_id: string
  file_type: 'main' | 'extra'
  subject: string
  chapter: string | null
  display_name: string
  r2_url: string
  total_questions: number
  uploaded_at: string
}

interface QuestionOption {
  id: string
  text: string
}

interface QuestionData {
  question_id: string
  question_text: string
  options: QuestionOption[]
  correct_option_ids: string[]
  explanation: string
  difficulty: string
  chapter?: string
  topic?: string
  subtopic?: string | null
}

interface QuestionDetail {
  question_id: string
  data: QuestionData
  is_active: boolean
  difficulty: string
}

interface QuestionFileDetail extends QuestionFile {
  questions: QuestionDetail[]
}

interface UploadResult {
  accepted: number
  rejected: number
  errors: string[]
  file_id: string | null
}

const DIFF_COLORS: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard: 'bg-red-100 text-red-600',
}

export default function Questions() {
  const [tab, setTab] = useState<'main' | 'extra'>('main')
  const [files, setFiles] = useState<QuestionFile[]>([])
  const [loading, setLoading] = useState(false)

  const [expandedFileId, setExpandedFileId] = useState<string | null>(null)
  const [fileDetail, setFileDetail] = useState<QuestionFileDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Upload form
  const [uploadOpen, setUploadOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [jsonFile, setJsonFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const loadFiles = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/admin/questions/files')
      setFiles((res.data as QuestionFile[]).filter((f) => f.file_type === tab))
    } catch {
      // silently ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()
    setExpandedFileId(null)
    setFileDetail(null)
  }, [tab])

  const loadFileDetail = async (fileId: string) => {
    setLoadingDetail(true)
    try {
      const res = await api.get(`/api/admin/questions/files/${fileId}`)
      setFileDetail(res.data as QuestionFileDetail)
    } finally {
      setLoadingDetail(false)
    }
  }

  const toggleExpand = (fileId: string) => {
    if (expandedFileId === fileId) {
      setExpandedFileId(null)
      setFileDetail(null)
    } else {
      setExpandedFileId(fileId)
      loadFileDetail(fileId)
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!jsonFile) return
    setUploadError('')
    setUploadResult(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', jsonFile)
      fd.append('display_name', displayName)
      if (tab === 'extra') fd.append('subject', subject)
      const endpoint =
        tab === 'main'
          ? '/api/admin/questions/upload/main'
          : '/api/admin/questions/upload/extra'
      const res = await api.post(endpoint, fd)
      setUploadResult(res.data as UploadResult)
      setJsonFile(null)
      setDisplayName('')
      setSubject('')
      if (fileRef.current) fileRef.current.value = ''
      loadFiles()
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const deleteFile = async (fileId: string) => {
    if (!confirm('Delete this file and ALL its questions? This cannot be undone.')) return
    try {
      await api.delete(`/api/admin/questions/files/${fileId}`)
      if (expandedFileId === fileId) {
        setExpandedFileId(null)
        setFileDetail(null)
      }
      loadFiles()
    } catch {
      alert('Delete failed')
    }
  }

  const toggleQuestion = async (questionId: string) => {
    try {
      await api.patch(`/api/admin/questions/${questionId}/toggle`)
      if (expandedFileId) loadFileDetail(expandedFileId)
    } catch {
      alert('Toggle failed')
    }
  }

  const deleteQuestion = async (questionId: string) => {
    if (!confirm('Hard-delete this question?')) return
    try {
      await api.delete(`/api/admin/questions/${questionId}`)
      if (expandedFileId) loadFileDetail(expandedFileId)
    } catch {
      alert('Delete failed')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Questions</h1>
        <p className="text-gray-500 text-sm mt-1">Manage MCQ question files and individual questions</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(['main', 'extra'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'main' ? 'Main Subjects' : 'Extra Subjects'}
          </button>
        ))}
      </div>

      {/* Upload section */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setUploadOpen((o) => !o)}
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-indigo-600" />
            <span className="font-medium text-gray-900">Upload JSON File</span>
          </div>
          {uploadOpen ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {uploadOpen && (
          <div className="px-6 pb-6 border-t border-gray-100">
            <form onSubmit={handleUpload} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Compulsory Math — Sets Chapter"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {tab === 'extra' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subject Key <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      required
                      placeholder="e.g. gk, iq, computer_science"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    JSON File <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".json"
                    required
                    onChange={(e) => setJsonFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                </div>
              </div>

              {tab === 'main' && (
                <p className="text-xs text-gray-400">
                  Subject and chapter are read from the JSON (each question must include subject, chapter, and topic fields).
                </p>
              )}

              <button
                type="submit"
                disabled={uploading}
                className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {uploading ? (
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full inline-block" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </form>

            {uploadError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {uploadError}
              </div>
            )}

            {uploadResult && (
              <div
                className={`mt-3 p-3 rounded-lg border text-sm ${
                  uploadResult.rejected > 0
                    ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                    : 'bg-green-50 border-green-200 text-green-800'
                }`}
              >
                <div className="font-medium">
                  Accepted: {uploadResult.accepted} &nbsp;·&nbsp; Rejected: {uploadResult.rejected}
                </div>
                {uploadResult.errors.length > 0 && (
                  <ul className="mt-2 space-y-1 list-disc list-inside text-xs">
                    {uploadResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* File list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">
            Uploaded Files
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({files.length} file{files.length !== 1 ? 's' : ''})
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : files.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No files uploaded yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {files.map((f) => (
              <div key={f.file_id}>
                {/* File row */}
                <div className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{f.display_name}</div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500">{f.subject}</span>
                      {f.chapter && (
                        <>
                          <span className="text-gray-300">·</span>
                          <span className="text-xs text-gray-500">{f.chapter}</span>
                        </>
                      )}
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-indigo-600 font-medium">
                        {f.total_questions} question{f.total_questions !== 1 ? 's' : ''}
                      </span>
                      <span className="text-gray-300">·</span>
                      <span className="text-xs text-gray-400">
                        {new Date(f.uploaded_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleExpand(f.file_id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      {expandedFileId === f.file_id ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5" /> Hide
                        </>
                      ) : (
                        <>
                          <Eye className="h-3.5 w-3.5" /> View
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => deleteFile(f.file_id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete File
                    </button>
                  </div>
                </div>

                {/* Expanded question detail */}
                {expandedFileId === f.file_id && (
                  <div className="bg-gray-50 border-t border-gray-100 px-6 py-4">
                    {loadingDetail ? (
                      <div className="text-center text-gray-400 text-sm py-6">Loading questions…</div>
                    ) : !fileDetail ? null : (
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-gray-700 mb-2">
                          {fileDetail.questions.length} question
                          {fileDetail.questions.length !== 1 ? 's' : ''} in this file
                        </div>
                        {fileDetail.questions.map((q) => (
                          <QuestionCard
                            key={q.question_id}
                            question={q}
                            onToggle={() => toggleQuestion(q.question_id)}
                            onDelete={() => deleteQuestion(q.question_id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function QuestionCard({
  question,
  onToggle,
  onDelete,
}: {
  question: QuestionDetail
  onToggle: () => void
  onDelete: () => void
}) {
  const { data, is_active, difficulty } = question
  const correctSet = new Set(data.correct_option_ids ?? [])

  return (
    <div
      className={`bg-white border rounded-lg p-4 ${
        is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-gray-400">{data.question_id}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              DIFF_COLORS[difficulty] ?? 'bg-gray-100 text-gray-600'
            }`}
          >
            {difficulty}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggle}
            className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button
            onClick={onDelete}
            className="text-xs px-2 py-1 border border-red-200 rounded text-red-600 hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Question text */}
      <p className="font-medium text-gray-900 text-sm mb-3">{data.question_text}</p>

      {/* Options */}
      <div className="space-y-1.5 mb-3">
        {(data.options ?? []).map((opt) => (
          <div
            key={opt.id}
            className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-sm ${
              correctSet.has(opt.id)
                ? 'bg-green-50 border-green-300 text-green-800'
                : 'bg-white border-gray-200 text-gray-700'
            }`}
          >
            <span className="font-medium shrink-0">{opt.id}.</span>
            <span>{opt.text}</span>
          </div>
        ))}
      </div>

      {/* Tags */}
      {(data.chapter || data.topic || data.subtopic) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {data.chapter && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs">
              {data.chapter}
            </span>
          )}
          {data.topic && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs">
              {data.topic}
            </span>
          )}
          {data.subtopic && (
            <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs">
              {data.subtopic}
            </span>
          )}
        </div>
      )}

      {/* Explanation */}
      {data.explanation && (
        <p className="text-xs text-gray-500 italic border-t border-gray-100 pt-2">
          <span className="font-medium not-italic text-gray-600">Explanation: </span>
          {data.explanation}
        </p>
      )}
    </div>
  )
}
