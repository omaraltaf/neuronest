'use client'
import { ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

const STEPS = [
  { num: 1, label: 'Your child',  path: '/onboarding/child-setup' },
  { num: 2, label: 'Documents',   path: '/onboarding/upload' },
  { num: 3, label: 'Interview',   path: '/onboarding/intake' },
  { num: 4, label: 'Profile',     path: '/onboarding/profile-review' },
  { num: 5, label: 'Plan',        path: '/onboarding/plan' },
]

function StepsBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const childId = searchParams.get('child') || ''
  const sessionId = searchParams.get('session') || ''
  const profileId = searchParams.get('profile') || ''

  const currentStep = STEPS.findIndex(s => pathname.startsWith(s.path)) + 1 || 1

  const buildHref = (stepPath: string) => {
    const base = stepPath
    if (!childId) return base
    const p = new URLSearchParams()
    p.set('child', childId)
    if (sessionId && stepPath.includes('profile')) p.set('session', sessionId)
    if (profileId && stepPath.includes('plan')) p.set('profile', profileId)
    return `${base}?${p.toString()}`
  }

  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((step, i) => {
        const done = step.num < currentStep
        const active = step.num === currentStep
        const canNav = done && childId // only navigate back to completed steps
        const href = buildHref(step.path)

        return (
          <div key={step.num} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-shrink-0">
              {canNav ? (
                <Link href={href}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition"
                  style={{ background: '#7C3AED', color: '#fff' }}>
                  ✓
                </Link>
              ) : (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition"
                  style={{
                    background: active ? '#7C3AED' : done ? '#7C3AED' : '#F3F4F6',
                    color: active || done ? '#fff' : '#9CA3AF',
                  }}>
                  {done ? '✓' : step.num}
                </div>
              )}
              <span className={`text-[11px] mt-1 font-medium whitespace-nowrap ${active ? 'text-violet-600' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="h-0.5 flex-1 mx-1 mb-4 rounded-full"
                style={{ background: step.num < currentStep ? '#7C3AED' : '#E5E7EB' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      {/* Header */}
      <header className="border-b border-white/60 bg-white/70 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-base flex-shrink-0">🧠</div>
            <span className="font-black text-gray-900">NeuroNest</span>
            <span className="text-gray-300 mx-1">·</span>
            <span className="text-sm text-gray-500">Getting started</span>
          </div>
          <Link href="/dashboard" className="text-xs text-gray-400 hover:text-violet-600 transition font-medium">
            Go to dashboard →
          </Link>
        </div>
      </header>

      {/* Steps + content */}
      <div className="max-w-2xl mx-auto px-4 py-5">
        <Suspense fallback={
          <div className="flex items-center gap-1 mb-8">
            {STEPS.map((_, i) => (
              <div key={i} className="flex items-center flex-1">
                <div className="w-7 h-7 rounded-full bg-gray-100 flex-shrink-0" />
                {i < STEPS.length - 1 && <div className="h-0.5 flex-1 bg-gray-200 mx-1" />}
              </div>
            ))}
          </div>
        }>
          <StepsBar />
        </Suspense>
        {children}
      </div>
    </div>
  )
}
