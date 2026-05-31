'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage } from '@/types'

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
            <div className="text-sm text-gray-400 mb-4">Weekly check-ins with Dr. Eriksson help track progress and adjust the plan.</div>
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
          childName, weekNumber, action: 'open',
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
      body: JSON.stringify({ messages: newMessages, childName, weekNumber, action: 'continue' }),
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
            <div className="text-[10px] text-gray-400">Dr. Lena Eriksson · Progress Review</div>
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
            <div className={msg.role === 'user' ? 'chat-user' : 'chat-ai'} style={{ whiteSpace: 'pre-wrap' }}>
              {msg.content}
            </div>
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

function CheckinContent() {
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const supabase = createClient()

  const [view, setView] = useState<'history' | 'chat'>('history')
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [selectedCheckin, setSelectedCheckin] = useState<Checkin | null>(null)
  const [isNewCheckin, setIsNewCheckin] = useState(false)
  const [childName, setChildName] = useState('')
  const [weekNumber, setWeekNumber] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!childId) return
    const load = async () => {
      const [{ data: child }, { data: appState }, { data: allCheckins }] = await Promise.all([
        supabase.from('children').select('name').eq('id', childId).single(),
        supabase.from('app_state').select('*').eq('child_id', childId).maybeSingle(),
        supabase.from('weekly_checkins').select('*').eq('child_id', childId)
          .order('created_at', { ascending: false }),
      ])

      if (child) setChildName(child.name)
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

  const handleNewCheckin = () => {
    setSelectedCheckin(null)
    setIsNewCheckin(true)
    setView('chat')
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
