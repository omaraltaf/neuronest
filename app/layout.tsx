import type { Metadata } from 'next'
import { Nunito } from 'next/font/google'
import './globals.css'

// Direction B — "Fjord & Marigold" (design tokens in tailwind.config.js, rationale in
// CLAUDE.md §8). One rounded family at many weights does everything: friendly at
// 800-900, perfectly legible at 400. Loaded properly via next/font — the app
// previously *declared* Inter in CSS but never loaded it, so users saw system fonts.
const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'NeuroNest — Personalised ASD Support',
  description: 'A personalised guide for every child\'s journey.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body>{children}</body>
    </html>
  )
}
