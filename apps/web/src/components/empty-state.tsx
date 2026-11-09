import Image from 'next/image'

/** Art, a short headline, what will appear here, and the action that fills it. */
export function EmptyState({
  art,
  title,
  body,
  children,
}: {
  art: string
  title: string
  body: string
  children?: React.ReactNode
}) {
  return (
    <section className="flex flex-col items-center px-8 pb-6 pt-2 text-center">
      <Image src={art} alt="" width={780} height={650} className="art-fade w-full max-w-[300px]" />
      <h2 className="-mt-2 font-display text-[24px] leading-tight">{title}</h2>
      <p className="mt-2 max-w-[20rem] text-[15px] leading-relaxed text-ink-soft">{body}</p>
      {children && <div className="mt-6 flex w-full flex-col gap-3">{children}</div>}
    </section>
  )
}
