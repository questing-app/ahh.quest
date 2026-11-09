import Image from 'next/image'
import Link from 'next/link'
import { button } from '@/components/button'

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-8 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center">
      <Image
        src="/art/notfound.jpg"
        alt="A knight holds half of a torn notice while the other half blows away"
        width={780}
        height={650}
        priority
        className="art-fade w-full max-w-[300px]"
      />
      <h1 className="-mt-2 font-display text-[28px] leading-tight">This page wandered off</h1>
      <p className="mt-2 max-w-[20rem] text-[15px] leading-relaxed text-ink-soft">The link may be old or mistyped.</p>
      <Link href="/" className={`${button()} mt-6 w-full max-w-[320px]`}>
        See open quests
      </Link>
    </main>
  )
}
