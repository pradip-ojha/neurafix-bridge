import { useEffect, useState } from 'react'

const DEFAULT_STEPS = [
  'Fetching your personalisation…',
  'Loading your study context…',
  'Thinking carefully…',
  'Preparing your answer…',
]

interface Props {
  steps?: string[]
}

export default function AIThinkingState({ steps = DEFAULT_STEPS }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setStepIndex((i) => (i + 1) % steps.length)
        setVisible(true)
      }, 250)
    }, 1800)
    return () => clearInterval(interval)
  }, [steps.length])

  return (
    <div className="flex items-center gap-3 px-5 py-4 bg-study-card border border-white/[0.07] rounded-2xl rounded-bl-sm max-w-xs animate-fade-in-up">
      <div className="flex items-center gap-1 flex-shrink-0">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse-dot"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
      <span
        className="text-slate-400 text-xs transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {steps[stepIndex]}
      </span>
    </div>
  )
}
