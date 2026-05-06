import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuth } from '../../contexts/AuthContext'

export default function AdminLayout() {
  const { user } = useAuth()

  return (
    <div className="flex">
      <Sidebar />
      <div className="ml-60 flex-1 min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <div />
          <span className="text-sm text-gray-600">{user?.full_name}</span>
        </header>
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
