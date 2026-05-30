'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PLANNING_AGENT_PROMPT, buildChildContext } from '@/lib/agents/prompts'
import type { Child, ChildProfile, ChatMessage } from '@/types'

const AREA_COLORS: Record<string, string> = {
  communication: '#E8635A', social: '#5B7FE8', sensory: '#7C3AED',
  motor: '#16A34A', cognition: '#0891B2', behaviour: '#D97706', school: '#DB2777',
}

interface PlanGoal {
  id?: string
  area?: string
  label?: string
  rationale?: string
  timeline_weeks?: number
  root_cause_addressed?: string
  approach?: string
  baseline?: string
  target_criterion?: string
  evidence_base?: string
  activities?: unknown[]
  generalisation_plan?: string
  dependencies?: string[]
}

interface PlanData {
  overview?: string
  phases?: unknown[]
  goals?: PlanGoal[]
  parent_priorities_addressed?: string[]
}

function PlanContent() {
  const router = useRouter()
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const profileId = params.get('profile') || ''
  const supabase = createClient()

  const [child, setChild] = useState<Child | null>(null)
  const [profile, setProfile] = useState<ChildProfile | null>(null)
  const [generating, setGenerating] = useState(false)
  const [planId, setPlanId] = useState<string | null>(null)
  const [planData, setPlanData] = useState<PlanData | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [approved, setApproved] = useState(false)
  const [saving, setSaving] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (!childId || !profileId) return
    const load = async () => {
      const [{ data: childData }, { data: profileData }] = await Promise.all([
        supabase.schema('neuronest').from('children').select('*').eq('id', childId).single(),
        supabase.schema('neuronest').from('child_profiles').select('*').eq('id', profileId).single(),
      ])
      if (childData) setChild(childData as Child)
      if (profileData) setProfile(profileData as ChildProfile)
      if (childData && profileData) generatePlan(childData as Child, profileData as ChildProfile)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, profileId])

  const generatePlan = async (childData: Child, profileData: ChildProfile) => {
    setGenerating(true)
    const childContext = buildChildContext({
      child: childData as unknown as Record<string, unknown>,
      profile: profileData.profile_data as unknown as Record<string, unknown>,
    })

    const res = await fetch('/api/planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ childContext, childName: childData.name, action: 'generate', messages: [] }),
    })
    const { plan, message } = await res.json()

    const { data: { user } } = await supabase.auth.getUser()
    const { data: savedPlan } = await supabase.schema('neuronest').from('plans').insert({
      child_id: childId,
      user_id: user!.id,
      profile_id: profileId,
      version: 1,
      plan_data: plan,
      phase_structure: plan.phases || null,
      status: 'feedback',
      is_current: true,
    }).select().single()

    if (savedPlan) setPlanId(savedPlan.id)
    setPlanData(plan as PlanData)
    const aiMsg: ChatMessage = { role: 'assistant', content: message, timestamp: new Date().toISOString() }
    setMessages([aiMsg])
    setGenerating(false)
  }

  const sendFeedback = async () => {
    if (!input.trim() || loading) return
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    const childContext = buildChildContext({
      child: child as unknown as Record<string, unknown>,
      profile: profile?.profile_data as unknown as Record<string, unknown>,
    })

    const res = await fetch('/api/planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ childContext, childName: child?.name, action: 'feedback', messages: newMessages, currentPlan: planData }),
    })
    const { plan: updatedPlan, message, planApproved } = await res.json()

    const aiMsg: ChatMessage = { role: 'assistant', content: message, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, aiMsg])
    if (updatedPlan) setPlanData(updatedPlan as PlanData)
    if (planApproved) setApproved(true)
    setLoading(false)
  }

  const activatePlan = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (planData?.goals && Array.isArray(planData.goals)) {
      const goals = planData.goals.map((g: PlanGoal) => ({
        plan_id: planId,
        child_id: childId,
        user_id: user!.id,
        area: g.area || 'general',
        label: g.label || g.id || 'Goal',
        rationale: g.rationale || null,
        root_cause_addressed: g.root_cause_addressed || null,
        approach: g.approach || null,
        baseline: g.baseline || null,
        target_criterion: g.target_criterion || null,
        timeline_weeks: g.timeline_weeks || null,
        evidence_base: g.evidence_base || null,
        activities: g.activities || null,
        generalisation_plan: g.generalisation_plan || null,
        status: 'not_started',
      }))
      await supabase.schema('neuronest').from('goals').insert(goals)
    }

    await Promise.all([
      supabase.schema('neuronest').from('plans')
        .update({ status: 'active', parent_approved: true, approved_at: new Date().toISOString(), activated_at: new Date().toISOString() })
        .eq('id', planId),
      supabase.schema('neuronest').from('app_state')
        .update({ plan_approved: true, current_phase: 'active', updated_at: new Date().toISOString() })
        .eq('child_id', childId),
    ])
    router.push('/dashboard')
  }

  if (generating) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center">
        <div className="text-4xl mb-4 animate-pulse">📋</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Building {child?.name}&apos;s plan…</h2>
        <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
          Dr. Santos is creating a personalised, evidence-based intervention plan with specific goals, timelines, and rationale for each priority area.
        </p>
        <div className="mt-6 flex justify-center gap-1.5">
          <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {planData && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h1 className="text-xl font-black text-gray-900 mb-1">{child?.name}&apos;s Intervention Plan</h1>
          {planData.overview && (
            <p className="text-sm text-gray-500 mb-4">{planData.overview}</p>
          )}

          {planData.goals && Array.isArray(planData.goals) && planData.goals.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Goals ({planData.goals.length})
              </div>
              {planData.goals.map((goal: PlanGoal, i: number) => {
                const color = AREA_COLORS[goal.area || ''] || '#7C3AED'
                return (
                  <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl px-3 py-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: color }} />
                    <div className="flex-1">
                      <div className="text-sm font-bold text-gray-900">{goal.label || 'Goal'}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {goal.area} {goal.timeline_weeks ? `· ${goal.timeline_weeks} weeks` : ''}
                      </div>
                      {goal.rationale && (
                        <div className="text-xs text-gray-600 mt-1 leading-relaxed">{goal.rationale}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-sm">👩‍💼</div>
          <div>
            <div className="text-sm font-bold text-gray-900">Dr. Maria Santos</div>
            <div className="text-[10px] text-gray-400">BCBA-D · ABA Intervention Specialist</div>
          </div>
        </div>

        <div className="px-4 py-4 space-y-3 max-h-64 overflow-y-auto">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={msg.role === 'user' ? 'chat-user' : 'chat-ai'} style={{ whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="chat-ai flex items-center gap-1.5 py-3">
                <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="px-4 py-3 border-t border-gray-50">
          {approved ? (
            <div className="text-center">
              <div className="text-sm font-semibold text-emerald-600 mb-3">✓ Plan approved — ready to begin</div>
              <button onClick={activatePlan} disabled={saving}
                className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-black rounded-xl text-sm transition">
                {saving ? 'Activating…' : `Start ${child?.name}'s programme →`}
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendFeedback()}
                  placeholder="Does this plan address your main concerns? What's missing?"
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 transition" />
                <button onClick={sendFeedback} disabled={loading || !input.trim()}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition">
                  Send
                </button>
              </div>
              <button onClick={activatePlan} disabled={saving}
                className="w-full mt-2 py-2 border border-violet-200 text-violet-600 hover:bg-violet-50 font-semibold rounded-xl text-xs transition">
                {saving ? 'Activating…' : 'Approve plan and begin →'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PlanPage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-gray-400 text-sm">Loading…</div>}>
      <PlanContent />
    </Suspense>
  )
}
