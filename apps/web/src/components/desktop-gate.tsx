'use client'

import { DESKTOP_KEY } from '@/lib/desktop'
import { ArrowRight, Check, ChevronLeft, Compass, Inbox, Play, Plus, Search, UserRound } from 'lucide-react'

function setDesktopApp(on: boolean) {
  if (on) document.documentElement.dataset.desktop = 'app'
  else delete document.documentElement.dataset.desktop
  try {
    if (on) localStorage.setItem(DESKTOP_KEY, 'app')
    else localStorage.removeItem(DESKTOP_KEY)
  } catch {
    // Private mode: the choice lasts until the tab closes.
  }
}

/**
 * What a computer (mouse + hover) sees before the app: the pitch and one way in. The
 * app then runs in a phone-width column. CSS decides which of the two is visible, so
 * there is no flash on load.
 */
export function DesktopGate() {
  return (
    <>
      <div className="desktop-gate landing">
        <header className="relative z-10 flex h-[64px] shrink-0 items-center px-8">
          <span className="rounded-full bg-paper-raised/90 px-[18px] pb-[11px] pt-[9px] font-display text-[26px] leading-none text-moss">
            Quest
          </span>
        </header>

        <main className="relative z-10 mx-auto flex w-full max-w-[760px] shrink-0 flex-col items-center px-8 text-center">
          <h1 className="font-display text-[clamp(40px,4.6vw,64px)] leading-[1.04]">
            Dare someone.
            <br />
            Pay when it’s done.
          </h1>
          <p className="mt-4 max-w-[440px] text-[18px] leading-relaxed text-ink-soft">
            Post a challenge with a reward locked up. Whoever films it and gets approved is paid.
          </p>
        </main>

        <div className="landing-stage" aria-hidden>
          <div className="landing-glow" />
          <div className="landing-phone">
            <div className="landing-phone-shadow" />
            <div className="landing-phone-screen">
              <PhoneScreen />
            </div>
            <div className="landing-phone-frame" />
          </div>
          <div className="landing-ground" />

          {CARDS.map((card) => (
            <div key={card.id} className={`landing-card landing-card-${card.id}`} style={{ background: card.bg, color: card.fg }}>
              {card.art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.art} alt="" className="h-11 w-11 shrink-0 rounded-[10px] object-cover" />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-black/15">
                  {card.icon === 'check' ? (
                    <Check className="h-5 w-5" strokeWidth={2.75} />
                  ) : (
                    <Play className="h-5 w-5" strokeWidth={2.75} />
                  )}
                </span>
              )}
              <div className="min-w-0">
                <p className="tabular truncate text-[16px] font-semibold leading-snug">{card.title}</p>
                <p className="mt-0.5 truncate text-[13px] font-medium leading-snug">{card.sub}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setDesktopApp(true)}
          className="landing-cta group inline-flex h-[80px] items-center gap-3 rounded-full bg-moss px-12 text-[26px] font-bold text-paper-raised"
        >
          Open Quest
          <ArrowRight className="h-[26px] w-[26px] transition-transform group-hover:translate-x-1" strokeWidth={2.75} aria-hidden />
        </button>
      </div>

      <button type="button" onClick={() => setDesktopApp(false)} className="desktop-back">
        <ChevronLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        Home
      </button>
    </>
  )
}

/** Floating cards around the phone. Each colour pair passes WCAG AA for its text. */
const CARDS: { id: string; bg: string; fg: string; title: string; sub: string; art?: string; icon?: 'check' | 'play' }[] = [
  { id: 'l1', bg: '#4A6B2A', fg: '#FFFFFF', icon: 'check', title: 'Paid 1,000 QUEST', sub: 'Shave off one eyebrow' },
  { id: 'l2', bg: '#F2C14E', fg: '#26261F', art: '/art/examples/hotdog.webp', title: 'Hot dog costume all day', sub: '350 QUEST · 2 days left' },
  { id: 'l3', bg: '#8CC7E8', fg: '#26261F', art: '/art/examples/mattress.webp', title: 'Take a mattress on the bus', sub: '250 QUEST · just posted' },
  { id: 'r1', bg: '#26261F', fg: '#FFFFFF', icon: 'play', title: 'Review kelpforest’s video', sub: 'Approves itself in 22 h' },
  { id: 'r2', bg: '#E86F51', fg: '#1F1A17', art: '/art/examples/cannon.webp', title: 'Cannonball in a full suit', sub: '200 QUEST · someone is on it' },
  { id: 'r3', bg: '#F4A6C0', fg: '#26261F', art: '/art/examples/pink.webp', title: 'Dye your hair hot pink', sub: '800 QUEST · paid out' },
]

