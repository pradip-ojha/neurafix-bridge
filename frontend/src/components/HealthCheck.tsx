import { useEffect, useState } from 'react'
import axios from 'axios'

interface ServiceHealth {
  service?: string
  status: string
  db?: string
  pinecone?: string
  r2?: string
  redis?: string
  error?: string
}

interface CombinedHealth {
  main_backend: ServiceHealth
  ai_service: ServiceHealth
}

const StatusBadge = ({ value }: { value: string }) => {
  const color =
    value === 'connected' || value === 'ok'
      ? 'bg-green-100 text-green-800'
      : value === 'unreachable' || value === 'disconnected' || value === 'degraded' || value?.startsWith('error')
      ? 'bg-red-100 text-red-800'
      : 'bg-yellow-100 text-yellow-800'
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {value}
    </span>
  )
}

const ServiceCard = ({ label, data }: { label: string; data: ServiceHealth | null }) => {
  if (!data) return null
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium text-gray-800">{label}</span>
        <StatusBadge value={data.status} />
      </div>
      {data.error && (
        <p className="text-xs text-red-500 font-mono mb-2 break-all">{data.error}</p>
      )}
      <div className="grid grid-cols-2 gap-2 text-sm">
        {Object.entries(data)
          .filter(([k]) => !['service', 'status', 'error'].includes(k))
          .map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="text-gray-500 capitalize">{k}:</span>
              <StatusBadge value={String(v)} />
            </div>
          ))}
      </div>
    </div>
  )
}

export default function HealthCheck() {
  const [data, setData] = useState<CombinedHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = () => {
    setLoading(true)
    setError(null)
    // Single call through Vite proxy → main_backend → ai_service (server-to-server)
    axios
      .get<CombinedHealth>('/api/health/services', { timeout: 30000 })
      .then(res => {
        setData(res.data)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'main_backend unreachable — is it running on :8000?')
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchHealth()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="w-full max-w-xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">HamroGuru</h1>
        <p className="text-gray-500 mb-6 text-sm">Phase 1 — Service Health</p>

        {loading && (
          <div className="text-center text-gray-400 animate-pulse py-8">Checking services...</div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 font-mono">
            {error}
          </div>
        )}

        {data && (
          <div className="space-y-4">
            <ServiceCard label="main_backend  :8000" data={data.main_backend} />
            <ServiceCard label="ai_service  :8001" data={data.ai_service} />
          </div>
        )}

        {!loading && (
          <button
            onClick={fetchHealth}
            className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700 py-2"
          >
            Refresh
          </button>
        )}
      </div>
    </div>
  )
}
