'use client'

import { useRouter } from 'next/navigation'
import { CLUSTER } from '@/lib/chain'
import { questList } from './quest-row'

/**
 * Sample dares shown while the board has few real quests, so a new feed isn't
 * a blank page. They are not quests: no page, no reward, nothing to claim.
 * The only action starts a real quest with the same text.
 *
 * NEXT_PUBLIC_FEED_PLACEHOLDERS=on|off; unset means on for mainnet only.
 */
const FLAG = process.env.NEXT_PUBLIC_FEED_PLACEHOLDERS
export const examplesEnabled = FLAG ? FLAG === 'on' || FLAG === 'true' : CLUSTER === 'mainnet-beta'

/** Below this many real quests, examples fill in after them. */
export const EXAMPLES_BELOW = 3

const DRAFT_KEY = 'quest.post.draft'

const EXAMPLES: { art: string; text: string }[] = [
  { art: 'dog', text: 'Walk around all day like a dog. On all fours, in public.' },
  { art: 'pepper', text: "Eat the world's hottest pepper. No milk for 5 minutes." },
  { art: 'clown', text: 'Wear full clown makeup all day. Work included.' },
  { art: 'wheelie', text: "Do a wheelie on a kid's bike in front of a cop." },
  { art: 'beans', text: 'Sit in a bathtub full of baked beans for 10 minutes.' },
  { art: 'hotdog', text: 'Wear a hot dog costume all day. Work, gym, everything.' },
  { art: 'pie', text: 'Stand downtown with a PIE ME sign. Take five pies to the face.' },
  { art: 'cannon', text: 'Cannonball into a pool in a full suit.' },
  { art: 'mattress', text: 'Take a mattress on the bus.' },
  { art: 'pink', text: 'Dye your hair hot pink. Keep it for a week.' },
]

const pill = 'shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none'

export function ExampleQuests({ withHeading }: { withHeading: boolean }) {
  const router = useRouter()

  function postLikeThis(text: string) {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}')
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, description: text }))
    } catch {
      // Private mode: they start from a blank quest.
    }
    router.push('/post')
  }

  return (
    <section aria-labelledby="examples-heading" className="pt-2">
      <div className="px-4 pb-3">
        <h2 id="examples-heading" className="font-display text-[22px] leading-tight">
          {withHeading ? 'Nothing is open yet' : 'Need ideas?'}
        </h2>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">
          These are examples, not live quests. Post one and yours is the first people see.
        </p>
      </div>
      <ul className={questList}>
        {EXAMPLES.map((ex) => (
          <li key={ex.art} aria-label={`Example: ${ex.text}`} className="overflow-hidden rounded-[16px] bg-paper-raised">
            <div className="relative aspect-[3/2] bg-paper-sunk">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/art/examples/${ex.art}.webp`}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute right-3 top-3 flex">
                <span className={`${pill} bg-ink text-paper-raised`}>Example</span>
              </div>
            </div>
            <div className="px-4 pb-4 pt-3">
              <p className="line-clamp-2 text-[17px] leading-snug">{ex.text}</p>
              <button
                type="button"
                onClick={() => postLikeThis(ex.text)}
                className="press -mb-2 -ml-1 mt-1 h-11 px-1 text-[15px] font-medium text-moss"
              >
                Post a dare like this
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
