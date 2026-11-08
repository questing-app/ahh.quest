const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'

const variants = {
  primary: 'bg-moss text-paper-raised hover:bg-moss-deep',
  outline: 'border border-ink/25 text-ink hover:border-ink/60',
  danger: 'border border-wax/40 text-wax hover:border-wax',
}

const sizes = {
  md: 'px-5 py-3 text-[15px]',
  sm: 'px-3.5 py-2 text-sm',
}

export function button(variant: keyof typeof variants = 'primary', size: keyof typeof sizes = 'md') {
  return `${base} ${variants[variant]} ${sizes[size]}`
}
