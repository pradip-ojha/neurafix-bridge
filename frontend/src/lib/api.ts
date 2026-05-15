import axios from 'axios'

const api = axios.create({ baseURL: '' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let isRefreshing = false
let refreshSubscribers: ((token: string) => void)[] = []

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token))
  refreshSubscribers = []
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config

    // Handle unverified email — redirect to verify screen
    if (err.response?.status === 403 && err.response?.data?.detail === 'email_not_verified') {
      localStorage.removeItem('token')
      localStorage.removeItem('refresh_token')
      const email = localStorage.getItem('user_email') ?? ''
      window.location.href = `/verify-email?email=${encodeURIComponent(email)}`
      return Promise.reject(err)
    }

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = localStorage.getItem('refresh_token')

      if (!refreshToken) {
        localStorage.removeItem('token')
        window.location.href = '/login'
        return Promise.reject(err)
      }

      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshSubscribers.push((token) => {
            original.headers.Authorization = `Bearer ${token}`
            resolve(api(original))
          })
        })
      }

      isRefreshing = true
      try {
        const res = await axios.post('/api/auth/refresh', { refresh_token: refreshToken })
        const { access_token, refresh_token: newRefresh } = res.data
        localStorage.setItem('token', access_token)
        if (newRefresh) localStorage.setItem('refresh_token', newRefresh)
        api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
        onRefreshed(access_token)
        original.headers.Authorization = `Bearer ${access_token}`
        return api(original)
      } catch {
        localStorage.removeItem('token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user_email')
        window.location.href = '/login'
        return Promise.reject(err)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(err)
  }
)

export default api
