'use client'

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { apiFetch } from './api'
import { useSolanaWallets } from '@privy-io/react-auth/solana'
import { useSession } from './session'
import type { MyFeed, Quest, QuestClaim, User } from './types'

const PAGE_SIZE = 20

export function useFeed() {
  return useInfiniteQuery({
    queryKey: ['feed'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => apiFetch<Quest[]>(`/api/feed?limit=${PAGE_SIZE}&offset=${pageParam}`),
    getNextPageParam: (last, pages) => (last.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined),
  })
}

export function useQuest(id: string) {
  return useQuery({
    queryKey: ['quest', id],
    queryFn: () => apiFetch<Quest>(`/api/quests/${id}`),
  })
}

export function useQuestClaims(id: string) {
  const { token, ready } = useSession()
  return useQuery({
    // Proof visibility depends on who is asking, so signed-in and
    // signed-out responses are cached separately.
    queryKey: ['quest', id, 'claims', Boolean(token)],
    queryFn: () => apiFetch<QuestClaim[]>(`/api/quests/${id}/claims`, { token }),
    enabled: ready,
  })
}

export function useMe() {
  const { token } = useSession()
  // A new email login gets its embedded wallet a moment after sign-in; the API
  // can't create the account until it exists, so ask again when it appears.
  const { wallets } = useSolanaWallets()
  return useQuery({
    queryKey: ['me', wallets.length],
    queryFn: () => apiFetch<User>('/api/users/me', { token }),
    enabled: Boolean(token),
  })
}

export function useMyFeed() {
  const { token } = useSession()
  return useQuery({
    queryKey: ['mine'],
    queryFn: () => apiFetch<MyFeed>('/api/feed/mine', { token }),
    enabled: Boolean(token),
  })
}

export function useUser(pubkey: string) {
  return useQuery({
    queryKey: ['user', pubkey],
    queryFn: () => apiFetch<User>(`/api/users/${pubkey}`),
  })
}

export function useQuestsBy(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['quests', 'by', creatorId],
    queryFn: () => apiFetch<Quest[]>(`/api/quests?creator=${creatorId}&limit=50`),
    enabled: Boolean(creatorId),
  })
}
