import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PERSONAS } from '@/components/PersonaTag'

// "Who you're talking to" — the page every AI chip links to. Deliberately plain and
// short: a parent who taps this is checking something, not browsing.

export const metadata = { title: 'Who you’re talking to · NeuroNest' }

const GUIDES: { id: keyof typeof PERSONAS; what: string; good: string; not: string }[] = [
  {
    id: 'eriksson',
    what: 'Asks about your child, writes their profile, builds the plan, picks each week’s focus, runs your weekly chat, and coaches you after a hard practice session.',
    good: 'Turning what you tell us into a specific, week-by-week plan — and remembering all of it, every time.',
    not: 'Diagnosing, prescribing, or replacing your paediatrician, PPT, BUP or Habiliteringstjenesten.',
  },
  {
    id: 'emma',
    what: 'Makes the materials — communication boards, sentence strips, timetables, flashcards, social stories — from one sentence describing what you need.',
    good: 'Producing a printable, symbol-based material in about a minute, personalised to your child’s interests and language level.',
    not: 'Clinical judgement. Emma makes what the plan asks for; she does not decide what your child should work on.',
  },
  {
    id: 'sunny',
    what: 'Plays with your child in the Child Zone, using the words your child’s goals are targeting.',
    good: 'Keeping practice fun and pressure-free, and never correcting your child.',
    not: 'Supervision. Sunny is a game companion, not a minder.',
  },
]

export default function GuidesPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/dashboard" aria-label="Back"
            className="w-11 h-11 -ml-2 flex items-center justify-center text-gray-500 hover:text-fjord-600 transition">
            <ArrowLeft size={20} strokeWidth={2.2} />
          </Link>
          <div className="font-black text-sm text-gray-900">Who you&apos;re talking to</div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-16">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h1 className="text-lg font-black text-gray-900 leading-snug">
            Your guides are AI, and we want you to know it
          </h1>
          <p className="text-sm text-gray-600 leading-relaxed mt-2">
            NeuroNest has three guides with names and personalities. They are characters —
            software, not people. None of them is a human clinician, none has a caseload or a
            qualification, and none of them has met your child.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed mt-2">
            What they do have is a specific evidence base. Everything they suggest is built on
            published research into <span className="font-bold text-gray-800">Naturalistic
            Developmental Behavioural Interventions</span> — ESDM, PRT and JASPER — the approaches
            with the strongest trial evidence for young autistic children, and the ones designed to
            be delivered by parents in ordinary daily life rather than in a clinic.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed mt-2">
            If you ever ask one of them whether they are a real person, they will tell you the
            truth. If a question needs a human, they will say so and point you to one.
          </p>
        </div>

        {GUIDES.map(g => {
          const p = PERSONAS[g.id]
          return (
            <div key={g.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-black text-gray-900">{p.name}</span>
                <span className="text-sm text-gray-400">{p.role}</span>
                <span className="rounded-full border border-gray-200 px-1.5 py-px text-[0.65rem] font-black text-gray-500">AI</span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed mt-2">{g.what}</p>
              <div className="mt-3 space-y-1.5">
                <p className="text-sm text-gray-600 leading-relaxed">
                  <span className="font-bold text-leaf-700">Good at:</span> {g.good}
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  <span className="font-bold text-clay-600">Not for:</span> {g.not}
                </p>
              </div>
            </div>
          )
        })}

        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="font-black text-sm text-gray-900">When to call a human</div>
          <p className="text-sm text-gray-600 leading-relaxed mt-1.5">
            Anything about diagnosis, medication, regression, safety, or a decision you would want
            written down — that belongs with your paediatrician, PPT, BUP or Habiliteringstjenesten.
            NeuroNest is built for the space between those appointments, not instead of them.
          </p>
        </div>
      </div>
    </div>
  )
}
