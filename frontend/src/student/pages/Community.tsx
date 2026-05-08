import { useEffect, useState, FormEvent } from 'react'
import { Heart, Trash2, Plus, X } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../lib/api'

type Post = {
  id: string
  author_id: string
  author_name: string
  author_role: string
  content: string
  image_url: string | null
  link_url: string | null
  post_type: string
  like_count: number
  liked_by_me: boolean
  created_at: string
}

type Tab = 'post' | 'announcement' | 'notice'

const TAB_LABELS: Record<Tab, string> = {
  post: 'Community',
  announcement: 'Announcements',
  notice: 'Notices',
}

export default function Community() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('post')
  const [posts, setPosts] = useState<Post[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const [newContent, setNewContent] = useState('')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [newPostType, setNewPostType] = useState<Tab>('post')
  const [submitting, setSubmitting] = useState(false)

  const isAdmin = user?.role === 'admin'

  const loadPosts = async (currentPage: number, currentTab: Tab, replace = false) => {
    setLoading(true)
    try {
      const res = await api.get('/api/community/posts', {
        params: { type: currentTab, page: currentPage },
      })
      const fetched: Post[] = res.data
      setPosts((prev) => (replace ? fetched : [...prev, ...fetched]))
      setHasMore(fetched.length === 20)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    setPosts([])
    setHasMore(true)
    loadPosts(1, tab, true)
  }, [tab])

  const handleLoadMore = () => {
    const next = page + 1
    setPage(next)
    loadPosts(next, tab)
  }

  const handleLike = async (postId: string) => {
    try {
      const res = await api.post(`/api/community/posts/${postId}/like`)
      const { liked, like_count } = res.data
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, liked_by_me: liked, like_count } : p))
      )
    } catch {
      /* ignore */
    }
  }

  const handleDelete = async (postId: string) => {
    if (!confirm('Delete this post?')) return
    try {
      await api.delete(`/api/community/posts/${postId}`)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
    } catch {
      /* ignore */
    }
  }

  const handleSubmitPost = async (e: FormEvent) => {
    e.preventDefault()
    if (!newContent.trim()) return
    setSubmitting(true)
    try {
      const res = await api.post('/api/community/posts', {
        content: newContent.trim(),
        image_url: newImageUrl.trim() || null,
        link_url: newLinkUrl.trim() || null,
        post_type: isAdmin ? newPostType : 'post',
      })
      if (tab === res.data.post_type) {
        setPosts((prev) => [res.data, ...prev])
      }
      setNewContent('')
      setNewImageUrl('')
      setNewLinkUrl('')
      setNewPostType('post')
      setShowModal(false)
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (s: string) => {
    const d = new Date(s)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const roleBadge = (role: string) => {
    if (role === 'admin') return 'bg-red-100 text-red-700'
    return 'bg-indigo-100 text-indigo-700'
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors ${
              tab === t ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Create post button */}
      {(tab === 'post' || isAdmin) && (
        <button
          onClick={() => setShowModal(true)}
          className="w-full flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors mb-4"
        >
          <Plus size={16} />
          {tab === 'post' ? "What's on your mind?" : `Create ${TAB_LABELS[tab]}`}
        </button>
      )}

      {/* Post list */}
      <div className="space-y-4">
        {posts.map((post) => (
          <div key={post.id} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="font-semibold text-gray-900 text-sm">{post.author_name}</span>
                <span
                  className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${roleBadge(post.author_role)}`}
                >
                  {post.author_role}
                </span>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(post.created_at)}</p>
              </div>
              {(post.author_id === user?.id || isAdmin) && (
                <button
                  onClick={() => handleDelete(post.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            <p className="text-gray-800 text-sm whitespace-pre-wrap mb-3">{post.content}</p>

            {post.image_url && (
              <img
                src={post.image_url}
                alt="post image"
                className="rounded-lg max-h-64 object-cover w-full mb-3"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            )}

            {post.link_url && (
              <a
                href={post.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-indigo-600 hover:underline truncate mb-3"
              >
                {post.link_url}
              </a>
            )}

            <div className="flex items-center gap-1 pt-2 border-t border-gray-100">
              <button
                onClick={() => handleLike(post.id)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                  post.liked_by_me
                    ? 'text-red-500 bg-red-50'
                    : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                }`}
              >
                <Heart size={14} fill={post.liked_by_me ? 'currentColor' : 'none'} />
                {post.like_count}
              </button>
            </div>
          </div>
        ))}

        {loading && (
          <div className="text-center py-4 text-sm text-gray-400">Loading...</div>
        )}

        {!loading && posts.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">No {TAB_LABELS[tab].toLowerCase()} yet.</p>
          </div>
        )}

        {hasMore && !loading && posts.length > 0 && (
          <button
            onClick={handleLoadMore}
            className="w-full text-sm text-indigo-600 hover:text-indigo-700 py-2"
          >
            Load more
          </button>
        )}
      </div>

      {/* Create post modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Create Post</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmitPost} className="space-y-3">
              {isAdmin && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Post type</label>
                  <select
                    value={newPostType}
                    onChange={(e) => setNewPostType(e.target.value as Tab)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="post">Community Post</option>
                    <option value="announcement">Announcement</option>
                    <option value="notice">Notice</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Content</label>
                <textarea
                  required
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Write something..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Image URL (optional)</label>
                <input
                  type="text"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Link URL (optional)</label>
                <input
                  type="text"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {submitting ? 'Posting...' : 'Post'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
