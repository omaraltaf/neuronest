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

function CheckinContent() {
  const params = useSearchParams()
  const router = useRouter()
  const childId = params.get('child') || ''
  const supabase = createClient()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [checkinId, setCheckinId] = useState<string | null>(null)
  const [childName, setChildName] = useState('')
  const [weekNumber, setWeekNumber] = useState(1)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (!childId) return
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: child }, { data: appState }, { data: goals }] = await Promise.all([
        supabase.from('children').select('name').eq('id', childId).single(),
        supabase.from('app_state').select('*').eq('child_id', childId).maybeSingle(),
        supabase.from('goals').select('id, label, area, status').eq('child_id', childId).neq('status', 'achieved'),
      ])

      if (child) setChildName(child.name)
      const week = appState?.current_week || 1
      setWeekNumber(week)

      // Check for in-progress checkin
      const { data: existing } = await supabase.from('weekly_checkins')
        .select('*').eq('child_id', childId).is('completed_at', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()

      if (existing && Array.isArray(existing.messages) && existing.messages.length > 0) {
        setCheckinId(existing.id)
        setMessages(existing.messages as ChatMessage[])
        setInitializing(false)
        return
      }

      // Start new checkin
      const { data: newCheckin } = await supabase.from('weekly_checkins').insert({
        child_id: childId, user_id: user.id,
        week_number: week, messages: [],
      }).select().single()

      if (newCheckin) setCheckinId(newCheckin.id)

      // Dr. Eriksson opens
      const goalList = goals?.map(g => `- ${g.label} (${g.area})`).join('\n') || 'No active goals'
      const openingRes = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Begin week ${week} check-in for ${child?.name}. Active goals:\n${goalList}` }],
          childName: child?.name, weekNumber: week, action: 'open',
        }),
      })
      const { text } = await openingRes.json()
      const aiMsg: ChatMessage = { role: 'assistant', content: cleanMessage(text), timestamp: new Date().toISOString() }
      setMessages([aiMsg])

      if (newCheckin) {
        await supabase.from('weekly_checkins').update({ messages: [aiMsg] }).eq('id', newCheckin.id)
      }
      setInitializing(false)
    }
    init()
  }, [childId]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!input.trim() || loading) return
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
        ...(checkinComplete ? { completed_at: new Date().toISOString(), wins: summary?.wins || [], challenges: summary?.challenges || [], recommendations: summary?.recommendations || [] } : {}),
      }).eq('id', checkinId)
    }

    if (checkinComplete) {
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
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-lg">←</Link>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center text-sm">👩‍⚕️</div>
          <div>
            <div className="font-black text-sm text-gray-900">Week {weekNumber} Check-in</div>
            <div className="text-[10px] text-gray-400">Dr. Lena Eriksson · Progress Review</div>
          </div>
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
    </div>
  )
}

export default function CheckinPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading…</div>}>
      <CheckinContent />
    </Suspense>
  )
}
