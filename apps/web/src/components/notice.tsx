export function Notice({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'error' }) {
  return (
    <p
      className={`px-6 py-12 text-center text-[15px] leading-relaxed ${tone === 'error' ? 'text-wax' : 'text-ink-soft'}`}
      role={tone === 'error' ? 'alert' : undefined}
    >
      {children}
    </p>
  )
}

/** iOS inset-grouped list container. */
export const groupedList = 'mx-4 divide-y-[0.5px] divide-ink/15 overflow-hidden rounded-[12px] bg-paper-raised'

/** Small uppercase header above a grouped list. */
export function SectionHeader({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="px-8 pb-1.5 pt-6 text-[13px] uppercase tracking-wide text-ink-soft">
      {children}
    </h3>
  )
}
