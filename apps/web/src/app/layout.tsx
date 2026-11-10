import type { Metadata, Viewport } from 'next'
import { Caprasimo } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { TabBar } from '@/components/tab-bar'
import { DesktopGate } from '@/components/desktop-gate'
import { DESKTOP_KEY } from '@/lib/desktop'
import { InstallSheet } from '@/components/install-sheet'
import { Toaster } from '@/components/toast'
import { PullToRefresh } from '@/components/pull-to-refresh'
import { OfflineBanner } from '@/components/offline-banner'

const display = Caprasimo({
  subsets: ['latin'],
  weight: '400',
  adjustFontFallback: false,
  variable: '--font-display',
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
  appleWebApp: {
    capable: true,
    title: 'Quest',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#F7F1E3',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

const DESKTOP_MODE = `try{if(localStorage.getItem('${DESKTOP_KEY}')==='app')document.documentElement.dataset.desktop='app'}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The script below sets data-desktop before React hydrates.
    <html lang="en" className={display.variable} suppressHydrationWarning>
      <body className="min-h-[100dvh] bg-paper text-ink antialiased">
        {/* A computer that has opened the app before goes straight to the app, with no flash of the landing page. */}
        <script dangerouslySetInnerHTML={{ __html: DESKTOP_MODE }} />
        <DesktopGate />
        {/* On a computer this is the phone-width column the app lives in; on a phone it does nothing. */}
        <div id="app-frame" className="app-frame">
          <div className="app-root">
            <Providers>
              {children}
              <TabBar />
              <InstallSheet />
              <Toaster />
              <PullToRefresh />
              <OfflineBanner />
            </Providers>
          </div>
        </div>
      </body>
    </html>
  )
}
