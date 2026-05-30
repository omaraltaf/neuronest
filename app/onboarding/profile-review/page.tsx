'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PROFILE_AGENT_PROMPT, buildChildContext } from '@/lib/agents/prompts'
import type { Child, IntakeSession } from '@/types'

interface ProfileSection {
  key: string
  title: string
  icon: string
  color: string
  content: string | null
  confirmed: boolean
}

function ProfileContent() {
  const router = useRouter()
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const sessionId = params.get('session') || ''
  const supabase = createClient()

  const [child, setChild] = useState<Child | null>(null)
  const [generating, setGenerating] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [sections, setSections] = useState<ProfileSection[]>([])
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [allConfirmed, setAllConfirmed] = useState(false)

  useEffect(() => {
    if (!childId) return
    const load = async () => {
      const { data: childData } = await supabase.from('children')
        .select('*').eq('id', childId).single()
      if (!childData) return
      setChild(childData as Child)

      // Check if profile already exists
      const { data: existingProfile } = await supabase.from('child_profiles')
        .select('*').eq('child_id', childId).eq('is_current', true).maybeSingle()

      if (existingProfile) {
        setProfileId(existingProfile.id)
        buildSections(existingProfile.profile_data)
        return
      }

      // Generate profile
      generateProfile(childData as Child)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId])

  const generateProfile = async (childData: Child) => {
    setGenerating(true)
    const { data: session } = await supabase.from('intake_sessions')
      .select('*').eq('id', sessionId).maybeSingle()

    const childContext = buildChildContext({
      child: childData as unknown as Record<string, unknown>,
    })

    const intakeData = session
      ? `\n\nINTAKE INTERVIEW DATA:\nDomain Confidence: ${JSON.stringify(session.domain_confidence)}\nConversation summary: ${(session.messages as { content: string }[]).slice(-10).map((m: { content: string }) => m.content).join('\n\n')}`
      : ''

    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        childContext: childContext + intakeData,
        childName: childData.name,
      }),
    })
    const { profile } = await res.json()

    // Save to DB
    const { data: { user } } = await supabase.auth.getUser()
    const { data: savedProfile } = await supabase.from('child_profiles').insert({
      child_id: childId,
      user_id: user!.id,
      version: 1,
      profile_data: profile,
      root_causes: profile.root_causes || null,
      strength_map: profile.strength_map || null,
      priority_matrix: profile.priority_matrix || null,
      hypotheses: profile.hypotheses || null,
      is_current: true,
    }).select().single()

    if (savedProfile) setProfileId(savedProfile.id)
    buildSections(profile)
    setGenerating(false)
  }

  const buildSections = (profile: Record<string, unknown>) => {
    const sectionDefs = [
      { key: 'snapshot', title: `${child?.name || 'Your child'} — Overview`, icon: '🌟', color: '#7C3AED' },
      { key: 'communication', title: 'Communication Profile', icon: '💬', color: '#E8635A' },
      { key: 'social', title: 'Social Profile', icon: '🤝', color: '#5B7FE8' },
      { key: 'sensory', title: 'Sensory Profile', icon: '🌀', color: '#7C3AED' },
      { key: 'behaviour', title: 'Behaviour & Regulation', icon: '⚖️', color: '#D97706' },
      { key: 'cognition', title: 'Cognitive Profile', icon: '🧩', color: '#0891B2' },
      { key: 'motor', title: 'Motor Profile', icon: '🏃', color: '#16A34A' },
      { key: 'strengths', title: 'Strength Map', icon: '💪', color: '#059669' },
      { key: 'family_context', title: 'Family Context', icon: '🏠', color: '#DB2777' },
      { key: 'priority_matrix', title: 'Priority Areas', icon: '🎯', color: '#E8635A' },
    ]

    setSections(sectionDefs.map(def => ({
      ...def,
      content: typeof profile[def.key] === 'string'
        ? profile[def.key] as string
        : JSON.stringify(profile[def.key], null, 2),
      confirmed: false,
    })))
    setExpandedSection('snapshot')
  }

  const confirmSection = (key: string) => {
    setSections(prev => {
      const updated = prev.map(s => s.key === key ? { ...s, confirmed: true } : s)
      setAllConfirmed(updated.every(s => s.confirmed))
      return updated
    })
    // Auto-expand next unconfirmed section
    const idx = sections.findIndex(s => s.key === key)
    const next = sections.slice(idx + 1).find(s => !s.confirmed)
    if (next) setExpandedSection(next.key)
  }

  const proceedToPlan = async () => {
    setSaving(true)
    await supabase.from('child_profiles')
      .update({ parent_confirmed: true, confirmed_at: new Date().toISOString() })
      .eq('id', profileId)
    await supabase.from('app_state')
      .update({ profile_confirmed: true, current_phase: 'plan_generation', updated_at: new Date().toISOString() })
      .eq('child_id', childId)
    router.push(`/onboarding/plan?child=${childId}&profile=${profileId}`)
  }

  if (generating) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <div className="text-4xl mb-4 animate-pulse">🧩</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Building {child?.name}&apos;s profile…</h2>
        <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
          Dr. Okafor is synthesising everything from the interview into a comprehensive profile — including root cause analysis and a strength map. This takes about a minute.
        </p>
        <div className="mt-6 flex justify-center gap-1.5">
          <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
        <h1 className="text-xl font-black text-gray-900 mb-1">Review {child?.name}&apos;s profile</h1>
        <p className="text-sm text-gray-500">
          Dr. Okafor has synthesised everything into a profile. Please review each section — if something doesn&apos;t feel right, add a note and we&apos;ll revise.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all"
              style={{ width: `${(sections.filter(s => s.confirmed).length / sections.length) * 100}%` }} />
          </div>
          <span className="text-xs text-gray-500 font-medium">
            {sections.filter(s => s.confirmed).length}/{sections.length} confirmed
          </span>
        </div>
      </div>

      {sections.map(section => (
        <div key={section.key}
          className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${section.confirmed ? 'border-emerald-200' : 'border-gray-100'}`}>
          <button
            className="w-full px-5 py-4 flex items-center gap-3 text-left"
            onClick={() => setExpandedSection(expandedSection === section.key ? null : section.key)}
          >
            <span className="text-xl flex-shrink-0">{section.icon}</span>
            <div className="flex-1">
              <div className="font-bold text-sm text-gray-900">{section.title}</div>
            </div>
            <div className="flex items-center gap-2">
              {section.confirmed && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Confirmed</span>}
              <span className="text-gray-300">{expandedSection === section.key ? '▲' : '▼'}</span>
            </div>
          </button>

          {expandedSection === section.key && (
            <div className="px-5 pb-5 border-t border-gray-50">
              <div className="mt-4 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-xl p-4">
                {section.content}
              </div>

              {!section.confirmed && (
                <div className="mt-4 space-y-3">
                  <textarea
                    value={feedback[section.key] || ''}
                    onChange={e => setFeedback(f => ({ ...f, [section.key]: e.target.value }))}
                    placeholder="Does this feel accurate? Add any corrections or missing details here…"
                    rows={2}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => confirmSection(section.key)}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition">
                      ✓ This is accurate
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {allConfirmed && (
        <button onClick={proceedToPlan} disabled={saving}
          className="w-full py-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-black rounded-2xl text-sm transition shadow-md shadow-violet-200 mt-2">
          {saving ? 'Saving…' : `Build ${child?.name}'s intervention plan →`}
        </button>
      )}
    </div>
  )
}

export default function ProfileReviewPage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-gray-400 text-sm">Loading…</div>}>
      <ProfileContent />
    </Suspense>
  )
}
