'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage } from '@/types'
import AgentText from '@/components/AgentText'
import PersonaTag, { PersonaDisclosure } from '@/components/PersonaTag'

function cleanMessage(text: string): string {
  return text
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\{[\s\S]*?"wins"[\s\S]*?\}/g, '')
    .replace(/\{[\s\S]*?"recommendations"[\s\S]*?\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface Checkin {
  id: string
  week_number: number
  messages: ChatMessage[]
  wins: string[]
  challenges: string[]
  recommendations: string[]
  completed_at: string | null
  created_at: string
}

function HistoryView({ checkins, onSelect, onNewCheckin, childName }: {
  checkins: Checkin[]
  onSelect: (c: Checkin) => void
  onNewCheckin: () => void
  childName: string
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-lg">←</Link>
            <div>
              <div className="font-black text-sm text-gray-900">Weekly Check-ins</div>
              <div className="text-[10px] text-gray-400">{childName}&apos;s progress history</div>
            </div>
          </div>
          <button onClick={onNewCheckin}
            className="text-xs font-black px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition">
            + New check-in
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 pb-12">
        {checkins.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className="text-3xl mb-3">📊</div>
            <div className="font-bold text-gray-900 mb-1">No check-ins yet</div>
            <div className="text-sm text-gray-400 mb-4">Weekly check-ins with <PersonaTag persona="eriksson" /> help track progress and adjust the plan.</div>
            <button onClick={onNewCheckin}
              className="px-5 py-2.5 bg-violet-600 text-white font-bold rounded-xl text-sm">
              Start Week 1 check-in
            </button>
          </div>
        )}

        {checkins.map(c => (
          <button key={c.id} onClick={() => onSelect(c)}
            className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:border-violet-200 transition">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-black text-sm text-gray-900">Week {c.week_number} Check-in</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(c.created_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                c.completed_at ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
              }`}>
                {c.completed_at ? '✓ Complete' : 'In progress'}
              </span>
            </div>

            {c.wins && c.wins.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Wins</div>
                <div className="space-y-0.5">
                  {c.wins.slice(0, 3).map((w, i) => (
                    <div key={i} className="text-xs text-gray-600 flex gap-1.5">
                      <span className="text-emerald-500 flex-shrink-0">✓</span>
                      <span className="line-clamp-1">{w}</span>
                    </div>
                  ))}
                  {c.wins.length > 3 && (
                    <div className="text-[10px] text-gray-400">+{c.wins.length - 3} more</div>
                  )}
                </div>
              </div>
            )}

            {c.recommendations && c.recommendations.length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Recommendations</div>
                <div className="space-y-0.5">
                  {c.recommendations.slice(0, 2).map((r, i) => (
                    <div key={i} className="text-xs text-gray-600 flex gap-1.5">
                      <span className="text-violet-400 flex-shrink-0">→</span>
                      <span className="line-clamp-1">{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2 text-[10px] text-gray-400">
              {Array.isArray(c.messages) ? c.messages.length : 0} messages · Tap to view full conversation
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function ChatView({ checkin, childName, weekNumber, isNew, onBack }: {
  checkin: Checkin | null
  childName: string
  weekNumber: number
  isNew: boolean
  onBack: () => void
}) {
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const supabase = createClient()

  const [messages, setMessages] = useState<ChatMessage[]>(
    checkin?.messages || []
  )
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkinId, setCheckinId] = useState<string | null>(checkin?.id || null)
  const [initializing, setInitializing] = useState(isNew)
  const [isComplete, setIsComplete] = useState(!!checkin?.completed_at)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // If new checkin, kick off opening message
  useEffect(() => {
    if (!isNew) return
    const start = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: goals } = await supabase.from('goals')
        .select('id, label, area, status').eq('child_id', childId).neq('status', 'achieved')

      const { data: newCheckin } = await supabase.from('weekly_checkins').insert({
        child_id: childId, user_id: user.id,
        week_number: weekNumber, messages: [],
      }).select().single()

      if (newCheckin) setCheckinId(newCheckin.id)

      const goalList = goals?.map(g => `- ${g.label} (${g.area})`).join('\n') || 'No active goals'
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Begin week ${weekNumber} check-in for ${childName}. Active goals:\n${goalList}` }],
          childName, weekNumber, childId, action: 'open',
        }),
      })
      const { text } = await res.json()
      const aiMsg: ChatMessage = { role: 'assistant', content: cleanMessage(text), timestamp: new Date().toISOString() }
      setMessages([aiMsg])
      if (newCheckin) {
        await supabase.from('weekly_checkins').update({ messages: [aiMsg] }).eq('id', newCheckin.id)
      }
      setInitializing(false)
    }
    start()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!input.trim() || loading || isComplete) return
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    const res = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: newMessages, childName, weekNumber, childId, action: 'continue' }),
    })
    const { text, checkinComplete, summary } = await res.json()
    const aiMsg: ChatMessage = { role: 'assistant', content: cleanMessage(text), timestamp: new Date().toISOString() }
    const finalMessages = [...newMessages, aiMsg]
    setMessages(finalMessages)
    setLoading(false)

    if (checkinId) {
      await supabase.from('weekly_checkins').update({
        messages: finalMessages,
        ...(checkinComplete ? {
          completed_at: new Date().toISOString(),
          wins: summary?.wins || [],
          challenges: summary?.challenges || [],
          recommendations: summary?.recommendations || [],
        } : {}),
      }).eq('id', checkinId)
    }

    if (checkinComplete) {
      setIsComplete(true)
      await supabase.from('app_state').update({
        last_checkin_at: new Date().toISOString(),
        current_week: weekNumber + 1,
        next_checkin_due: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      }).eq('child_id', childId)

      // The check-in immediately reshapes the week (agreed 2026-07-17): Dr. Eriksson
      // re-plans the current focus with this conversation as the primary signal.
      // Fire-and-forget — takes ~1 min on the Edge Function; Today shows the result.
      fetch('/api/weekly-focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId, force: true, trigger: 'checkin' }),
      }).catch(() => {})

      // ...and may suggest goal status changes (achieved / start now) for one-tap
      // confirmation on the Plan tab — the parent decides, never the system
      fetch('/api/goal-status-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId }),
      }).catch(() => {})

      const replanNote: ChatMessage = {
        role: 'assistant',
        content: "I've saved our check-in — and I'm reworking this week's plan right now based on everything you just told me. Give me a minute, then have a look at Today. 🌱",
        timestamp: new Date().toISOString(),
      }
      const withNote = [...finalMessages, replanNote]
      setMessages(withNote)
      if (checkinId) {
        await supabase.from('weekly_checkins').update({ messages: withNote }).eq('id', checkinId)
      }
    }
  }

  if (initializing) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">📊</div>
          <div className="text-sm text-gray-500">Dr. Eriksson is preparing your check-in…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-sm">👩‍⚕️</div>
          <div className="flex-1">
            <div className="font-black text-sm text-gray-900">Week {weekNumber} Check-in</div>
            <div className="text-[10px] text-gray-400"><PersonaTag persona="eriksson" full /></div>
          </div>
          <div className="w-full mt-2">
            <PersonaDisclosure persona="eriksson" className="text-gray-400" />
          </div>
          {isComplete && (
            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full">✓ Complete</span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full px-4 py-4 space-y-3 pb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-xs flex-shrink-0 mt-1">👩‍⚕️</div>
            )}
            {msg.role === 'user' ? (
              <div className="chat-user" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
            ) : (
              <AgentText text={msg.content} className="chat-ai" />
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-xs">👩‍⚕️</div>
            <div className="chat-ai flex items-center gap-1.5 py-3">
              <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!isComplete ? (
        <div className="bg-white border-t border-gray-100 flex-shrink-0">
          <div className="max-w-2xl mx-auto px-4 py-3 flex gap-2">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Reply to Dr. Eriksson…" rows={2}
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-violet-400 transition" />
            <button onClick={send} disabled={loading || !input.trim()}
              className="px-4 self-end py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition">
              Send
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border-t border-gray-100 flex-shrink-0 px-4 py-3">
          <div className="max-w-2xl mx-auto text-center text-xs text-emerald-600 font-semibold">
            ✓ Check-in complete — see you next week!
          </div>
        </div>
      )}
    </div>
  )
}


