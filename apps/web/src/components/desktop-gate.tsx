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

          <button
            type="button"
            onClick={() => setDesktopApp(true)}
            className="group mt-7 inline-flex h-[54px] items-center gap-2 rounded-full bg-moss px-8 text-[17px] font-semibold text-paper-raised shadow-[0_14px_30px_-12px_rgba(58,80,31,0.7)] transition-colors hover:bg-moss-deep"
          >
            Open Quest
            <ArrowRight className="h-[18px] w-[18px] transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} aria-hidden />
          </button>
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

          <div className="landing-card landing-card-left">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-moss-pale text-moss-deep">
              <Check className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <p className="tabular truncate text-[16px] font-semibold leading-snug">Paid 51.25 QUEST</p>
              <p className="mt-0.5 truncate text-[13px] leading-snug text-ink-soft">Juggle three eggs for 30 seconds</p>
            </div>
          </div>

          <div className="landing-card landing-card-right">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-night text-paper-raised">
              <Play className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold leading-snug">Review Mara’s video</p>
              <p className="mt-0.5 truncate text-[13px] leading-snug text-ink-soft">Approves itself in 22 h</p>
            </div>
          </div>
        </div>
      </div>

      <button type="button" onClick={() => setDesktopApp(false)} className="desktop-back">
        <ChevronLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        Home
      </button>
    </>
  )
}

const SAMPLE = [
  { reward: '500', pill: '6h left', soon: true, dare: 'Juggle three eggs for 30 seconds without dropping one.', who: 'Dev', ago: '2h ago' },
  { reward: '120', pill: '3 days', soon: false, dare: 'Order a coffee entirely in song, start to finish.', who: 'Mara', ago: '5h ago' },
  { reward: '75', pill: '5 days', soon: false, dare: 'Read tomorrow’s weather like a sports commentator.', who: 'Inés', ago: '1d ago' },
  { reward: '300', pill: 'No limit', soon: false, dare: 'Parallel park in one move, filmed from the kerb.', who: 'Tobi', ago: '2d ago' },
  { reward: '60', pill: '2 days', soon: false, dare: 'Teach your dog a new trick and show it twice.', who: 'June', ago: '3d ago' },
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
          <li key={q.dare} className="rounded-[16px] bg-paper-raised p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="leading-none">
                <span className="tabular font-display text-[26px] text-moss">{q.reward}</span>{' '}
                <span className="text-[12px] font-semibold tracking-wide text-ink-soft">QUEST</span>
              </p>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold leading-none ${
                  q.soon ? 'bg-[#F3E3C4] text-[#6E4310]' : 'bg-ink/[0.06] text-ink-soft'
                }`}
              >
                {q.pill}
              </span>
            </div>
            <p className="mt-2.5 text-[17px] leading-snug">{q.dare}</p>
            <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-soft">
              <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-moss-pale font-display text-[10px] text-moss">
                {q.who.charAt(0)}
              </span>
              {q.who} · posted {q.ago}
            </p>
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
