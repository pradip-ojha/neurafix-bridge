import axios from 'axios'

const api = axios.create({ baseURL: '' })

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token')
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

    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = sessionStorage.getItem('refresh_token')

      if (!refreshToken) {
        sessionStorage.removeItem('token')
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
        sessionStorage.setItem('token', access_token)
        if (newRefresh) sessionStorage.setItem('refresh_token', newRefresh)
        api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
        onRefreshed(access_token)
        original.headers.Authorization = `Bearer ${access_token}`
        return api(original)
      } catch {
        sessionStorage.removeItem('token')
        sessionStorage.removeItem('refresh_token')
        window.location.href = '/login'
        return Promise.reject(err)
      } finally {
        isRefreshing = false
      }
    }

    if (err.response?.status === 402) {
      if (!window.location.pathname.includes('/payment')) {
        window.location.href = '/student/payment'
      }
    }

    return Promise.reject(err)
  }
)

export default api
