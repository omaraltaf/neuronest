import Link from 'next/link'

// The single source of who each persona is, everywhere a parent can see them.
// Single-sourced deliberately: this wording is a promise, and a promise that is
// retyped on seven screens drifts. The prompt-side equivalent is AI_HONESTY in
// lib/agents/prompts.ts — change them together.
//
// Why this exists (2026-08-23): nothing in the app said these are AI. The UI told
// parents Dr. Eriksson "reads your documents", "picks the ONE thing that matters",
// "is thinking about this one" — and the prompts gave her a fabricated CV. A tired
// parent could reasonably believe a human clinician was reviewing their child.

export type PersonaId = 'eriksson' | 'emma' | 'sunny'

export const PERSONAS: Record<PersonaId, { name: string; short: string; role: string }> = {
  eriksson: { name: 'Dr. Lena Eriksson', short: 'Dr. Eriksson', role: 'your guide' },
  emma:     { name: 'Emma Blackwell',    short: 'Emma',         role: 'makes your materials' },
  sunny:    { name: 'Sunny',             short: 'Sunny',        role: 'plays with your child' },
}

// Inline chip — for headers and kickers where a persona is named in passing.
// Colours inherit from the parent so it works on the dark hero and on white cards.
export default function PersonaTag({ persona, full = false, className = '' }: {
  persona: PersonaId
  full?: boolean
  className?: string
}) {
  const p = PERSONAS[persona]
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span>{full ? p.name : p.short} — {p.role}</span>
      <Link href="/guides"
        aria-label={`${p.name} is an AI guide — what that means`}
        className="inline-flex items-center rounded-full border border-current/40 px-1.5 py-px text-[0.65rem] font-black leading-tight opacity-80 hover:opacity-100 transition">
        AI
      </Link>
    </span>
  )
}

// Full sentence — for the places where the relationship is actually formed
// (intake, the weekly chat, the first materials screen). Says it once, properly.
export function PersonaDisclosure({ persona, className = '' }: { persona: PersonaId; className?: string }) {
  const p = PERSONAS[persona]
  return (
    <p className={`text-xs leading-relaxed ${className}`}>
      {p.name} is NeuroNest&apos;s AI guide — not a human clinician, and not a substitute for your
      care team.{' '}
      <Link href="/guides" className="font-bold underline underline-offset-2">What that means</Link>
    </p>
  )
}