const SAMPLE = [
  { art: '/art/examples/clown.webp', reward: '400', pill: '6h left', soon: true, dare: 'Wear full clown makeup all day. Work included.', who: 'dustin_', ago: '2h ago' },
  { art: '/art/feed/dog.webp', reward: '600', pill: '3 days', soon: false, dare: 'Walk around all day like a dog. On all fours, in public.', who: 'mara.k', ago: '5h ago' },
  { art: '/art/feed/wheelie.webp', reward: '800', pill: '2 days', soon: false, dare: "Do a wheelie on a kid's bike in front of a cop.", who: 'bigstevo', ago: '1d ago' },
]

const TABS = [
  { label: 'Quests', icon: Compass, active: true },
  { label: 'Activity', icon: Inbox, active: false },
  { label: 'Post', icon: Plus, active: false },
  { label: 'You', icon: UserRound, active: false },
]

/** The Quests tab, drawn with the app's own styles and made-up quests. Not interactive. */
function PhoneScreen() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[44px] bg-paper">
      <div className="flex h-[63px] items-center justify-between px-10 text-[16px] font-semibold">
        <span className="tabular">9:41</span>
        <span className="flex items-center gap-1.5">
          <span className="flex items-end gap-[2px]">
            {[5, 7, 9, 11].map((h) => (
              <span key={h} className="w-[3px] rounded-[1px] bg-ink" style={{ height: h }} />
            ))}
          </span>
          <span className="relative ml-1 h-[12px] w-[25px] rounded-[4px] border border-ink/50 p-[1.5px]">
            <span className="block h-full w-[78%] rounded-[2px] bg-ink" />
          </span>
        </span>
      </div>

      <h2 className="px-4 pb-2 pt-2 font-display text-[34px] leading-[1.1] text-moss">Quests</h2>

      <div className="mx-4 flex h-9 items-center gap-1.5 rounded-[10px] bg-ink/[0.06] px-2 text-[17px] text-ink-soft/80">
        <Search className="h-[18px] w-[18px]" strokeWidth={2.25} />
        Search quests
      </div>
      <div className="mt-3 flex gap-2 px-4 text-[15px] font-medium">
        <span className="flex h-8 items-center rounded-full bg-ink px-3.5 text-paper-raised">All</span>
        <span className="flex h-8 items-center rounded-full bg-ink/[0.06] px-3.5">Ending soon</span>
        <span className="flex h-8 items-center rounded-full bg-ink/[0.06] px-3.5">Biggest</span>
      </div>

      <h3 className="px-8 pb-1.5 pt-5 text-[13px] uppercase tracking-wide text-ink-soft">Open now</h3>
      <ul className="mx-4 space-y-3">
        {SAMPLE.map((q) => (
          <li key={q.dare} className="overflow-hidden rounded-[16px] bg-paper-raised">
            <div className="relative aspect-[3/2] bg-paper-sunk">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={q.art} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <span
                className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none ${
                  q.soon ? 'bg-[#F3E3C4] text-[#6E4310]' : 'bg-paper-raised text-ink'
                }`}
              >
                {q.pill}
              </span>
              <p className="absolute bottom-0 left-0 rounded-tr-[14px] bg-paper-raised pb-0.5 pl-4 pr-3.5 pt-2.5 leading-none">
                <span className="tabular font-display text-[26px] text-moss">{q.reward}</span>{' '}
                <span className="text-[12px] font-semibold tracking-wide text-ink-soft">QUEST</span>
              </p>
            </div>
            <div className="px-4 pb-4 pt-2">
              <p className="text-[17px] leading-snug">{q.dare}</p>
              <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-soft">
                <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-moss-pale font-display text-[10px] text-moss">
                  {q.who.charAt(0).toUpperCase()}
                </span>
                {q.who} · posted {q.ago}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="absolute inset-x-0 bottom-0 border-t-[0.5px] border-ink/15 bg-paper-raised/90 pb-5 backdrop-blur-xl">
        <ul className="flex h-[49px]">
          {TABS.map(({ label, icon: Icon, active }) => (
            <li
              key={label}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                active ? 'text-moss' : 'text-ink-soft/80'
              }`}
            >
              {label === 'Post' ? (
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ink-soft/80 text-paper-raised">
                  <Icon className="h-[18px] w-[18px]" strokeWidth={2.75} />
                </span>
              ) : (
                <Icon className="h-[26px] w-[26px]" strokeWidth={active ? 2.25 : 1.75} />
              )}
              {label}
            </li>
          ))}
        </ul>
        <div className="absolute bottom-2 left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-ink" />
      </div>
    </div>
  )
}
