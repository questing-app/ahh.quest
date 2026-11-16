'use client'

import { useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { Check } from 'lucide-react'
import { button } from '@/components/button'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

type Field = 'name' | 'xHandle' | 'tgHandle' | 'wallet' | 'whyTest' | 'howUse'
type Values = Record<Field, string>

const EMPTY: Values = { name: '', xHandle: '', tgHandle: '', wallet: '', whyTest: '', howUse: '' }

const stripAt = (s: string) => s.trim().replace(/^@/, '')

function isWallet(s: string) {
  try {
    return new PublicKey(s).toBase58() === s
  } catch {
    return false
  }
}

/** The same rules the API applies, so most mistakes show before sending. */
function check(field: Field, raw: string): string | null {
  const v = raw.trim()
  switch (field) {
    case 'name':
      return !v ? 'Enter your name' : v.length > 80 ? '80 characters at most' : null
    case 'xHandle':
      return /^[A-Za-z0-9_]{1,15}$/.test(stripAt(v)) ? null : 'Letters, numbers and _ only, up to 15'
    case 'tgHandle':
      return !v || /^[A-Za-z0-9_]{5,32}$/.test(stripAt(v)) ? null : 'Letters, numbers and _ only, 5 to 32'
    case 'wallet':
      return isWallet(v) ? null : 'Paste a Solana wallet address'
    case 'whyTest':
    case 'howUse':
      return v.length < 10 ? 'At least 10 characters' : v.length > 1000 ? '1000 characters at most' : null
  }
}

const FIELDS: { id: Field; label: string; hint?: string; placeholder: string; long?: boolean; optional?: boolean }[] = [
  { id: 'name', label: 'Name', placeholder: 'What should we call you?' },
  { id: 'xHandle', label: 'X handle', placeholder: '@yourhandle' },
  { id: 'tgHandle', label: 'Telegram handle', placeholder: '@yourhandle', optional: true },
  { id: 'wallet', label: 'Solana wallet', hint: 'Where your test rewards would go.', placeholder: 'Wallet address' },
  { id: 'whyTest', label: 'Why do you want to test Quest?', placeholder: 'A sentence or two is plenty.', long: true },
  { id: 'howUse', label: 'How would you use it?', placeholder: 'Dares you’d post, who you’d dare, that kind of thing.', long: true },
]

export default function BetaPage() {
  const [values, setValues] = useState<Values>(EMPTY)
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({})
  const [honeypot, setHoneypot] = useState('')
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [done, setDone] = useState<null | { already: boolean }>(null)

  const errorFor = (f: Field) => serverErrors[f] ?? (touched[f] ? check(f, values[f]) : null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched({ name: true, xHandle: true, tgHandle: true, wallet: true, whyTest: true, howUse: true })
    setFormError(null)
    if (FIELDS.some((f) => check(f.id, values[f.id]))) return
    setSending(true)
    try {
      const res = await fetch(`${API_URL}/api/beta-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          xHandle: stripAt(values.xHandle),
          tgHandle: stripAt(values.tgHandle) || undefined,
          wallet: values.wallet.trim(),
          whyTest: values.whyTest.trim(),
          howUse: values.howUse.trim(),
          website: honeypot || undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setDone({ already: Boolean(data?.already) })
        return
      }
      if (data?.fields) setServerErrors(data.fields)
      setFormError(data?.error ?? 'That didn’t go through. Try again.')
    } catch {
      setFormError('Couldn’t reach Quest. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="chrome mx-auto min-h-[100dvh] w-full max-w-[560px] px-5 pb-[calc(env(safe-area-inset-bottom)+40px)] pt-[calc(env(safe-area-inset-top)+20px)]">
      <a href="/" className="inline-block rounded-full bg-paper-raised px-4 pb-[9px] pt-[7px] font-display text-[22px] leading-none text-moss">
        Quest
      </a>

      {done ? (
        <section className="mt-16 text-center" aria-live="polite">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-moss text-paper-raised">
            <Check className="h-8 w-8" strokeWidth={3} aria-hidden />
          </span>
          <h1 className="mt-6 font-display text-[34px] leading-tight">
            {done.already ? 'You’re already on the list' : 'You’re on the list'}
          </h1>
          <p className="mx-auto mt-3 max-w-[22rem] text-[17px] leading-relaxed text-ink-soft">
            {done.already
              ? 'That wallet has already asked for access. We’ll be in touch.'
              : 'Thanks for asking. We’ll reach out on X or Telegram when a spot opens.'}
          </p>
          <a href="/" className={`${button()} mt-8 w-full`}>
            Back to Quest
          </a>
        </section>
      ) : (
        <>
          <h1 className="mt-8 font-display text-[clamp(32px,6vw,44px)] leading-[1.05]">Request beta access</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-ink-soft">
            Quest is opening to a small group first. Tell us a bit about you and we’ll let you know when you’re in.
          </p>

          <form onSubmit={submit} noValidate className="mt-8 space-y-5">
            {FIELDS.map((f) => {
              const error = errorFor(f.id)
              const inputClass = `w-full rounded-[12px] border bg-paper-raised px-4 text-[17px] placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-moss/40 ${
                error ? 'border-wax' : 'border-rule'
              }`
              const common = {
                id: f.id,
                name: f.id,
                value: values[f.id],
                placeholder: f.placeholder,
                'aria-invalid': Boolean(error),
                'aria-describedby': error ? `${f.id}-error` : f.hint ? `${f.id}-hint` : undefined,
                onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                  setValues((v) => ({ ...v, [f.id]: e.target.value }))
                  setServerErrors((s) => ({ ...s, [f.id]: undefined }))
                },
                onBlur: () => setTouched((t) => ({ ...t, [f.id]: true })),
              }
              return (
                <div key={f.id}>
                  <label htmlFor={f.id} className="flex items-baseline justify-between text-[15px] font-semibold">
                    {f.label}
                    {f.optional && <span className="text-[13px] font-normal text-ink-soft">Optional</span>}
                  </label>
                  {f.hint && (
                    <p id={`${f.id}-hint`} className="mt-0.5 text-[13px] text-ink-soft">
                      {f.hint}
                    </p>
                  )}
                  <div className="mt-1.5">
                    {f.long ? (
                      <textarea {...common} rows={4} maxLength={1000} className={`${inputClass} block resize-y py-3 leading-snug`} />
                    ) : (
                      <input
                        {...common}
                        type="text"
                        autoComplete={f.id === 'name' ? 'name' : 'off'}
                        autoCapitalize={f.id === 'name' ? 'words' : 'none'}
                        spellCheck={false}
                        className={`${inputClass} h-[50px]`}
                      />
                    )}
                  </div>
                  {error && (
                    <p id={`${f.id}-error`} className="mt-1.5 text-[14px] text-wax">
                      {error}
                    </p>
                  )}
                </div>
              )
            })}

            {/* Left empty by people; bots fill it in. */}
            <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="website">Website</label>
              <input id="website" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </div>

            {formError && (
              <p role="alert" className="rounded-[12px] bg-wax/10 px-4 py-3 text-[15px] text-wax">
                {formError}
              </p>
            )}

            <button type="submit" disabled={sending} className={`${button()} w-full`}>
              {sending ? 'Sending…' : 'Request access'}
            </button>
          </form>
        </>
      )}
    </main>
  )
}
