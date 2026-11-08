import type { Config } from 'tailwindcss'

// Palette taken from the iOS onboarding screens (product/screens.png):
// parchment ground, moss-green headings, warm dark ink.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#F7F1E3', raised: '#FCF9F1', sunk: '#EFE6D2' },
        ink: { DEFAULT: '#26261F', soft: '#5F5B4E' },
        rule: '#E2D7BE',
        moss: { DEFAULT: '#4B6629', deep: '#3A501F', pale: '#E4E8D2' },
        wax: '#9C3B26',
        night: '#151510',
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      maxWidth: {
        page: '1120px',
      },
    },
  },
  plugins: [],
}

export default config
