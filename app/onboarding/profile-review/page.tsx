'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buildChildContext } from '@/lib/agents/prompts'
import type { Child, ChatMessage } from '@/types'

interface ProfileSection {
  key: string
  title: string
  icon: string
  color: string
  content: string
  confirmed: boolean
  chatMessages: ChatMessage[]
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
  if (v.summary)               parts.push(v.summary as string)
  if (v.current_level)         parts.push(`Current level: ${v.current_level}`)
  if (v.root_cause)            parts.push(`Root cause: ${v.root_cause}`)
  if (v.profile_type)          parts.push(`Profile type: ${v.profile_type}`)
  if (v.cognitive_level)       parts.push(`Cognitive level: ${v.cognitive_level}`)
  if (v.verbal_nonverbal_gap)  parts.push(`Verbal/non-verbal gap: ${v.verbal_nonverbal_gap}`)
  if (v.learning_style)        parts.push(`Learning style: ${v.learning_style}`)
  if (v.echolalia_analysis)    parts.push(`Echolalia: ${v.echolalia_analysis}`)
  if (v.parental_stress_level) parts.push(`Parent stress level: ${v.parental_stress_level}`)
  if (v.what_works)            parts.push(`What works: ${v.what_works}`)
  if (Array.isArray(v.strengths) && v.strengths.length)
    parts.push(`Strengths:\n${(v.strengths as string[]).map(s => `  • ${s}`).join('\n')}`)
  if (Array.isArray(v.challenges) && v.challenges.length)
    parts.push(`Challenges:\n${(v.challenges as string[]).map(s => `  • ${s}`).join('\n')}`)
  if (Array.isArray(v.targets) && v.targets.length)
    parts.push(`Key targets:\n${(v.targets as string[]).map(s => `  • ${s}`).join('\n')}`)
  if (Array.isArray(v.support_factors) && v.support_factors.length)
    parts.push(`What helps:\n${(v.support_factors as string[]).map(s => `  • ${s}`).join('\n')}`)
  if (Array.isArray(v.complicating_factors) && v.complicating_factors.length)
    parts.push(`Complicating factors:\n${(v.complicating_factors as string[]).map(s => `  • ${s}`).join('\n')}`)
  if (Array.isArray(v.regulation_strategies) && v.regulation_strategies.length)
    parts.push(`Regulation strategies:\n${(v.regulation_strategies as string[]).map(s => `  • ${s}`).join('\n')}`)
  if (Array.isArray(v.triggers) && v.triggers.length)
    parts.push(`Triggers:\n${(v.triggers as string[]).map(s => `  • ${s}`).join('\n')}`)

  return parts.length > 0 ? parts.join('\n\n') : JSON.stringify(value, null, 2)
}

