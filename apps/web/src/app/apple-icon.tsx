import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

// Home-screen icon: the wordmark's Q on moss, like the app's headings.
export default async function AppleIcon() {
  const font = await readFile(join(process.cwd(), 'src/assets/Caprasimo-Regular.ttf'))
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#4B6629',
          color: '#FCF9F1',
          fontFamily: 'Caprasimo',
          fontSize: 128,
          paddingBottom: 12,
        }}
      >
        Q
      </div>
    ),
    { ...size, fonts: [{ name: 'Caprasimo', data: font, style: 'normal', weight: 400 }] },
  )
}
