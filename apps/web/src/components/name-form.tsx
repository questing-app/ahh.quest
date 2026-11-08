'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/lib/session'
import { errorMessage } from '@/lib/api'
import type { User } from '@/lib/types'
import { hasDefaultName } from '@/lib/types'
import { button } from './button'

const NAME_PATTERN = /^[a-zA-Z0-9._]{3,30}$/

export function NameForm({ user, onDone, submitLabel = 'Save' }: { user: User; onDone?: () => void; submitLabel?: string }) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [name, setName] = useState(hasDefaultName(user) ? '' : user.username)
  const valid = NAME_PATTERN.test(name)

  const save = useMutation({
    mutationFn: () => api<User>('/api/users/me', { method: 'PATCH', json: { username: name } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['me'], updated)
      onDone?.()
    },
  })

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
          className="min-w-0 flex-1 rounded-md border border-rule bg-paper-raised px-4 py-2.5 text-[17px] focus:border-moss focus:outline-none"
        />
        <button type="submit" disabled={!valid || save.isPending} className={button('primary', 'sm')}>
          {save.isPending ? 'Saving…' : submitLabel}
        </button>
      </div>
      <p className={`mt-2 text-sm ${save.error ? 'text-wax' : 'text-ink-soft'}`}>
        {save.error ? errorMessage(save.error) : '3 to 30 letters, numbers, dots or underscores.'}
      </p>
    </form>
  )
}
