import Link from 'next/link'
import { button } from '@/components/button'

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-8 text-center">
      <p className="font-display text-[28px] leading-none text-moss">Quest</p>
      <h1 className="mt-8 font-display text-[32px] leading-tight">This page wandered off.</h1>
      <Link href="/" className={`${button()} mt-8 w-full max-w-[320px]`}>
        Back to quests
      </Link>
    </main>
  )
}
