import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Components } from 'react-markdown'
import { useTheme } from '../../contexts/ThemeContext'

interface Props {
  content: string
  className?: string
}

export default function MarkdownRenderer({ content, className = '' }: Props) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const components: Components = {
    h1: ({ children }) => (
      <h1 className="text-lg font-bold text-slate-100 mt-4 mb-2 first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-base font-semibold text-slate-100 mt-3 mb-2 first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-sm font-semibold text-slate-200 mt-3 mb-1.5 first:mt-0">{children}</h3>
    ),
    p: ({ children }) => (
      <p className="text-slate-300 text-sm leading-relaxed mb-2 last:mb-0">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="space-y-1 mb-2 pl-4">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="space-y-1 mb-2 pl-4 list-decimal">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="text-slate-300 text-sm leading-relaxed flex gap-2">
        <span className="text-indigo-400 flex-shrink-0 mt-0.5">•</span>
        <span>{children}</span>
      </li>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-indigo-500/60 pl-3 my-2 text-slate-400 italic text-sm">
        {children}
      </blockquote>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-slate-200">{children}</strong>
    ),
    em: ({ children }) => (
      <em className="italic text-slate-300">{children}</em>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
      >
        {children}
      </a>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-3 rounded-xl border border-white/[0.07]">
        <table className="w-full text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-study-elevated">{children}</thead>
    ),
    tbody: ({ children }) => (
      <tbody className="divide-y divide-white/[0.05]">{children}</tbody>
    ),
    tr: ({ children }) => (
      <tr className="hover:bg-study-hover/40 transition-colors">{children}</tr>
    ),
    th: ({ children }) => (
      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{children}</th>
    ),
    td: ({ children }) => (
      <td className="px-4 py-2.5 text-slate-300 text-xs">{children}</td>
    ),
    hr: () => <hr className="border-white/[0.07] my-3" />,
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '')
      const isBlock = !!match

      if (isBlock) {
        return (
          <div className="my-2 rounded-xl overflow-hidden border border-white/[0.07]">
            <div className="bg-study-elevated px-4 py-1.5 flex items-center justify-between border-b border-white/[0.05]">
              <span className="text-slate-500 text-xs font-mono">{match[1]}</span>
            </div>
            <SyntaxHighlighter
              style={isDark ? oneDark : oneLight}
              language={match[1]}
              PreTag="div"
              customStyle={{
                margin: 0,
                padding: '1rem',
                background: isDark ? '#111d35' : '#f8fafc',
                fontSize: '0.8125rem',
                lineHeight: '1.6',
              }}
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          </div>
        )
      }

      return (
        <code
          className="bg-study-elevated text-teal-300 px-1.5 py-0.5 rounded font-mono text-[0.8em]"
          {...props}
        >
          {children}
        </code>
      )
    },
  }

  return (
    <div className={`prose-dark ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
