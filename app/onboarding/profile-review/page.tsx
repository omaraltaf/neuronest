'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buildChildContext } from '@/lib/agents/prompts'
import type { Child, ChildProfile } from '@/types'

interface ProfileSection {
  key: string
  title: string
  icon: string
  color: string
  content: string
  confirmed: boolean
}

function formatSection(key: string, value: unknown): string {
  if (!value) return 'No information available for this section.'
  if (typeof value === 'string') return value

  const v = value as Record<string, unknown>

  if (key === 'priority_matrix' && Array.isArray(value)) {
    return (value as Record<string, unknown>[]).map((item, i) =>
      `${i + 1}. ${item.label || item.area}\n   Why: ${item.rationale || ''}\n   Urgency: ${item.urgency || ''}`
    ).join('\n\n')
  }

  if (key === 'strength_map') {
    const strengths = (v.strengths as Record<string, unknown>[]) || []
    if (!strengths.length) return 'Strength map not yet generated.'
    return strengths.map((s: Record<string, unknown>) =>
      `• ${s.label}\n  ${s.description}\n  How to use: ${s.leverage}`
    ).join('\n\n')
  }

  const parts: string[] = []

  if (v.summary) parts.push(v.summary as string)
  if (v.current_level) parts.push(`Current level: ${v.current_level}`)
  if (v.root_cause) parts.push(`Root cause: ${v.root_cause}`)
  if (v.profile_type) parts.push(`Profile type: ${v.profile_type}`)
  if (v.cognitive_level) parts.push(`Cognitive level: ${v.cognitive_level}`)
  if (v.verbal_nonverbal_gap) parts.push(`Verbal/non-verbal gap: ${v.verbal_nonverbal_gap}`)
  if (v.learning_style) parts.push(`Learning style: ${v.learning_style}`)
  if (v.echolalia_analysis) parts.push(`Echolalia: ${v.echolalia_analysis}`)
  if (v.parental_stress_level) parts.push(`Parent stress level: ${v.parental_stress_level}`)
  if (v.what_works) parts.push(`What works: ${v.what_works}`)

  if (Array.isArray(v.strengths) && v.strengths.length) {
    parts.push(`Strengths:\n${(v.strengths as string[]).map(s => `  • ${s}`).join('\n')}`)
  }
  if (Array.isArray(v.challenges) && v.challenges.length) {
    parts.push(`Challenges:\n${(v.challenges as string[]).map(s => `  • ${s}`).join('\n')}`)
  }
  if (Array.isArray(v.targets) && v.targets.length) {
    parts.push(`Key targets:\n${(v.targets as string[]).map(s => `  • ${s}`).join('\n')}`)
  }
  if (Array.isArray(v.support_factors) && v.support_factors.length) {
    parts.push(`What helps:\n${(v.support_factors as string[]).map(s => `  • ${s}`).join('\n')}`)
  }
  if (Array.isArray(v.complicating_factors) && v.complicating_factors.length) {
    parts.push(`Complicating factors:\n${(v.complicating_factors as string[]).map(s => `  • ${s}`).join('\n')}`)
  }
  if (Array.isArray(v.regulation_strategies) && v.regulation_strategies.length) {
    parts.push(`Regulation strategies:\n${(v.regulation_strategies as string[]).map(s => `  • ${s}`).join('\n')}`)
  }
  if (Array.isArray(v.triggers) && v.triggers.length) {
    parts.push(`Triggers:\n${(v.triggers as string[]).map(s => `  • ${s}`).join('\n')}`)
  }

  return parts.length > 0 ? parts.join('\n\n') : JSON.stringify(value, null, 2)
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

      const { data: existingProfile } = await supabase.from('child_profiles')
        .select('*').eq('child_id', childId).eq('is_current', true).maybeSingle()

      if (existingProfile) {
        setProfileId(existingProfile.id)
        buildSections(existingProfile.profile_data, childData.name)
        return
      }

      generateProfile(childData as Child)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId])

  const buildSections = (profile: Record<string, unknown>, childName?: string) => {
    const name = childName || child?.name || 'Your child'
    const sectionDefs = [
      { key: 'snapshot',        title: `${name} — Overview`,     icon: '🌟', color: '#7C3AED' },
      { key: 'communication',   title: 'Communication Profile',  icon: '💬', color: '#E8635A' },
      { key: 'social',          title: 'Social Profile',         icon: '🤝', color: '#5B7FE8' },
      { key: 'sensory',         title: 'Sensory Profile',        icon: '🌀', color: '#7C3AED' },
      { key: 'behaviour',       title: 'Behaviour & Regulation', icon: '⚖️', color: '#D97706' },
      { key: 'cognition',       title: 'Cognitive Profile',      icon: '🧩', color: '#0891B2' },
      { key: 'motor',           title: 'Motor Profile',          icon: '🏃', color: '#16A34A' },
      { key: 'strength_map',    title: 'Strength Map',           icon: '💪', color: '#059669' },
      { key: 'family_context',  title: 'Family Context',         icon: '🏠', color: '#DB2777' },
      { key: 'priority_matrix', title: 'Priority Areas',         icon: '🎯', color: '#E8635A' },
    ]
    setSections(sectionDefs.map(def => ({
      ...def,
      content: formatSection(def.key, profile[def.key]),
      confirmed: false,
    })))
    setExpandedSection('snapshot')
  }

  // Confirm a section — optionally saves a correction note into the content
  const confirmSection = (key: string, correction?: string) => {
    setSections(prev => {
      const updated = prev.map(s => {
        if (s.key !== key) return s
        return {
          ...s,
          confirmed: true,
          // Append the correction so it's visible and saved to DB
          content: correction?.trim()
            ? `${s.content}\n\nParent correction: ${correction.trim()}`
            : s.content,
        }
      })
      setAllConfirmed(updated.every(s => s.confirmed))
      // Auto-expand next unconfirmed
      const idx = updated.findIndex(s => s.key === key)
      const next = updated.slice(idx + 1).find(s => !s.confirmed)
      if (next) setExpandedSection(next.key)
      else setExpandedSection(null)
      return updated
    })
    // Clear feedback for this section
    setFeedback(f => ({ ...f, [key]: '' }))
  }

  const generateProfile = async (childData: Child) => {
    setGenerating(true)
    const { data: session } = await supabase.from('intake_sessions')
      .select('*').eq('id', sessionId).maybeSingle()

    const childContext = buildChildContext({
      child: childData as unknown as Record<string, unknown>,
    })

    const intakeData = session
      ? `\n\nINTAKE INTERVIEW DATA:\nDomain Confidence: ${JSON.stringify(session.domain_confidence)}\nConversation: ${
          (session.messages as { role: string; content: string }[])
            .slice(-12)
            .map(m => `${m.role}: ${m.content}`)
            .join('\n\n')
        }`
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
    buildSections(profile, childData.name)
    setGenerating(false)
  }

  const proceedToPlan = async () => {
    setSaving(true)

    // Save confirmed sections (with any corrections) back to profile_data
    const updatedProfileData: Record<string, string> = {}
    sections.forEach(s => { updatedProfileData[s.key] = s.content })

    await supabase.from('child_profiles')
      .update({
        parent_confirmed: true,
        confirmed_at: new Date().toISOString(),
        profile_data: updatedProfileData,
      })
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
          Dr. Okafor has synthesised everything into a profile. Review each section — if something is wrong or missing, type a correction and press Save correction.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-violet-500 rounded-full transition-all"
              style={{ width: `${sections.length ? (sections.filter(s => s.confirmed).length / sections.length) * 100 : 0}%` }} />
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
              {section.confirmed && (
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">✓ Confirmed</span>
              )}
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
                  <label className="block text-xs font-semibold text-gray-500">
                    Add a correction or note (optional)
                  </label>
                  <textarea
                    value={feedback[section.key] || ''}
                    onChange={e => setFeedback(f => ({ ...f, [section.key]: e.target.value }))}
                    placeholder="e.g. She actually does make eye contact sometimes, especially with familiar people…"
                    rows={3}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition"
                  />
                  <div className="flex gap-2">
                    {feedback[section.key]?.trim() ? (
                      <>
                        <button
                          onClick={() => confirmSection(section.key, feedback[section.key])}
                          className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm transition">
                          💾 Save correction
                        </button>
                        <button
                          onClick={() => confirmSection(section.key)}
                          className="py-2 px-3 border border-gray-200 text-gray-500 hover:bg-gray-50 font-medium rounded-xl text-sm transition">
                          Discard & confirm
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => confirmSection(section.key)}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition">
                        ✓ This is accurate
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {allConfirmed && (
        <button onClick={proceedToPlan} disabled={saving}
          className="w-full py-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-black rounded-2xl text-sm transition shadow-md mt-2">
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
