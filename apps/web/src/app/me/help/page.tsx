import { NavBar } from '@/components/nav-bar'
import { TAB_BAR_SPACE } from '@/components/tab-bar'
import { SectionHeader, groupedList } from '@/components/notice'

const FEEDBACK_URL = 'https://github.com/questing-app/questing/issues/new'

const ANSWERS: { q: string; a: string }[] = [
  {
    q: 'Where is my money while a quest is open?',
    a: 'The reward sits in a vault on Solana that only the Quest program can move. It goes to whoever completes the quest, or back to you if you cancel, nobody takes it, or the video is rejected.',
  },
  {
    q: 'What does the deposit do?',
    a: 'Taking a quest locks 5% of the reward from your wallet. Send a video that gets approved and it comes back with the reward. Give up, run out of time, or get rejected and the poster keeps it.',
  },
  {
    q: 'Who decides if a video counts?',
    a: 'An AI check compares the video with the exact words of the quest. Clear passes are paid right away and clear misses are rejected. Anything in between goes to the poster, and it approves itself if they don’t answer in time.',
  },
  {
    q: 'What does Quest charge?',
    a: 'A 2.5% fee, taken from the reward when it’s paid out. Posting, cancelling and getting a reward back are free apart from Solana’s own network fee, which is a fraction of a cent.',
  },
  {
    q: 'How long do I get to film?',
    a: '24 hours from the moment you take the quest. Videos run from 15 seconds to a minute.',
  },
  {
    q: 'Can I cancel a quest I posted?',
    a: 'Yes, any time before someone takes it. The whole reward comes back to your wallet.',
  },
]

export default function HelpPage() {
  return (
    <div className={TAB_BAR_SPACE}>
      <NavBar title="Help" back="You" backHref="/me" />
      <main>
        <SectionHeader id="common">Common questions</SectionHeader>
        <dl className={groupedList} aria-labelledby="common">
          {ANSWERS.map(({ q, a }) => (
            <div key={q} className="px-4 py-3">
              <dt className="text-[16px] font-semibold leading-snug">{q}</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-ink-soft">{a}</dd>
            </div>
          ))}
        </dl>

        <SectionHeader id="feedback">Feedback</SectionHeader>
        <ul className={groupedList} aria-labelledby="feedback">
          <li>
            <a
              href={FEEDBACK_URL}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-[46px] items-center justify-between gap-4 px-4 py-2.5 text-[17px] text-moss transition-colors active:bg-paper-sunk"
            >
              Report a problem or suggest something
              <span aria-hidden>↗</span>
            </a>
          </li>
        </ul>
        <p className="px-8 pt-2 text-[13px] leading-relaxed text-ink-soft">
          Opens Quest’s public issue list on GitHub. Don’t include anything private.
        </p>
      </main>
    </div>
  )
}
