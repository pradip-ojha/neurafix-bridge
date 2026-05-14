import { useEffect, useState } from 'react'

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
    const token = sessionStorage.getItem('token')
    fetch(`/api/subjects/${subject}/chapters`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { chapter_id: string; display_name: string }[]) =>
        setChapters(data.map((c) => ({ id: c.chapter_id, display_name: c.display_name })))
      )
      .catch(() => setChapters([]))
      .finally(() => setLoading(false))
  }, [subject])

  return { chapters, loading }
}
