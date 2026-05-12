import { createContext, useContext, type ReactNode } from 'react'

interface MobileLayoutCtx {
  topBarVisible: boolean
  setTopBarVisible: (v: boolean) => void
  mainSidebarOpen: boolean
  openMainSidebar: () => void
}

const MobileLayoutContext = createContext<MobileLayoutCtx>({
  topBarVisible: true,
  setTopBarVisible: () => {},
  mainSidebarOpen: false,
  openMainSidebar: () => {},
})

interface ProviderProps {
  children: ReactNode
  topBarVisible: boolean
  setTopBarVisible: (v: boolean) => void
  openSidebar: () => void
  mainSidebarOpen: boolean
}

export function MobileLayoutProvider({
  children,
  topBarVisible,
  setTopBarVisible,
  openSidebar,
  mainSidebarOpen,
}: ProviderProps) {
  return (
    <MobileLayoutContext.Provider
      value={{ topBarVisible, setTopBarVisible, mainSidebarOpen, openMainSidebar: openSidebar }}
    >
      {children}
    </MobileLayoutContext.Provider>
  )
}

export const useMobileLayout = () => useContext(MobileLayoutContext)
