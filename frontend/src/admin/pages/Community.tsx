import { useEffect, useState, FormEvent } from 'react'
import { Megaphone, FileText, Users, Trash2, Plus, X } from 'lucide-react'
import api from '../../lib/api'

type PostType = 'post' | 'announcement' | 'notice'

interface Post {
  id: string
  author_name: string
  author_role: string
  content: string
  image_url: string | null
  link_url: string | null
  post_type: PostType
  like_count: number
  created_at: string
}

const TYPE_META: Record<PostType, { label: string; icon: React.ElementType; color: string }> = {
  post: { label: 'Community Post', icon: Users, color: 'bg-indigo-100 text-indigo-700' },
  announcement: { label: 'Announcement', icon: Megaphone, color: 'bg-orange-100 text-orange-700' },
  notice: { label: 'Notice', icon: FileText, color: 'bg-green-100 text-green-700' },
}

export default function AdminCommunity() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<PostType | 'all'>('all')
  const [showForm, setShowForm] = useState(false)

  const [postType, setPostType] = useState<PostType>('announcement')
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filterType !== 'all') params.type = filterType
      const res = await api.get('/api/community/posts', { params })
      setPosts(res.data)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterType])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await api.post('/api/community/posts', {
        content: content.trim(),
        image_url: imageUrl.trim() || null,
        link_url: linkUrl.trim() || null,
        post_type: postType,
      })
      setContent('')
      setImageUrl('')
      setLinkUrl('')
      setShowForm(false)
      load()
    } catch {
      setError('Failed to create post. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this post?')) return
    try {
      await api.delete(`/api/community/posts/${id}`)
    } catch {
      /* ignore network errors */
    } finally {
      load()
    }
  }

  const formatDate = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Community</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-indigo-700 transition"
        >
          <Plus size={14} /> New Post
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'post', 'announcement', 'notice'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filterType === t
                ? 'bg-indigo-600 text-white'
                : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t === 'all' ? 'All' : TYPE_META[t].label}
          </button>
        ))}
      </div>

      {/* Create post form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Create Post</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Post type</label>
              <select
                value={postType}
                onChange={(e) => setPostType(e.target.value as PostType)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="post">Community Post</option>
                <option value="announcement">Announcement</option>
                <option value="notice">Notice</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
              <textarea
                required
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your post..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image URL (optional)</label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Link URL (optional)</label>
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {submitting ? 'Posting...' : 'Post'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border border-gray-300 text-gray-600 rounded-lg px-5 py-2 text-sm hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Posts list */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">No posts yet.</p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const meta = TYPE_META[post.post_type]
            const Icon = meta.icon
            return (
              <div key={post.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>
                      <Icon size={11} />
                      {meta.label}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{post.author_name}</span>
                    <span className="text-xs text-gray-400">{formatDate(post.created_at)}</span>
                  </div>
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.content}</p>
                {post.image_url && (
                  <p className="mt-2 text-xs text-gray-400 truncate">Image: {post.image_url}</p>
                )}
                {post.link_url && (
                  <a
                    href={post.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-xs text-indigo-600 hover:underline truncate"
                  >
                    {post.link_url}
                  </a>
                )}
                <p className="mt-2 text-xs text-gray-400">{post.like_count} like{post.like_count !== 1 ? 's' : ''}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
