import { useEffect, useState, FormEvent, ChangeEvent } from 'react'
import api from '../../lib/api'

type Profile = {
  bank_name: string | null
  account_number: string | null
  account_name: string | null
  qr_image_url: string | null
}

export default function PaymentDetails() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [qrPreview, setQrPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/profile/affiliation')
      .then((res) => {
        const p: Profile = res.data
        setProfile(p)
        setBankName(p.bank_name || '')
        setAccountNumber(p.account_number || '')
        setAccountName(p.account_name || '')
      })
      .catch(() => {})
  }, [])

  const handleQrChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null
    setQrFile(f)
    if (f) setQrPreview(URL.createObjectURL(f))
    else setQrPreview(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const fd = new FormData()
      fd.append('bank_name', bankName)
      fd.append('account_number', accountNumber)
      fd.append('account_name', accountName)
      if (qrFile) fd.append('qr_image', qrFile)

      const res = await api.patch('/api/profile/affiliation', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setProfile((prev) => prev ? { ...prev, qr_image_url: res.data.qr_image_url } : prev)
      setQrFile(null)
      setQrPreview(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Payment Details</h1>
      <p className="text-sm text-gray-500 mb-6">
        These details are used by admin to send your commission payouts.
      </p>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Bank Name</label>
          <input
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. Himalayan Bank"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account Number</label>
          <input
            type="text"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="Account number"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account Name</label>
          <input
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Name on account"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">QR Code Image (optional)</label>
          {(qrPreview || profile?.qr_image_url) && (
            <img
              src={qrPreview || profile!.qr_image_url!}
              alt="QR code"
              className="w-32 h-32 object-cover rounded-lg border border-gray-200 mb-2"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={handleQrChange}
            className="block text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {saved && <p className="text-sm text-green-600">Payment details saved.</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {saving ? 'Saving...' : 'Save Details'}
        </button>
      </form>
    </div>
  )
}
