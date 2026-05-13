interface Props {
  className?: string
  variant?: 'line' | 'block' | 'circle'
  style?: React.CSSProperties
}

export default function DarkSkeleton({ className = '', variant = 'line', style }: Props) {
  const base = 'shimmer bg-study-elevated'
  const shape =
    variant === 'circle' ? 'rounded-full' :
    variant === 'block'  ? 'rounded-xl' :
    'rounded-md'

  return <div className={`${base} ${shape} ${className}`} style={style} />
}

export function DarkSkeletonMessage() {
  return (
    <div className="space-y-2 px-5 py-4 bg-study-card border border-white/[0.07] rounded-2xl rounded-bl-sm max-w-lg animate-fade-in-up">
      <DarkSkeleton variant="line" className="h-3 w-3/4" />
      <DarkSkeleton variant="line" className="h-3 w-full" />
      <DarkSkeleton variant="line" className="h-3 w-5/6" />
      <DarkSkeleton variant="line" className="h-3 w-1/2" />
    </div>
  )
}
