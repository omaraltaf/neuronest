import { ReactNode } from 'react'

const STEPS = [
  { num: 1, label: "Your child" },
  { num: 2, label: "Documents" },
  { num: 3, label: "Interview" },
  { num: 4, label: "Profile" },
  { num: 5, label: "Plan" },
]

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      {/* Header */}
      <header className="border-b border-white/60 bg-white/70 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-base flex-shrink-0">🧠</div>
          <span className="font-black text-gray-900">NeuroNest</span>
          <span className="text-gray-300 mx-1">·</span>
          <span className="text-sm text-gray-500">Getting started</span>
        </div>
      </header>

      {/* Steps */}
      <div className="max-w-2xl mx-auto px-4 py-5">
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((step, i) => (
            <div key={step.num} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-xs font-bold">
                  {step.num}
                </div>
                <span className="text-[9px] text-gray-400 mt-1 font-medium whitespace-nowrap">{step.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="h-0.5 flex-1 bg-gray-200 mx-1 mb-4" />}
            </div>
          ))}
        </div>

        {children}
      </div>
    </div>
  )
}