// Section chat panel — Dr. Sarah Chen discusses the finding with the parent
function SectionChat({
  section,
  child,
  childId,
  allSections,
  onUpdateContent,
  onConfirm,
  onUnconfirm,
  onClose,
}: {
  section: ProfileSection
  child: Child | null
  childId: string
  allSections: ProfileSection[]
  onUpdateContent: (key: string, newContent: string, messages: ChatMessage[]) => void
  onConfirm: (key: string) => void
  onUnconfirm: (key: string) => void
  onClose: () => void
}) {
  const supabase = createClient()
  const [messages, setMessages] = useState<ChatMessage[]>(
    section.chatMessages.length > 0
      ? section.chatMessages
      : [{
          role: 'assistant',
          content: `I'm Dr. Sarah Chen. Looking at what I recorded for the **${section.title}** section:\n\n${section.content}\n\nDoes this accurately reflect what you know about ${child?.name || 'your child'}? Please tell me anything that feels wrong, incomplete, or that I may have missed.`,
          timestamp: new Date().toISOString(),
        }]
  )
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load persisted chat from DB on mount
  useEffect(() => {
    if (!childId || section.chatMessages.length > 0) return
    const load = async () => {
      const { data } = await supabase
        .from('agent_state')
        .select('messages, state_data')
        .eq('child_id', childId)
        .eq('agent_type', `profile-review-${section.key}`)
        .maybeSingle()
      if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages(data.messages as ChatMessage[])
        // Also restore updated content if saved
        if (data.state_data && (data.state_data as Record<string, unknown>).updatedContent) {
          onUpdateContent(
            section.key,
            (data.state_data as Record<string, string>).updatedContent,
            data.messages as ChatMessage[]
          )
        }
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, section.key])

  // Persist chat to DB after every message exchange
  const persistChat = async (msgs: ChatMessage[], updatedContent?: string) => {
    if (!childId) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('agent_state').upsert({
      child_id: childId,
      user_id: user.id,
      agent_type: `profile-review-${section.key}`,
      messages: msgs,
      state_data: updatedContent ? { updatedContent } : {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'child_id,agent_type' })
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/profile-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          sectionKey: section.key,
          sectionTitle: section.title,
          currentContent: section.content,
          childName: child?.name || 'the child',
          childContext: buildChildContext({ child: child as unknown as Record<string, unknown> }),
          allSections: allSections.map(s => ({ key: s.key, title: s.title, content: s.content })),
        }),
      })
      const { text, updatedContent } = await res.json()
      const aiMsg: ChatMessage = { role: 'assistant', content: text, timestamp: new Date().toISOString() }
      const finalMessages = [...newMessages, aiMsg]
      setMessages(finalMessages)

      // Persist chat to DB immediately after every exchange
      await persistChat(finalMessages, updatedContent || undefined)

      // If agent revised the section content, update it
      if (updatedContent) {
        onUpdateContent(section.key, updatedContent, finalMessages)
      } else {
        onUpdateContent(section.key, section.content, finalMessages)
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I had a connection issue. Please try again.',
        timestamp: new Date().toISOString(),
      }])
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: '85vh' }}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-base flex-shrink-0">
            👩‍⚕️
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-gray-900">Dr. Sarah Chen</div>
            <div className="text-[10px] text-gray-400 truncate">
              Discussing: {section.icon} {section.title}
            </div>
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0 px-1">
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-xs flex-shrink-0 mt-1">
                  👩‍⚕️
                </div>
              )}
              <div className={msg.role === 'user' ? 'chat-user' : 'chat-ai'}
                style={{ whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-xs flex-shrink-0">
                👩‍⚕️
              </div>
              <div className="chat-ai flex items-center gap-1.5 py-3">
                <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0 space-y-2">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={section.confirmed ? "Continue the conversation…" : "Tell Dr. Chen what\'s wrong or missing…"}
              rows={2}
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition"
            />
            <button onClick={send} disabled={loading || !input.trim()}
              className="px-4 self-end py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition">
              Send
            </button>
          </div>
          {section.confirmed ? (
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition">
                Close
              </button>
              <button
                onClick={() => { onUnconfirm(section.key); }}
                className="py-2 px-3 border border-amber-200 text-amber-600 hover:bg-amber-50 font-medium rounded-xl text-sm transition">
                Revise
              </button>
            </div>
          ) : (
            <button
              onClick={() => { onConfirm(section.key); onClose() }}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition">
              ✓ Confirm this section and continue
            </button>
          )}
        </div>
      </div>
    </div>
  )
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
  const [activeChatKey, setActiveChatKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [allConfirmed, setAllConfirmed] = useState(false)

  useEffect(() => {
    if (!childId) return
    const load = async () => {
      const { data: childData } = await supabase.from('children').select('*').eq('id', childId).single()
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

  const buildSections = (profile: Record<string, unknown>, name?: string) => {
    const childName = name || child?.name || 'Your child'
    const defs = [
      { key: 'snapshot',        title: `${childName} — Overview`,   icon: '🌟', color: '#7C3AED' },
      { key: 'communication',   title: 'Communication Profile',     icon: '💬', color: '#E8635A' },
      { key: 'social',          title: 'Social Profile',            icon: '🤝', color: '#5B7FE8' },
      { key: 'sensory',         title: 'Sensory Profile',           icon: '🌀', color: '#7C3AED' },
      { key: 'behaviour',       title: 'Behaviour & Regulation',    icon: '⚖️', color: '#D97706' },
      { key: 'cognition',       title: 'Cognitive Profile',         icon: '🧩', color: '#0891B2' },
      { key: 'motor',           title: 'Motor Profile',             icon: '🏃', color: '#16A34A' },
      { key: 'strength_map',    title: 'Strength Map',              icon: '💪', color: '#059669' },
      { key: 'family_context',  title: 'Family Context',            icon: '🏠', color: '#DB2777' },
      { key: 'priority_matrix', title: 'Priority Areas',            icon: '🎯', color: '#E8635A' },
    ]
    setSections(defs.map(def => ({
      ...def,
      content: formatSection(def.key, profile[def.key]),
      confirmed: false,
      chatMessages: [],
    })))
  }

  const handleUpdateContent = (key: string, newContent: string, chatMessages: ChatMessage[]) => {
    setSections(prev => prev.map(s =>
      s.key === key ? { ...s, content: newContent, chatMessages } : s
    ))
  }

  const handleConfirm = (key: string) => {
    setSections(prev => {
      const updated = prev.map(s => s.key === key ? { ...s, confirmed: true } : s)
      setAllConfirmed(updated.every(s => s.confirmed))
      const idx = updated.findIndex(s => s.key === key)
      const next = updated.slice(idx + 1).find(s => !s.confirmed)
      if (next) setTimeout(() => setActiveChatKey(next.key), 300)
      return updated
    })
  }

  const handleUnconfirm = (key: string) => {
    setSections(prev => prev.map(s => s.key === key ? { ...s, confirmed: false } : s))
    setAllConfirmed(false)
  }

  const generateProfile = async (childData: Child) => {
    setGenerating(true)
    const { data: session } = await supabase.from('intake_sessions')
      .select('*').eq('id', sessionId).maybeSingle()

    const childContext = buildChildContext({ child: childData as unknown as Record<string, unknown> })
    const intakeData = session
      ? `\n\nINTAKE INTERVIEW:\nConfidence: ${JSON.stringify(session.domain_confidence)}\n${
          (session.messages as { role: string; content: string }[])
            .slice(-12).map(m => `${m.role}: ${m.content}`).join('\n\n')
        }`
      : ''

    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ childContext: childContext + intakeData, childName: childData.name }),
    })
    const { profile } = await res.json()

    const { data: { user } } = await supabase.auth.getUser()
    const { data: saved } = await supabase.from('child_profiles').insert({
      child_id: childId, user_id: user!.id, version: 1,
      profile_data: profile, root_causes: profile.root_causes || null,
      strength_map: profile.strength_map || null,
      priority_matrix: profile.priority_matrix || null,
      hypotheses: profile.hypotheses || null, is_current: true,
    }).select().single()

    if (saved) setProfileId(saved.id)
    buildSections(profile, childData.name)
    setGenerating(false)
  }

  const proceedToPlan = async () => {
    setSaving(true)
    const updatedData: Record<string, string> = {}
    sections.forEach(s => { updatedData[s.key] = s.content })

    await supabase.from('child_profiles').update({
      parent_confirmed: true,
      confirmed_at: new Date().toISOString(),
      profile_data: updatedData,
    }).eq('id', profileId)

    await supabase.from('app_state').update({
      profile_confirmed: true, current_phase: 'plan_generation',
      updated_at: new Date().toISOString(),
    }).eq('child_id', childId)

    router.push(`/onboarding/plan?child=${childId}&profile=${profileId}`)
  }

  const activeSection = sections.find(s => s.key === activeChatKey)

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
    <>
      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <h1 className="text-xl font-black text-gray-900 mb-1">Review {child?.name}&apos;s profile</h1>
          <p className="text-sm text-gray-500">
            Dr. Okafor has synthesised your interview into this profile. Tap any section to review it with Dr. Sarah Chen — she can discuss, clarify, and update her findings based on what you tell her.
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
            className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
              section.confirmed ? 'border-emerald-200' : 'border-gray-100'
            }`}>
            <div className="px-5 py-4 flex items-start gap-3">
              <span className="text-xl flex-shrink-0 mt-0.5">{section.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-gray-900 mb-1">{section.title}</div>
                <div className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                  {section.confirmed
                    ? <span className="text-emerald-600">Tap &ldquo;View chat&rdquo; to review or continue discussion</span>
                    : section.content.split('\n')[0]
                  }
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {section.confirmed ? (
                  <>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                      ✓ Confirmed
                    </span>
                    <button
                      onClick={() => setActiveChatKey(section.key)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full border border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100 transition">
                      💬 {section.chatMessages.length > 0 ? 'View chat' : 'Open chat'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setActiveChatKey(section.key)}
                    className="text-xs font-bold px-3 py-1.5 rounded-full border transition"
                    style={{
                      background: section.chatMessages.length > 0 ? '#F5F0FF' : '#fff',
                      borderColor: section.chatMessages.length > 0 ? '#7C3AED' : '#E5E7EB',
                      color: section.chatMessages.length > 0 ? '#7C3AED' : '#6B7280',
                    }}>
                    {section.chatMessages.length > 0 ? '💬 Continue chat' : '💬 Discuss'}
                  </button>
                )}
              </div>
            </div>

            {/* Full content — only shown when confirmed */}
            {section.confirmed && (
              <div className="px-5 pb-4">
                <div
                  className="text-xs text-gray-600 leading-relaxed bg-emerald-50 rounded-xl p-3 whitespace-pre-wrap overflow-y-auto"
                  style={{ maxHeight: 280 }}>
                  {section.content}
                </div>
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

      {/* Section Chat Modal */}
      {activeChatKey && activeSection && (
        <SectionChat
          section={activeSection}
          child={child}
          childId={childId}
          allSections={sections}
          onUpdateContent={handleUpdateContent}
          onConfirm={handleConfirm}
          onUnconfirm={handleUnconfirm}
          onClose={() => setActiveChatKey(null)}
        />
      )}
    </>
  )
}

export default function ProfileReviewPage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-gray-400 text-sm">Loading…</div>}>
      <ProfileContent />
    </Suspense>
  )
}
