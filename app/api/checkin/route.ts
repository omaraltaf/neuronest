import { NextRequest, NextResponse } from 'next/server'
import { PROGRESS_AGENT_PROMPT } from '@/lib/agents/prompts'
import type { ChatMessage } from '@/types'

export async function POST(req: NextRequest) {
  const { messages, childName, weekNumber, action } = await req.json()

  const system = `${PROGRESS_AGENT_PROMPT}

Child: ${childName}
Week: ${weekNumber}

When the check-in is complete (you have covered wellbeing, wins, goal review, and given recommendations), end with CHECKIN_COMPLETE on its own line, then output JSON:
{"wins":["..."],"challenges":["..."],"recommendations":["..."]}`

  const apiMessages = (messages as ChatMessage[]).slice(-20).reduce(
    (acc: { role: string; content: string }[], msg) => {
      if (acc.length === 0 && msg.role === 'assistant') return acc
      const lastRole = acc.at(-1)?.role
      if (lastRole === msg.role) return acc
      return [...acc, { role: msg.role, content: msg.content }]
    }, []
  )

  if (!apiMessages.length) return NextResponse.json({ text: 'Ready to begin.', checkinComplete: false })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1200, system, messages: apiMessages }),
  })

  const data = await res.json()
  const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || ''

  const checkinComplete = text.includes('CHECKIN_COMPLETE')
  let summary = null
  let displayText = text.replace('CHECKIN_COMPLETE', '').trim()

  if (checkinComplete) {
    const jsonMatch = displayText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try { summary = JSON.parse(jsonMatch[0]) } catch {}
      displayText = displayText.replace(/\{[\s\S]*\}/, '').trim()
    }
  }

  return NextResponse.json({ text: displayText, checkinComplete, summary })
}
