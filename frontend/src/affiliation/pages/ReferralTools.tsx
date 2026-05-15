import { useEffect, useState, FormEvent } from 'react'
import { Copy, Check } from 'lucide-react'
import api from '../../lib/api'

export default function ReferralTools() {
  const [referralLink, setReferralLink] = useState('')
  const [copied, setCopied] = useState(false)

  const [platformUrl, setPlatformUrl] = useState('https://bridge.neurafixai.com')
  const [userMessage, setUserMessage] = useState('')
  const [generatedPost, setGeneratedPost] = useState('')
  const [postCopied, setPostCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  useEffect(() => {
    api.get('/api/users/me/referral-code')
      .then((res) => setReferralLink(res.data.referral_link))
      .catch(() => {})
  }, [])

  const handleCopyLink = () => {
    if (!referralLink) return
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleCopyPost = () => {
    if (!generatedPost) return
    navigator.clipboard.writeText(generatedPost).then(() => {
      setPostCopied(true)
      setTimeout(() => setPostCopied(false), 2000)
    })
  }

  const handleGeneratePost = async (e: FormEvent) => {
    e.preventDefault()
    setGenerating(true)
    setGenError('')
    setGeneratedPost('')
    try {
      const res = await api.post('/api/referral/generate-post', {
        platform_url: platformUrl,
        user_message: userMessage || undefined,
      })
      setGeneratedPost(res.data.post_text)
    } catch {
      setGenError('Failed to generate post. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Referral Tools</h1>

      {/* Referral link section */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Your Referral Link</h2>
        <div className="flex gap-2">
          <input
            readOnly
            value={referralLink}
            placeholder="Loading..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700 focus:outline-none"
          />
          <button
            onClick={handleCopyLink}
            disabled={!referralLink}
            className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Students who sign up with your link get a discount, and you earn commission.
        </p>
      </div>

      {/* Post generator */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">AI Post Generator</h2>
        <form onSubmit={handleGeneratePost} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Platform URL (where you'll post)
            </label>
            <input
              type="url"
              value={platformUrl}
              onChange={(e) => setPlatformUrl(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Message / Instructions (optional)
            </label>
            <textarea
              rows={3}
              value={userMessage}
              onChange={(e) => setUserMessage(e.target.value)}
              placeholder="e.g. Make it in Nepali, mention the exam preparation aspect..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={generating}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {generating ? 'Generating...' : 'Generate Post'}
          </button>
        </form>

        {genError && <p className="mt-3 text-sm text-red-500">{genError}</p>}

        {generatedPost && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-gray-600">Generated post</p>
              <button
                onClick={handleCopyPost}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
              >
                {postCopied ? <Check size={12} /> : <Copy size={12} />}
                {postCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              readOnly
              rows={6}
              value={generatedPost}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700 focus:outline-none resize-none"
            />
          </div>
        )}
      </div>
    </div>
  )
}
