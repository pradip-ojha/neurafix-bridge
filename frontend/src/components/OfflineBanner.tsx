import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export default function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOffline = () => setOffline(true)
    const handleOnline = () => setOffline(false)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-500 text-white text-sm py-2 px-4 flex items-center justify-center gap-2">
      <WifiOff size={15} />
      No internet connection — please check your network
    </div>
  )
}
