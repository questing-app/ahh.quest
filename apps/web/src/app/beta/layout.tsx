import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Request beta access',
  description: 'Ask to join the Quest beta: post dares with a reward, get paid when they’re done.',
}

export default function BetaLayout({ children }: { children: React.ReactNode }) {
  return children
}
