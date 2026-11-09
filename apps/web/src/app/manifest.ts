import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Quest',
    short_name: 'Quest',
    description: 'Post a dare with a reward. Whoever films it and gets approved takes the money.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F1E3',
    theme_color: '#F7F1E3',
    icons: [{ src: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  }
}
