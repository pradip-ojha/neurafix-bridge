import { Outlet } from 'react-router-dom'
import AffiliationSidebar from './AffiliationSidebar'

export default function AffiliationLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AffiliationSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
