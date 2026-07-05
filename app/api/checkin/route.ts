import { NextRequest, NextResponse } from 'next/server'
import { resolveModel } from '@/lib/agents/models'
import { PROGRESS_AGENT_PROMPT } from '@/lib/agents/prompts'
import type { ChatMessage } from '@/types'

function cleanCheckinResponse(text: string): { displayText: string; summary: Record<string, unknown> | null } {
  let displayText = text.replace('CHECKIN_COMPLETE', '').trim()
  let summary: Record<string, unknown> | null = null

  // Extract JSON summary if present
  const jsonMatch = displayText.match(/\{[\s\S]*?"wins"[\s\S]*?\}/)
  if (jsonMatch) {
    try { summary = JSON.parse(jsonMatch[0]) } catch {}
  }

  // Strip ALL JSON and code fences from display text
  displayText = displayText
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\{[\s\S]*?"wins"[\s\S]*?\}/g, '')
    .replace(/\{[\s\S]*?"recommendations"[\s\S]*?\}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { displayText, summary }
}

export async function POST(req: NextRequest) {
  const { messages, childName, weekNumber } = await req.json()

  const system = `${PROGRESS_AGENT_PROMPT}

Child: ${childName}
Week: ${weekNumber}

OUTPUT FORMAT — CRITICAL:
- All conversational responses must be plain text only — no JSON, no backticks, no code blocks
- When the check-in is complete (wellbeing, wins, goal review, recommendations all covered), output EXACTLY this structure:
  CHECKIN_COMPLETE
  {"wins":[...],"challenges":[...],"recommendations":[...]}
- Everything before CHECKIN_COMPLETE must be plain conversational text only`

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
    body: JSON.stringify({
      model: await resolveModel('standard'),
      thinking: { type: 'disabled' },
      max_tokens: 1200,
      system,
      messages: apiMessages,
    }),
  })

  const data = await res.json()
  const rawText = data.content?.find((c: { type: string }) => c.type === 'text')?.text || ''

  const checkinComplete = rawText.includes('CHECKIN_COMPLETE')
  const { displayText, summary } = cleanCheckinResponse(rawText)

  return NextResponse.json({ text: displayText, checkinComplete, summary })
}
