'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TabBar from '@/components/TabBar'
import type { ChatMessage } from '@/types'

// Ask is a growing knowledge base, not a throwaway chat: every exchange persists to
// agent_state (agent_type 'ai_chat') and reloads on open. History renders Outlook-style
// (field feedback 2026-07-16): Today is always visible; Yesterday / Last week /
// Last month / Older are collapsed headers that render only when tapped. Search (🔍)
// covers everything regardless of collapse state, with date-range filters.

const SYSTEM_PROMPT = `You are the NeuroNest AI assistant — a warm, knowledgeable companion for parents of children with ASD. You have access to this child's full profile, plan, and goals.

You answer questions about:
- How to do specific activities from the plan
- Why certain goals were chosen
- What to do when something isn't working
- How to explain ASD concepts to family members
- School communication strategies
- Sensory strategies for specific situations
- Norwegian special education rights (PPT, IOP, BUP, Habiliteringstjenesten, Opplæringslova §5-1)
- Celebrating and interpreting progress

Be specific to THIS child — always reference their name and what you know about them.
Be honest about limitations — if something requires a professional, say so clearly.
Be warm, practical, and direct. Parents don't have time for vague answers.`

const MAX_SAVED_MESSAGES = 200

type QAPair = { q: ChatMessage; a: ChatMessage | null }

const BUCKETS = ['older', 'month', 'week', 'yesterday', 'today'] as const
type Bucket = typeof BUCKETS[number]
const BUCKET_LABELS: Record<Bucket, string> = {
  today: 'Today', yesterday: 'Yesterday', week: 'Last week', month: 'Last month', older: 'Older',
}

function bucketOf(ts?: string): Bucket {
  if (!ts) return 'older'
  const t = new Date(ts)
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000)
  const startOfWeek = new Date(startOfToday.getTime() - 7 * 86400000)
  const startOfMonth = new Date(startOfToday.getTime() - 31 * 86400000)
  if (t >= startOfToday) return 'today'
  if (t >= startOfYesterday) return 'yesterday'
  if (t >= startOfWeek) return 'week'
  if (t >= startOfMonth) return 'month'
  return 'older'
}

// Search date filters are cumulative windows (more natural than exact buckets)
const SEARCH_RANGES = [
  { id: 'all', label: 'All time', days: Infinity },
  { id: 'today', label: 'Today', days: 1 },
  { id: 'week', label: 'Last 7 days', days: 7 },
  { id: 'month', label: 'Last 30 days', days: 31 },
] as const

function toPairs(messages: ChatMessage[]): QAPair[] {
  const pairs: QAPair[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role !== 'user') continue
    const a = messages[i + 1]?.role === 'assistant' ? messages[i + 1] : null
    pairs.push({ q: messages[i], a })
  }
  return pairs
}

