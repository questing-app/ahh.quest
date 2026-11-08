import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto max-w-page px-4 py-24 md:px-8">
      <p className="font-display text-[28px] leading-none text-moss">Quest</p>
      <h1 className="mt-10 font-display text-[40px] leading-tight">This page wandered off.</h1>
      <Link href="/" className="mt-6 inline-block text-[17px] font-semibold text-moss underline underline-offset-4">
        Back to open quests
      </Link>
    </main>
  )
}
