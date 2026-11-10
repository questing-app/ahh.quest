'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * Shown instead of the app on desktop (mouse + hover). CSS decides which one is
 * visible, so there is no flash on load; this only fills in the QR code.
 */
export function DesktopGate() {
  const [qr, setQr] = useState<string | null>(null)
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const here = window.location.href
    setUrl(window.location.host + (window.location.pathname === '/' ? '' : window.location.pathname))
    QRCode.toString(here, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#26261F', light: '#00000000' },
    }).then(setQr)
  }, [])

  return (
    <div className="desktop-gate min-h-screen items-center justify-center bg-paper-sunk p-10">
      <main className="flex min-h-[475px] w-full max-w-[760px] overflow-hidden rounded-[14px] border-2 border-ink bg-paper-raised">
        <div className="flex flex-1 flex-col justify-center gap-4 p-12 max-[720px]:p-8">
          <span className="font-display text-[22px] leading-none text-moss">Quest</span>
          <h1 className="font-display text-[36px] leading-[1.1]">Quest lives on your phone</h1>
          <p className="max-w-[300px] text-[15px] leading-relaxed text-ink-soft">
            Scan the code with your camera to open it, then add it to your Home Screen.
          </p>
          <div className="h-[140px] w-[140px] rounded-[12px] border border-rule bg-paper p-3">
            {qr ? (
              <div
                role="img"
                aria-label={`QR code for ${url}`}
                className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            ) : (
              <div className="h-full w-full rounded-md bg-paper-sunk" />
            )}
          </div>
          {url && <p className="font-mono text-[13px] text-ink-soft">{url}</p>}
        </div>
        <div className="relative w-[320px] shrink-0 border-l border-rule bg-paper max-[720px]:hidden">
          <Image
            src="/art/wallet.png"
            alt="A wizard points a knight on horseback toward a small chest on a mountain path"
            fill
            sizes="320px"
            priority
            className="object-cover"
          />
        </div>
      </main>
    </div>
  )
}
