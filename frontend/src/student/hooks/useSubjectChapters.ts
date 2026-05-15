import { useEffect, useState } from 'react'
import api from '../../lib/api'

export interface Chapter {
  id: string
  display_name: string
}

export function useSubjectChapters(subject: string) {
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!subject) return
    setLoading(true)
    api.get(`/api/subjects/${subject}/chapters`)
      .then((res) => {
        const data: { chapter_id: string; display_name: string }[] = res.data
        setChapters(data.map((c) => ({ id: c.chapter_id, display_name: c.display_name })))
      })
      .catch(() => setChapters([]))
      .finally(() => setLoading(false))
  }, [subject])

  return { chapters, loading }
}
