'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/lib/session'
import { errorMessage } from '@/lib/api'
import type { User } from '@/lib/types'
import { hasDefaultName } from '@/lib/types'
import { button } from './button'
import { toast } from './toast'

const NAME_PATTERN = /^[a-zA-Z0-9._]{3,30}$/

export function NameForm({
  user,
  onDone,
  onCancel,
  submitLabel = 'Save',
  stacked = false,
}: {
  user: User
  onDone?: () => void
  onCancel?: () => void
  submitLabel?: string
  /** Full-width field with the button underneath, for onboarding. */
  stacked?: boolean
}) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [name, setName] = useState(hasDefaultName(user) ? '' : user.username)
  const valid = NAME_PATTERN.test(name)

  const save = useMutation({
    mutationFn: () => api<User>('/api/users/me', { method: 'PATCH', json: { username: name } }),
    onSuccess: (updated) => {
      queryClient.setQueriesData({ queryKey: ['me'] }, updated)
      toast('Name saved')
      onDone?.()
    },
  })

  if (stacked) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) save.mutate()
        }}
      >
        <label htmlFor="username" className="text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
          Name
        </label>
        <input
          id="username"
          value={name}
          onChange={(e) => setName(e.target.value.trim())}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          placeholder="e.g. sam.sol"
          className="mt-1.5 h-[50px] w-full rounded-[12px] bg-paper-raised px-4 text-[17px] placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-moss/40"
        />
        <p role={save.error ? 'alert' : undefined} className={`mt-2 text-[13px] leading-relaxed ${save.error ? 'text-wax' : 'text-ink-soft'}`}>
          {save.error
            ? errorMessage(save.error)
            : 'Shown on quests you post and videos you send. You can change it any time. 3 to 30 letters, numbers, dots or underscores.'}
        </p>
        <button type="submit" disabled={!valid || save.isPending} className={`${button()} mt-6 w-full`}>
          {save.isPending ? 'Saving…' : submitLabel}
        </button>
      </form>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) save.mutate()
      }}
    >
      <label htmlFor="username" className="text-[15px] font-semibold">
        Name
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="username"
          value={name}
          onChange={(e) => setName(e.target.value.trim())}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="e.g. sam.sol"
          className="h-[44px] min-w-0 flex-1 rounded-[10px] bg-paper-sunk px-3.5 text-[17px] placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-moss/40"
        />
        <button type="submit" disabled={!valid || save.isPending} className={`${button('primary', 'sm')} h-[44px] rounded-[10px]`}>
          {save.isPending ? 'Saving…' : submitLabel}
        </button>
      </div>
      <p role={save.error ? 'alert' : undefined} className={`mt-2 text-[13px] ${save.error ? 'text-wax' : 'text-ink-soft'}`}>
        {save.error ? errorMessage(save.error) : '3 to 30 letters, numbers, dots or underscores.'}
      </p>
      {onCancel && (
        <button type="button" onClick={onCancel} className="press mt-1 h-11 w-full text-center text-[17px] text-moss">
          Cancel
        </button>
      )}
    </form>
  )
}
