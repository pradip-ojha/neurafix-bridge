import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuth } from '../../contexts/AuthContext'

export default function AdminLayout() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="ml-60 flex-1 min-h-screen bg-gray-50">
        <main className="p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
