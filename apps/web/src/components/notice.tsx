export function Notice({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'error' }) {
  return (
    <p className={`py-10 text-[15px] ${tone === 'error' ? 'text-wax' : 'text-ink-soft'}`} role={tone === 'error' ? 'alert' : undefined}>
      {children}
    </p>
  )
}
