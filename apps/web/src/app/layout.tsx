import type { Metadata, Viewport } from 'next'
import { Caprasimo, Public_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const display = Caprasimo({
  subsets: ['latin'],
  weight: '400',
  adjustFontFallback: false,
  variable: '--font-display',
})

const body = Public_Sans({
  subsets: ['latin'],
  variable: '--font-body',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://quest.gg'),
  title: {
    default: 'Quest',
    template: '%s · Quest',
  },
  description: 'Post a dare with a reward. Whoever films it and gets approved takes the money.',
  openGraph: {
    title: 'Quest',
    description: 'Post a dare with a reward. Whoever films it and gets approved takes the money.',
    images: ['/art/complete.png'],
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#F7F1E3',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
