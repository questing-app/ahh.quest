'use client'

/** An iOS segmented control: two or three choices, one always picked. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className = '',
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`chrome flex rounded-[10px] bg-ink/[0.07] p-0.5 ${className}`}>
      {options.map((option) => {
        const picked = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={picked}
            onClick={() => onChange(option.id)}
            className={`tabular h-8 min-w-0 flex-1 truncate rounded-[8px] px-2 text-[14px] transition-colors ${
              picked ? 'bg-paper-raised font-semibold text-ink shadow-[0_1px_3px_rgba(38,38,31,0.14)]' : 'font-medium text-ink-soft'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