function AIChatContent() {
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const supabase = createClient()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [childName, setChildName] = useState('')
  const [profileContext, setProfileContext] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const [searchRange, setSearchRange] = useState<string>('all')
  const [expanded, setExpanded] = useState<Bucket[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!search) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, search])

  useEffect(() => {
    if (!childId) return
    const load = async () => {
      const [{ data: child }, { data: profile }, { data: goals }, { data: savedChat }] = await Promise.all([
        supabase.from('children').select('name').eq('id', childId).single(),
        supabase.from('child_profiles').select('profile_data, priority_matrix').eq('child_id', childId).eq('is_current', true).maybeSingle(),
        supabase.from('goals').select('label, area, status').eq('child_id', childId),
        supabase.from('agent_state').select('messages').eq('child_id', childId).eq('agent_type', 'ai_chat').maybeSingle(),
      ])
      if (child) setChildName(child.name)
      setMessages(((savedChat?.messages || []) as ChatMessage[]))
      const ctx = [
        child ? `Child: ${child.name}` : '',
        profile?.profile_data ? `Profile snapshot: ${JSON.stringify(profile.profile_data).slice(0, 800)}` : '',
        goals?.length ? `Active goals: ${goals.map(g => `${g.label} (${g.area}, ${g.status})`).join(', ')}` : '',
      ].filter(Boolean).join('\n')
      setProfileContext(ctx)
    }
    load()
  }, [childId]) // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async (msgs: ChatMessage[]) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('agent_state').upsert({
      child_id: childId, user_id: user.id,
      agent_type: 'ai_chat',
      messages: msgs.slice(-MAX_SAVED_MESSAGES),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'child_id,agent_type' })
  }

  const send = async () => {
    if (!input.trim() || loading) return
    setShowSearch(false); setSearch('')
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    const apiMessages = newMessages.slice(-16).reduce(
      (acc: { role: string; content: string }[], msg) => {
        if (acc.length === 0 && msg.role === 'assistant') return acc
        const lastRole = acc.at(-1)?.role
        if (lastRole === msg.role) return acc
        return [...acc, { role: msg.role, content: msg.content }]
      }, []
    )

    const aiRes = await fetch('/api/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages, childContext: profileContext }),
    })
    const { text } = await aiRes.json()
    const finalMessages: ChatMessage[] = [...newMessages, { role: 'assistant', content: text, timestamp: new Date().toISOString() }]
    setMessages(finalMessages)
    setLoading(false)
    persist(finalMessages)
  }

  // History, bucketed Outlook-style
  const allPairs = toPairs(messages)
  const pairsByBucket: Record<Bucket, QAPair[]> = { today: [], yesterday: [], week: [], month: [], older: [] }
  for (const p of allPairs) pairsByBucket[bucketOf(p.q.timestamp)].push(p)

  // Search across everything, regardless of collapse state, within the chosen range
  const query = search.trim().toLowerCase()
  const rangeDays = SEARCH_RANGES.find(r => r.id === searchRange)?.days ?? Infinity
  const rangeCutoff = rangeDays === Infinity ? 0 : (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    return d.getTime() - (rangeDays - 1) * 86400000
  })()
  const matchedPairs = query
    ? allPairs.filter(p => {
        const inRange = !rangeCutoff || (p.q.timestamp && new Date(p.q.timestamp).getTime() >= rangeCutoff)
        if (!inRange) return false
        return p.q.content.toLowerCase().includes(query) || (p.a?.content.toLowerCase().includes(query) ?? false)
      })
    : []

  const QUICK_QUESTIONS = [
    "How do I do the manding activities?",
    "Arya had a big meltdown today — what should I do?",
    "How do I explain her needs to her teacher?",
    "What are our rights for school support in Norway?",
    "She's not making progress on communication — why?",
  ]

  const fmtDate = (ts?: string) =>
    ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  const renderPair = (pair: QAPair, i: number, withDate = false) => (
    <div key={`${pair.q.timestamp}-${i}`} className="space-y-2">
      {withDate && <div className="text-xs text-gray-400 text-center pt-2">{fmtDate(pair.q.timestamp)}</div>}
      <div className="flex gap-2 justify-end">
        <div className="chat-user" style={{ whiteSpace: 'pre-wrap' }}>{pair.q.content}</div>
      </div>
      {pair.a && (
        <div className="flex gap-2 justify-start">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-sm flex-shrink-0 mt-1">🧠</div>
          <div className="chat-ai" style={{ whiteSpace: 'pre-wrap' }}>{pair.a.content}</div>
        </div>
      )}
    </div>
  )

  const historyBuckets: Bucket[] = ['older', 'month', 'week', 'yesterday']

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-sm">💬</div>
          <div className="flex-1">
            <div className="font-black text-sm text-gray-900">Ask</div>
            <div className="text-xs text-gray-400">Any question about {childName || 'your child'}&apos;s programme</div>
          </div>
          <button onClick={() => { setShowSearch(s => !s); setSearch(''); setSearchRange('all') }}
            aria-label="Search past questions"
            className={`w-11 h-11 flex items-center justify-center rounded-xl text-lg transition ${showSearch ? 'bg-violet-100' : 'hover:bg-gray-50'}`}>
            🔍
          </button>
        </div>
        {showSearch && (
          <div className="max-w-2xl mx-auto px-4 pb-3 space-y-2">
            <input value={search} onChange={e => setSearch(e.target.value)} autoFocus
              placeholder="Search your past questions and answers…"
              className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition" />
            <div className="flex gap-1.5 overflow-x-auto">
              {SEARCH_RANGES.map(r => (
                <button key={r.id} onClick={() => setSearchRange(r.id)}
                  className={`text-sm font-semibold px-3.5 py-2 rounded-full whitespace-nowrap transition ${
                    searchRange === r.id ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full px-4 py-4 space-y-3">
        {query ? (
          <>
            <div className="text-xs text-gray-400 text-center">
              {matchedPairs.length === 0
                ? 'Nothing found — try a different word or a wider date range'
                : `${matchedPairs.length} past conversation${matchedPairs.length > 1 ? 's' : ''} found`}
            </div>
            {matchedPairs.map((p, i) => renderPair(p, i, true))}
          </>
        ) : (
          <>
            {/* Collapsed history — renders only when the parent opens it */}
            {historyBuckets.map(b => {
              const bucketPairs = pairsByBucket[b]
              if (bucketPairs.length === 0) return null
              const isOpen = expanded.includes(b)
              return (
                <div key={b}>
                  <button
                    onClick={() => setExpanded(e => isOpen ? e.filter(x => x !== b) : [...e, b])}
                    className="w-full flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-4 py-3 min-h-[48px]">
                    <span className="text-gray-400 text-sm">{isOpen ? '▾' : '▸'}</span>
                    <span className="text-sm font-bold text-gray-700">{BUCKET_LABELS[b]}</span>
                    <span className="text-sm text-gray-400">· {bucketPairs.length} conversation{bucketPairs.length > 1 ? 's' : ''}</span>
                  </button>
                  {isOpen && (
                    <div className="mt-2 space-y-3">{bucketPairs.map((p, i) => renderPair(p, i, true))}</div>
                  )}
                </div>
              )
            })}

            {/* Today — always visible */}
            {pairsByBucket.today.length === 0 && !loading && (
              <div className="flex gap-2 justify-start">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-sm flex-shrink-0 mt-1">🧠</div>
                <div className="chat-ai" style={{ whiteSpace: 'pre-wrap' }}>
                  {allPairs.length > 0
                    ? `Hi again! Your earlier conversations are collected above. What's on your mind today?`
                    : "Hi! I'm here to help with any questions about your child's programme. What's on your mind?"}
                </div>
              </div>
            )}
            {pairsByBucket.today.map((p, i) => renderPair(p, i))}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-sm">🧠</div>
                <div className="chat-ai flex items-center gap-1.5 py-3">
                  <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Quick questions */}
      {allPairs.length === 0 && !query && !loading && (
        <div className="max-w-2xl mx-auto w-full px-4 pb-2">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Common questions</div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_QUESTIONS.map(q => (
              <button key={q} onClick={() => { setInput(q); }}
                className="text-sm text-violet-600 bg-violet-50 border border-violet-100 hover:bg-violet-100 px-3 py-2 rounded-full transition">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border-t border-gray-100 flex-shrink-0 mb-[60px]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex gap-2">
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask anything about the programme…" rows={2}
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition" />
          <button onClick={send} disabled={loading || !input.trim()}
            className="px-4 self-end py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition min-h-[44px]">
            Send
          </button>
        </div>
      </div>

      <TabBar childId={childId} />
    </div>
  )
}

export default function AIPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading…</div>}>
      <AIChatContent />
    </Suspense>
  )
}
