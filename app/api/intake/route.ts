import { NextRequest, NextResponse } from 'next/server'
import { INTAKE_AGENT_PROMPT } from '@/lib/agents/prompts'
import type { ChatMessage } from '@/types'

export async function POST(req: NextRequest) {
  const { messages, childContext, confidence } = await req.json()

  // Build conversation history
  const apiMessages = (messages as ChatMessage[])
    .slice(-24)
    .reduce((acc: { role: string; content: string }[], msg) => {
      if (acc.length === 0 && msg.role === 'assistant') return acc
      const lastRole = acc.at(-1)?.role
      if (lastRole === msg.role) return acc
      return [...acc, { role: msg.role, content: msg.content }]
    }, [])

  if (!apiMessages.length) {
    return NextResponse.json({ text: "I'm ready to begin. Could you tell me a little about your child?" })
  }

  const confidenceContext = confidence
    ? `\nCurrent domain confidence: ${JSON.stringify(confidence)}\nContinue interviewing to raise all domains to ≥80%. After each response, output a JSON block with confidence updates and ready_for_synthesis flag: {"confidence_update": {"domain": newValue, ...}, "ready_for_synthesis": false}`
    : ''

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: `${INTAKE_AGENT_PROMPT}\n\n${childContext || ''}${confidenceContext}`,
        messages: apiMessages,
      }),
    })

    const data = await res.json()
    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || 'Sorry, I had trouble with that. Please try again.'
    return NextResponse.json({ text })
  } catch (err) {
    console.error('Intake API error:', err)
    return NextResponse.json({ text: 'I had a connection issue. Please try again.' }, { status: 500 })
  }
}
