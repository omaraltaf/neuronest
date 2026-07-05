'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import TabBar from '@/components/TabBar'
import type { ChatMessage } from '@/types'

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

function AIChatContent() {
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const supabase = createClient()

  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: "Hi! I'm here to help with any questions about your child's programme. What's on your mind?",
    timestamp: new Date().toISOString(),
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [childName, setChildName] = useState('')
  const [profileContext, setProfileContext] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (!childId) return
    const load = async () => {
      const [{ data: child }, { data: profile }, { data: goals }] = await Promise.all([
        supabase.from('children').select('name').eq('id', childId).single(),
        supabase.from('child_profiles').select('profile_data, priority_matrix').eq('child_id', childId).eq('is_current', true).maybeSingle(),
        supabase.from('goals').select('label, area, status').eq('child_id', childId),
      ])
      if (child) setChildName(child.name)
      const ctx = [
        child ? `Child: ${child.name}` : '',
        profile?.profile_data ? `Profile snapshot: ${JSON.stringify(profile.profile_data).slice(0, 800)}` : '',
        goals?.length ? `Active goals: ${goals.map(g => `${g.label} (${g.area}, ${g.status})`).join(', ')}` : '',
      ].filter(Boolean).join('\n')
      setProfileContext(ctx)
    }
    load()
  }, [childId]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!input.trim() || loading) return
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
    setMessages(prev => [...prev, { role: 'assistant', content: text, timestamp: new Date().toISOString() }])
    setLoading(false)
  }

  const QUICK_QUESTIONS = [
    "How do I do the manding activities?",
    "Arya had a big meltdown today — what should I do?",
    "How do I explain her needs to her teacher?",
    "What are our rights for school support in Norway?",
    "She's not making progress on communication — why?",
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100 flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-sm">💬</div>
          <div>
            <div className="font-black text-sm text-gray-900">Ask</div>
            <div className="text-xs text-gray-400">Any question about {childName || 'your child'}&apos;s programme</div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full px-4 py-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-sm flex-shrink-0 mt-1">🧠</div>
            )}
            <div className={msg.role === 'user' ? 'chat-user' : 'chat-ai'} style={{ whiteSpace: 'pre-wrap' }}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-sm">🧠</div>
            <div className="chat-ai flex items-center gap-1.5 py-3">
              <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick questions */}
      {messages.length <= 1 && (
        <div className="max-w-2xl mx-auto w-full px-4 pb-2">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Common questions</div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_QUESTIONS.map(q => (
              <button key={q} onClick={() => { setInput(q); }}
                className="text-xs text-violet-600 bg-violet-50 border border-violet-100 hover:bg-violet-100 px-3 py-1.5 rounded-full transition">
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
