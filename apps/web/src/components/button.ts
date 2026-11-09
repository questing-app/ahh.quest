// iOS-style buttons: tall, rounded, dim on press instead of hover colours.
const base =
  'press-scale chrome inline-flex items-center justify-center gap-2 font-semibold disabled:pointer-events-none disabled:opacity-40'

const variants = {
  primary: 'bg-moss text-paper-raised',
  outline: 'bg-ink/[0.06] text-moss',
  danger: 'bg-wax/10 text-wax',
}

const sizes = {
  md: 'h-[50px] rounded-[14px] px-6 text-[17px]',
  sm: 'h-[34px] rounded-full px-4 text-[15px]',
}

export function button(variant: keyof typeof variants = 'primary', size: keyof typeof sizes = 'md') {
  return `${base} ${variants[variant]} ${sizes[size]}`
}
