'use client'

import { useRef } from 'react'
import { Camera } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/lib/session'
import { errorMessage } from '@/lib/api'
import type { User } from '@/lib/types'
import { Avatar } from './avatar'
import { toast } from './toast'

const SIDE = 320

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('We couldn’t read that photo. Try another one.'))
    }
    img.src = url
  })
}

/** Crops to the middle square and shrinks it, so uploads stay around 30 KB. */
async function squareJpeg(file: File): Promise<Blob> {
  const img = await load(file)
  try {
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SIDE
    const ctx = canvas.getContext('2d')
    if (!ctx || side === 0) throw new Error('We couldn’t read that photo. Try another one.')
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIDE, SIDE)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('We couldn’t read that photo. Try another one.'))),
        'image/jpeg',
        0.86,
      ),
    )
  } finally {
    URL.revokeObjectURL(img.src)
  }
}

/** The avatar as a button: tap it to pick a photo from the phone. */
export function PhotoPicker({
  user,
  size = 84,
  caption = false,
  removable = false,
  inline = false,
  ring = 'ring-paper-raised',
}: {
  user: User
  size?: number
  /** Show the "Add a photo" link under the avatar. */
  caption?: boolean
  removable?: boolean
  /** Photo on the left with the link beside it, instead of a centred column. */
  inline?: boolean
  /** Matches the badge's outline to whatever the avatar sits on. */
  ring?: string
}) {
  const api = useApi()
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)

  const saved = (updated: User, message: string) => {
    queryClient.setQueriesData({ queryKey: ['me'] }, updated)
    // Quests and attempts carry a copy of the photo.
    queryClient.invalidateQueries({ queryKey: ['feed'] })
    queryClient.invalidateQueries({ queryKey: ['quest'] })
    queryClient.invalidateQueries({ queryKey: ['mine'] })
    toast(message)
  }
  const upload = useMutation({
    mutationFn: async (file: File) =>
      api<User>('/api/users/me/avatar', { body: await squareJpeg(file), headers: { 'Content-Type': 'image/jpeg' } }),
    onSuccess: (updated) => saved(updated, 'Photo saved'),
  })
  const remove = useMutation({
    mutationFn: () => api<User>('/api/users/me', { method: 'PATCH', json: { avatarUrl: null } }),
    onSuccess: (updated) => saved(updated, 'Photo removed'),
  })

  const busy = upload.isPending || remove.isPending
  const error = upload.error ?? remove.error
  const pick = () => input.current?.click()

  return (
    <div className={inline ? 'flex flex-wrap items-center gap-x-3.5' : 'flex flex-col items-center'}>
      <button
        type="button"
        onClick={pick}
        disabled={busy}
        aria-label={user.avatarUrl ? 'Change your photo' : 'Add a photo'}
        className="press relative rounded-full"
      >
        <span className={`block transition-opacity ${upload.isPending ? 'opacity-50' : ''}`}>
          <Avatar person={user} size={size} />
        </span>
        <span
          aria-hidden
          className={`absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-moss text-paper-raised ring-2 ${ring}`}
        >
          <Camera className="h-[15px] w-[15px]" strokeWidth={2.25} />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Clear it so picking the same photo twice still fires.
          e.target.value = ''
          if (file) upload.mutate(file)
        }}
      />
      {caption && (
        <button type="button" onClick={pick} disabled={busy} className="press h-11 px-3 text-[15px] text-moss">
          {upload.isPending ? 'Saving photo…' : user.avatarUrl ? 'Change photo' : 'Add a photo'}
        </button>
      )}
      {removable && user.avatarUrl && (
        <button type="button" onClick={() => remove.mutate()} disabled={busy} className="press h-11 px-3 text-[15px] text-wax">
          {remove.isPending ? 'Removing…' : 'Remove photo'}
        </button>
      )}
      {error && (
        <p role="alert" className={`mt-1 text-[13px] text-wax ${inline ? 'w-full' : 'text-center'}`}>
          {errorMessage(error)}
        </p>
      )}
    </div>
  )
}
