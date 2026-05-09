import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import api from '../lib/api'

interface AuthUser {
  id: string
  email: string
  full_name: string
  role: string
  onboarding_complete?: boolean
}

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  register: (full_name: string, email: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(sessionStorage.getItem('token'))
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!token) { setIsLoading(false); return }
    api.get('/api/auth/me')
      .then((res) => { setUser(res.data); setIsLoading(false) })
      .catch(() => { sessionStorage.removeItem('token'); sessionStorage.removeItem('refresh_token'); setToken(null); setIsLoading(false) })
  }, [token])

  const login = async (email: string, password: string): Promise<AuthUser> => {
    const res = await api.post('/api/auth/login', { email, password })
    const { access_token, refresh_token, user: u } = res.data
    sessionStorage.setItem('token', access_token)
    if (refresh_token) sessionStorage.setItem('refresh_token', refresh_token)
    setToken(access_token)
    setUser(u)
    return u
  }

  const register = async (full_name: string, email: string, password: string): Promise<void> => {
    const res = await api.post('/api/auth/register', { full_name, email, password })
    const { access_token, refresh_token, user: u } = res.data
    sessionStorage.setItem('token', access_token)
    if (refresh_token) sessionStorage.setItem('refresh_token', refresh_token)
    setToken(access_token)
    setUser(u)
  }

  const logout = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('refresh_token')
    setToken(null)
    setUser(null)
  }

  const refreshUser = async (): Promise<void> => {
    const stored = sessionStorage.getItem('token')
    if (!stored) return
    const res = await api.get('/api/auth/me')
    setUser(res.data)
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
