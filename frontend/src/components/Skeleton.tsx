interface SkeletonProps {
  className?: string
  variant?: 'line' | 'block' | 'circle'
}

export default function Skeleton({ className = '', variant = 'line' }: SkeletonProps) {
  const base = 'animate-pulse bg-gray-200 rounded'
  const variantClass =
    variant === 'circle'
      ? 'rounded-full'
      : variant === 'block'
      ? 'rounded-lg'
      : 'rounded'

  return <div className={`${base} ${variantClass} ${className}`} />
}
