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
    <div className="desktop-gate min-h-screen flex-col bg-paper">
      <header className="mx-auto flex h-20 w-full max-w-[1040px] items-center px-10">
        <span className="font-display text-[30px] leading-none text-moss">Quest</span>
      </header>

      <main className="mx-auto grid w-full max-w-[1040px] flex-1 grid-cols-[minmax(0,1fr)_400px] items-center gap-16 px-10 pb-20">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Phone only</p>
          <h1 className="mt-4 font-display text-[60px] leading-[1.02] text-moss">
            Quests happen
            <br />
            out there.
          </h1>
          <p className="mt-6 max-w-[30rem] text-[18px] leading-relaxed text-ink-soft">
            You film the proof on your phone’s camera, so Quest only runs on a phone. Point your camera at the
            code to open it there.
          </p>

          <div className="mt-10 flex items-center gap-6">
            <div className="h-[132px] w-[132px] rounded-[14px] border border-rule bg-paper-raised p-3">
              {qr ? (
                <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
              ) : (
                <div className="h-full w-full rounded-md bg-paper-sunk" />
              )}
            </div>
            <div className="text-[15px] leading-relaxed text-ink-soft">
              <p className="font-semibold text-ink">Scan with your iPhone camera</p>
              <p>or type {url || 'this address'} into Safari.</p>
              <p className="mt-3 text-sm">Tip: Share → Add to Home Screen to keep it like an app.</p>
            </div>
          </div>
        </div>

        <Image
          src="/art/complete.png"
          alt="A knight hands a glowing coin to a wizard beside an open chest of gold"
          width={390}
          height={360}
          priority
          className="art-fade w-full"
        />
      </main>
    </div>
  )
}
