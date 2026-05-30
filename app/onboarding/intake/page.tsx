'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { INTAKE_AGENT_PROMPT, buildChildContext } from '@/lib/agents/prompts'
import { cleanAgentResponse, extractConfidenceUpdate } from '@/lib/agents/caller'
import type { ChatMessage, DomainConfidence, Child } from '@/types'

const DOMAIN_LABELS: Record<keyof DomainConfidence, string> = {
  communication: 'Communication',
  social: 'Social',
  sensory: 'Sensory',
  behaviour: 'Behaviour',
  motor: 'Motor',
  cognition: 'Cognition',
  family_context: 'Family',
  strengths: 'Strengths',
}

const DOMAIN_COLORS: Record<keyof DomainConfidence, string> = {
  communication: '#E8635A',
  social: '#5B7FE8',
  sensory: '#7C3AED',
  behaviour: '#D97706',
  motor: '#16A34A',
  cognition: '#0891B2',
  family_context: '#DB2777',
  strengths: '#059669',
}

function ConfidencePanel({ confidence }: { confidence: DomainConfidence }) {
  const overall = Math.round(
    Object.values(confidence).reduce((a, b) => a + b, 0) / Object.keys(confidence).length
  )
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">Understanding</span>
        <span className="text-sm font-black text-violet-600">{overall}%</span>
      </div>
      <div className="space-y-2">
        {(Object.keys(DOMAIN_LABELS) as (keyof DomainConfidence)[]).map(domain => {
          const pct = confidence[domain]
          const color = DOMAIN_COLORS[domain]
          return (
            <div key={domain}>
              <div className="flex justify-between items-center mb-0.5">
                <span className="text-[10px] text-gray-500 font-medium">{DOMAIN_LABELS[domain]}</span>
                <span className="text-[10px] font-bold" style={{ color: pct >= 80 ? '#16A34A' : '#9CA3AF' }}>
                  {pct >= 80 ? '✓' : `${pct}%`}
                </span>
              </div>
              <div className="conf-bar">
                <div className="conf-fill" style={{ width: `${pct}%`, background: color }} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 text-[10px] text-gray-400 leading-relaxed">
        The interview continues until all areas reach 80%+. This ensures your child&apos;s plan is truly personalised.
      </div>
    </div>
  )
}

function IntakeContent() {
  const router = useRouter()
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const supabase = createClient()

  const [child, setChild] = useState<Child | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [confidence, setConfidence] = useState<DomainConfidence>({
    communication: 0, social: 0, sensory: 0, behaviour: 0,
    motor: 0, cognition: 0, family_context: 0, strengths: 0,
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [readyForSynthesis, setReadyForSynthesis] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Load or create session
  useEffect(() => {
    if (!childId) return
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: childData }, { data: existingSession }] = await Promise.all([
        supabase.from('children').select('*').eq('id', childId).single(),
        supabase.from('intake_sessions')
          .select('*').eq('child_id', childId).eq('status', 'in_progress').maybeSingle(),
      ])

      if (!childData) { router.push('/dashboard'); return }
      setChild(childData as Child)

      if (existingSession) {
        setSessionId(existingSession.id)
        setMessages(existingSession.messages || [])
        setConfidence(existingSession.domain_confidence || confidence)
        setInitializing(false)
        return
      }

      // Create new session + kick off with opening message
      const { data: newSession } = await supabase.from('intake_sessions').insert({
        child_id: childId,
        user_id: user.id,
        messages: [],
        domain_confidence: confidence,
        status: 'in_progress',
      }).select().single()

      if (!newSession) return
      setSessionId(newSession.id)

      // Load documents with extracted data
      const { data: docs } = await supabase.from('documents')
        .select('file_name, doc_type, extracted_data').eq('child_id', childId)

      let docContext = ''
      if (docs?.length) {
        const docSummaries = docs.map((d: { file_name: string; doc_type: string | null; extracted_data: Record<string, unknown> | null }) => {
          const base = d.file_name + (d.doc_type ? ` (${d.doc_type})` : '')
          if (d.extracted_data && Object.keys(d.extracted_data).length > 0) {
            const e = d.extracted_data
            const parts = [
              e.diagnosis ? `Diagnosis: ${e.diagnosis}` : null,
              e.key_findings ? `Key findings: ${e.key_findings}` : null,
              e.communication_summary ? `Communication: ${e.communication_summary}` : null,
            ].filter(Boolean).join('. ')
            return base + (parts ? ` — ${parts}` : '')
          }
          return base
        }).join('\n')
        docContext = `\n\nThe parent has uploaded ${docs.length} document(s) which I have reviewed:\n${docSummaries}\n\nAcknowledge what you found. Skip questions already answered by these documents.`
      }

      // Generate opening message from Intake Agent
      const openingPrompt = buildChildContext({ child: childData as Record<string, unknown> })
      const openingMessages: ChatMessage[] = [{
        role: 'user',
        content: `Please begin the intake interview for ${childData.name}. Introduce yourself warmly, explain what we'll be doing together, and ask your first question.${docContext}`,
      }]

      setLoading(true)
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: openingMessages, childContext: openingPrompt }),
      })
      const { text } = await res.json()
      setLoading(false)

      const clean = cleanAgentResponse(text)
      const firstMsg: ChatMessage = { role: 'assistant', content: clean, timestamp: new Date().toISOString() }
      setMessages([firstMsg])

      await supabase.from('intake_sessions')
        .update({ messages: [firstMsg], updated_at: new Date().toISOString() })
        .eq('id', newSession.id)

      setInitializing(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading || !sessionId || !child) return
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const childContext = buildChildContext({ child: child as unknown as Record<string, unknown> })
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, childContext, confidence }),
      })
      const { text, confidence_update, ready_for_synthesis } = await res.json()

      const aiMsg: ChatMessage = { role: 'assistant', content: text, timestamp: new Date().toISOString() }
      const updatedMessages = [...newMessages, aiMsg]
      setMessages(updatedMessages)

      let updatedConfidence = confidence
      if (confidence_update) {
        updatedConfidence = { ...confidence, ...confidence_update } as DomainConfidence
        setConfidence(updatedConfidence)
      }
      if (ready_for_synthesis) setReadyForSynthesis(true)


      // Save to DB
      await supabase.from('intake_sessions').update({
        messages: updatedMessages,
        domain_confidence: updatedConfidence,
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId)

    } catch (err) {
      console.error(err)
      setMessages(prev => [...prev, { role: 'assistant', content: 'I had a connection issue. Please try again.', timestamp: new Date().toISOString() }])
    }
    setLoading(false)
  }, [input, loading, sessionId, child, messages, confidence, supabase])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const proceedToProfile = async () => {
    if (!sessionId) return
    await supabase.from('intake_sessions')
      .update({ status: 'complete', completed_at: new Date().toISOString() })
      .eq('id', sessionId)
    await supabase.from('app_state')
      .update({ intake_complete: true, current_phase: 'profile_review', updated_at: new Date().toISOString() })
      .eq('child_id', childId)
    router.push(`/onboarding/profile-review?child=${childId}&session=${sessionId}`)
  }

  const overallConfidence = Math.round(
    Object.values(confidence).reduce((a, b) => a + b, 0) / Object.keys(confidence).length
  )
  const allDomainsReady = Object.values(confidence).every(v => v >= 80)

  if (initializing) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-3xl mb-3 animate-pulse">🧠</div>
          <div className="text-sm text-gray-500">Preparing your interview…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Chat area */}
      <div className="lg:col-span-2 flex flex-col" style={{ height: 'calc(100vh - 220px)', minHeight: 400 }}>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-sm flex-shrink-0">👩‍⚕️</div>
            <div>
              <div className="text-sm font-bold text-gray-900">Dr. Sarah Chen</div>
              <div className="text-[10px] text-gray-400">Clinical Psychologist · ASD Assessment Specialist</div>
            </div>
            <div className="ml-auto text-xs font-bold text-violet-600 bg-violet-50 px-2 py-1 rounded-full">
              {overallConfidence}% understood
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-up`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-xs mr-2 flex-shrink-0 mt-1">👩‍⚕️</div>
                )}
                <div className={msg.role === 'user' ? 'chat-user' : 'chat-ai'} style={{ whiteSpace: 'pre-wrap' }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-xs mr-2 flex-shrink-0">👩‍⚕️</div>
                <div className="chat-ai flex items-center gap-1.5 py-3">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 border-t border-gray-50">
            {(allDomainsReady || readyForSynthesis) ? (
              <div className="text-center">
                <div className="text-sm text-emerald-600 font-semibold mb-3">
                  ✓ We have a comprehensive understanding of {child?.name}
                </div>
                <button onClick={proceedToProfile}
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-sm transition">
                  Build {child?.name}&apos;s profile →
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your response… (Enter to send)"
                  rows={2}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition leading-relaxed"
                />
                <button onClick={sendMessage} disabled={loading || !input.trim()}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition self-end">
                  Send
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Can proceed early */}
        {!allDomainsReady && overallConfidence >= 60 && (
          <div className="mt-3 text-center">
            <button onClick={proceedToProfile}
              className="text-xs text-gray-400 hover:text-violet-600 transition underline">
              Proceed with current information
            </button>
          </div>
        )}
      </div>

      {/* Confidence sidebar */}
      <div className="lg:col-span-1">
        <ConfidencePanel confidence={confidence} />
        <div className="mt-3 bg-amber-50 border border-amber-100 rounded-2xl p-3">
          <div className="text-xs font-bold text-amber-700 mb-1">💡 Take your time</div>
          <div className="text-xs text-amber-600 leading-relaxed">
            This interview can be paused and resumed at any time. Your progress is saved automatically. Most families complete it across 2–3 sessions.
          </div>
        </div>
      </div>
    </div>
  )
}

export default function IntakePage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-gray-400 text-sm">Loading…</div>}>
      <IntakeContent />
    </Suspense>
  )
}
