import { useEffect, useState, FormEvent } from 'react'
import { Heart, Trash2, Plus, X, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../lib/api'
import DarkSkeleton from '../components/DarkSkeleton'

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
    if (role === 'admin') return 'bg-red-600/15 text-red-400 border border-red-500/20'
    return 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/20'
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-study-elevated rounded-xl p-1 mb-6">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${
              tab === t
                ? 'bg-study-card text-slate-200 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
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
          className="w-full flex items-center gap-2 bg-study-card border border-white/[0.07] rounded-xl px-4 py-3 text-sm text-slate-500 hover:border-indigo-500/30 hover:text-slate-300 transition-colors mb-4"
        >
          <Plus size={16} className="text-indigo-400" />
          {tab === 'post' ? "What's on your mind?" : `Create ${TAB_LABELS[tab]}`}
        </button>
      )}

      {/* Post list */}
      <div className="space-y-4">
        {loading && posts.length === 0 && (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-study-card border border-white/[0.07] rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <DarkSkeleton className="h-8 w-8" variant="circle" />
                  <div className="space-y-1.5 flex-1">
                    <DarkSkeleton className="h-3 w-28" />
                    <DarkSkeleton className="h-2.5 w-20" />
                  </div>
                </div>
                <DarkSkeleton className="h-3 w-full" />
                <DarkSkeleton className="h-3 w-3/4" />
              </div>
            ))}
          </>
        )}

        {posts.map((post) => (
          <div key={post.id} className="bg-study-card border border-white/[0.07] rounded-2xl p-5 animate-fade-in-up">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-indigo-400">
                    {post.author_name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200 text-sm">{post.author_name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${roleBadge(post.author_role)}`}>
                      {post.author_role}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-0.5">{formatDate(post.created_at)}</p>
                </div>
              </div>
              {(post.author_id === user?.id || isAdmin) && (
                <button
                  onClick={() => handleDelete(post.id)}
                  className="text-slate-700 hover:text-red-400 transition-colors p-1"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <p className="text-slate-300 text-sm whitespace-pre-wrap mb-3 leading-relaxed">{post.content}</p>

            {post.image_url && (
              <img
                src={post.image_url}
                alt="post image"
                className="rounded-xl max-h-64 object-cover w-full mb-3 border border-white/[0.05]"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            )}

            {post.link_url && (
              <a
                href={post.link_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-indigo-400 hover:text-indigo-300 hover:underline truncate mb-3"
              >
                {post.link_url}
              </a>
            )}

            <div className="flex items-center gap-1 pt-3 border-t border-white/[0.05]">
              <button
                onClick={() => handleLike(post.id)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  post.liked_by_me
                    ? 'text-red-400 bg-red-600/10'
                    : 'text-slate-500 hover:text-red-400 hover:bg-red-600/10'
                }`}
              >
                <Heart size={13} fill={post.liked_by_me ? 'currentColor' : 'none'} />
                {post.like_count}
              </button>
            </div>
          </div>
        ))}

        {loading && posts.length > 0 && (
          <div className="text-center py-4 text-sm text-slate-500">Loading...</div>
        )}

        {!loading && posts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-study-elevated flex items-center justify-center">
              <Users size={22} className="text-slate-600" />
            </div>
            <p className="text-sm text-slate-500">No {TAB_LABELS[tab].toLowerCase()} yet.</p>
          </div>
        )}

        {hasMore && !loading && posts.length > 0 && (
          <button
            onClick={handleLoadMore}
            className="w-full text-sm text-indigo-400 hover:text-indigo-300 py-2 transition-colors"
          >
            Load more
          </button>
        )}
      </div>

      {/* Create post modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-study-card border border-white/[0.1] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.5)] w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-slate-100">Create Post</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmitPost} className="space-y-4">
              {isAdmin && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Post type</label>
                  <select
                    value={newPostType}
                    onChange={(e) => setNewPostType(e.target.value as Tab)}
                    className="w-full bg-study-surface border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
                  >
                    <option value="post">Community Post</option>
                    <option value="announcement">Announcement</option>
                    <option value="notice">Notice</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Content</label>
                <textarea
                  required
                  rows={4}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Write something..."
                  className="w-full bg-study-surface border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Image URL (optional)</label>
                <input
                  type="text"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-study-surface border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Link URL (optional)</label>
                <input
                  type="text"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-study-surface border border-white/[0.1] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 transition-colors"
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
