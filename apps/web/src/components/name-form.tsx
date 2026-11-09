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
          className="h-[44px] min-w-0 flex-1 rounded-[10px] bg-paper-sunk px-3.5 text-[17px] placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-moss/40"
        />
        <button type="submit" disabled={!valid || save.isPending} className={`${button('primary', 'sm')} h-[44px] rounded-[10px]`}>
          {save.isPending ? 'Saving…' : submitLabel}
        </button>
      </div>
      <p className={`mt-2 text-[13px] ${save.error ? 'text-wax' : 'text-ink-soft'}`}>
        {save.error ? errorMessage(save.error) : '3 to 30 letters, numbers, dots or underscores.'}
      </p>
    </form>
  )
}