// ── The 60-second check-in (UX_PLAN Round 3, P3) ──────────────────────────────
// The default way to check in. The conversation still exists one tap away, but it
// costs ~15 minutes and 13-19 turns, so it was being skipped — and everything
// downstream of a check-in (the weekly re-plan, goal status proposals, coaching
// patterns, the family calendar) starves when that happens. Three taps and an
// optional sentence produce the SAME summary contract the conversation produced.
const WELLBEING = [
  { v: 1, label: 'Running on empty' },
  { v: 2, label: 'Hard week' },
  { v: 3, label: 'Getting by' },
  { v: 4, label: 'Pretty good' },
  { v: 5, label: 'Really good' },
]

function QuickView({ childId, childName, weekNumber, goals, onBack, onTalkInstead }: {
  childId: string
  childName: string
  weekNumber: number
  goals: { id: string; label: string }[]
  onBack: () => void
  onTalkInstead: () => void
}) {
  const supabase = createClient()
  const [wentWell, setWentWell] = useState<string[]>([])
  const [wasHard, setWasHard] = useState<string[]>([])
  const [wellNote, setWellNote] = useState('')
  const [hardNote, setHardNote] = useState('')
  const [wellbeing, setWellbeing] = useState<number | null>(null)
  const [weekAhead, setWeekAhead] = useState('')
  const [saving, setSaving] = useState(false)
  const [reflection, setReflection] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chips = goals.slice(0, 6).map(g => g.label)
  const toggle = (list: string[], set: (v: string[]) => void, item: string) =>
    set(list.includes(item) ? list.filter(x => x !== item) : [...list, item])

  // Something must have been said — otherwise there is nothing honest to summarise
  const canSubmit = !saving && (wentWell.length || wasHard.length || wellNote.trim() || hardNote.trim() || wellbeing)

  const submit = async () => {
    setSaving(true); setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('not signed in')

      const answers = {
        went_well: wentWell,
        went_well_note: wellNote.trim() || null,
        was_hard: wasHard,
        was_hard_note: hardNote.trim() || null,
        parent_wellbeing_1_to_5: wellbeing,
        parent_wellbeing_label: WELLBEING.find(w => w.v === wellbeing)?.label || null,
        week_ahead: weekAhead.trim() || null,
      }

      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'quick', childId, childName, weekNumber, answers }),
      })
      const { ok, summary, error: apiError } = await res.json()
      if (!ok) throw new Error(apiError || 'could not save')

      // A readable transcript, so the consumers that read `messages` (goal status
      // proposals, the report) see a real exchange rather than an empty array.
      const transcript: ChatMessage[] = [
        { role: 'user', content: [
            wentWell.length || wellNote ? `What went well: ${[...wentWell, wellNote].filter(Boolean).join('; ')}` : null,
            wasHard.length || hardNote ? `What was hard: ${[...wasHard, hardNote].filter(Boolean).join('; ')}` : null,
            wellbeing ? `How I'm doing: ${WELLBEING.find(w => w.v === wellbeing)?.label}` : null,
            weekAhead.trim() ? `Coming up: ${weekAhead.trim()}` : null,
          ].filter(Boolean).join('\n'), timestamp: new Date().toISOString() },
        { role: 'assistant', content: summary.reflection, timestamp: new Date().toISOString() },
      ]

      await supabase.from('weekly_checkins').insert({
        child_id: childId, user_id: user.id,
        week_number: weekNumber,
        messages: transcript,
        completed_at: new Date().toISOString(),
        wins: summary.wins || [],
        challenges: summary.challenges || [],
        recommendations: summary.recommendations || [],
        // Written for the first time here — the chat path asks the model for these
        // and then drops them, so the weekly planner has always read NULLs.
        parent_wellbeing: wellbeing ? wellbeing * 2 : null,
        goal_assessments: summary.goal_assessments || [],
        escalation_flags: summary.escalation_flags || [],
      })

      await supabase.from('app_state').update({
        last_checkin_at: new Date().toISOString(),
        current_week: weekNumber + 1,
        next_checkin_due: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      }).eq('child_id', childId)

      // Same downstream fan-out as the conversation, so nothing regresses
      fetch('/api/weekly-focus', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId, force: true, trigger: 'checkin' }),
      }).catch(() => {})
      fetch('/api/goal-status-proposals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId }),
      }).catch(() => {})
      // The week-ahead answer keeps its existing home: calendar extraction plus
      // material prepared ahead of a named event (Round 3 moves the question here
      // from Today, so this call is what stops that loop from starving).
      if (weekAhead.trim()) {
        fetch('/api/weekly-focus', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ childId, answer: weekAhead.trim() }),
        }).catch(() => {})
      }

      setReflection(summary.reflection)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — please try again')
    } finally {
      setSaving(false)
    }
  }

  if (reflection) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="text-xs text-gray-400 mb-2"><PersonaTag persona="eriksson" full /></div>
            <AgentText text={reflection} className="text-sm text-gray-700 leading-relaxed" />
          </div>
          <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 text-sm text-violet-700 leading-relaxed">
            🌱 I&apos;m reworking this week&apos;s plan around what you just told me. Give me a minute, then have a look at Today.
          </div>
          <button onClick={onBack}
            className="w-full py-3.5 rounded-2xl bg-marigold-400 text-marigold-ink font-black text-sm min-h-[48px]">
            Done
          </button>
        </div>
      </div>
    )
  }

  const Section = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="font-black text-sm text-gray-900">{title}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5 mb-2.5">{sub}</div>}
      <div className={sub ? '' : 'mt-2.5'}>{children}</div>
    </div>
  )

  const Chip = ({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) => (
    <button onClick={onClick}
      className={`text-sm font-semibold px-3.5 py-2.5 rounded-full min-h-[44px] transition text-left ${
        on ? 'bg-fjord-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}>
      {on ? '✓ ' : ''}{label}
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} aria-label="Back" className="text-gray-400 hover:text-gray-600 text-lg w-11 h-11 -ml-2">←</button>
          <div className="flex-1">
            <div className="font-black text-sm text-gray-900">Week {weekNumber} check-in</div>
            <div className="text-[10px] text-gray-400"><PersonaTag persona="eriksson" full /> · about a minute</div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 pb-16">
        <Section title={`What went well with ${childName} this week?`} sub="Tap any that apply, or write your own">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {chips.map(c => <Chip key={c} label={c} on={wentWell.includes(c)} onClick={() => toggle(wentWell, setWentWell, c)} />)}
          </div>
          <input value={wellNote} onChange={e => setWellNote(e.target.value)}
            placeholder="Anything else? One line is plenty…"
            className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 transition min-h-[44px]" />
        </Section>

        <Section title="What was hard?" sub="Nothing here is a failure — it is how the plan learns">
          <div className="flex flex-wrap gap-1.5 mb-2">
            {chips.map(c => <Chip key={c} label={c} on={wasHard.includes(c)} onClick={() => toggle(wasHard, setWasHard, c)} />)}
          </div>
          <input value={hardNote} onChange={e => setHardNote(e.target.value)}
            placeholder="Anything else?…"
            className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 transition min-h-[44px]" />
        </Section>

        <Section title="And how are YOU doing?">
          <div className="flex flex-wrap gap-1.5">
            {WELLBEING.map(w => (
              <Chip key={w.v} label={w.label} on={wellbeing === w.v} onClick={() => setWellbeing(wellbeing === w.v ? null : w.v)} />
            ))}
          </div>
        </Section>

        <Section title="Anything coming up next week?" sub="A trip, a visitor, a change of routine — I'll prepare for it">
          <input value={weekAhead} onChange={e => setWeekAhead(e.target.value)}
            placeholder="Optional — one sentence…"
            className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 transition min-h-[44px]" />
        </Section>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-3 text-sm text-red-700">{error}</div>
        )}

        <button onClick={submit} disabled={!canSubmit}
          className="w-full py-4 rounded-2xl bg-marigold-400 text-marigold-ink font-black text-sm disabled:opacity-40 min-h-[52px] transition">
          {saving ? 'Saving…' : "That's it — done"}
        </button>

        <button onClick={onTalkInstead}
          className="w-full py-3 text-sm font-bold text-violet-600 min-h-[44px]">
          Rather talk it through with Dr. Eriksson? →
        </button>
      </div>
    </div>
  )
}

function CheckinContent() {
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const supabase = createClient()

  const [view, setView] = useState<'history' | 'chat' | 'quick'>('history')
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [selectedCheckin, setSelectedCheckin] = useState<Checkin | null>(null)
  const [isNewCheckin, setIsNewCheckin] = useState(false)
  const [childName, setChildName] = useState('')
  const [weekNumber, setWeekNumber] = useState(1)
  const [goals, setGoals] = useState<{ id: string; label: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!childId) return
    const load = async () => {
      const [{ data: child }, { data: appState }, { data: allCheckins }, { data: activeGoals }] = await Promise.all([
        supabase.from('children').select('name').eq('id', childId).single(),
        supabase.from('app_state').select('*').eq('child_id', childId).maybeSingle(),
        supabase.from('weekly_checkins').select('*').eq('child_id', childId)
          .order('created_at', { ascending: false }),
        supabase.from('goals').select('id, label').eq('child_id', childId)
          .in('status', ['in_progress', 'emerging', 'not_started']),
      ])

      if (child) setChildName(child.name)
      setGoals((activeGoals || []) as { id: string; label: string }[])
      setWeekNumber(appState?.current_week || 1)
      setCheckins((allCheckins || []) as Checkin[])

      // Auto-open if there's an in-progress checkin
      const inProgress = (allCheckins || []).find((c: Record<string, unknown>) => !c.completed_at) as Checkin | undefined
      if (inProgress && Array.isArray(inProgress.messages) && inProgress.messages.length > 0) {
        setSelectedCheckin(inProgress)
        setIsNewCheckin(false)
        setView('chat')
      }

      setLoading(false)
    }
    load()
  }, [childId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Quick is the default now; the conversation is one tap away inside it
  const handleNewCheckin = () => {
    setSelectedCheckin(null)
    setIsNewCheckin(true)
    setView('quick')
  }

  const handleSelectCheckin = (c: Checkin) => {
    setSelectedCheckin(c)
    setIsNewCheckin(false)
    setView('chat')
  }

  const handleBack = () => {
    setView('history')
    // Reload checkins in case something changed
    supabase.from('weekly_checkins').select('*').eq('child_id', childId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setCheckins((data || []) as Checkin[]))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">📊</div>
          <div className="text-sm text-gray-500">Loading check-ins…</div>
        </div>
      </div>
    )
  }

  if (view === 'quick') {
    return (
      <QuickView
        childId={childId}
        childName={childName}
        weekNumber={weekNumber}
        goals={goals}
        onBack={handleBack}
        onTalkInstead={() => setView('chat')}
      />
    )
  }

  if (view === 'chat') {
    return (
      <ChatView
        checkin={selectedCheckin}
        childName={childName}
        weekNumber={weekNumber}
        isNew={isNewCheckin}
        onBack={handleBack}
      />
    )
  }

  return (
    <HistoryView
      checkins={checkins}
      onSelect={handleSelectCheckin}
      onNewCheckin={handleNewCheckin}
      childName={childName}
    />
  )
}

export default function CheckinPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading…</div>}>
      <CheckinContent />
    </Suspense>
  )
}
