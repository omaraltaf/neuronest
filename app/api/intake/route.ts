import { NextRequest, NextResponse } from 'next/server'
import { INTAKE_AGENT_PROMPT } from '@/lib/agents/prompts'
import type { ChatMessage } from '@/types'

function cleanResponse(text: string): string {
  return text
    // Remove full JSON objects containing confidence_update
    .replace(/\{[^{}]*"confidence_update"[^{}]*\{[^{}]*\}[^{}]*\}/g, '')
    // Remove inline ready_for_synthesis markers
    .replace(/,?\s*"ready_for_synthesis"\s*:\s*(true|false)\s*\}?/g, '')
    // Remove any remaining confidence_update fragments
    .replace(/\{[^{}]*"confidence_update"[^{}]*\}/g, '')
    // Remove markdown json blocks
    .replace(/```json[\s\S]*?```/g, '')
    // Clean up stray trailing commas before closing braces
    .replace(/,\s*\}(\s*)$/gm, '$1')
    .trim()
}

export async function POST(req: NextRequest) {
  const { messages, childContext, confidence } = await req.json()

  const apiMessages = (messages as ChatMessage[])
    .slice(-24)
    .reduce((acc: { role: string; content: string }[], msg) => {
      if (acc.length === 0 && msg.role === 'assistant') return acc
      const lastRole = acc.at(-1)?.role
      if (lastRole === msg.role) return acc
      return [...acc, { role: msg.role, content: msg.content }]
    }, [])

  if (!apiMessages.length) {
    return NextResponse.json({
      text: "I'm ready to begin.",
      confidence_update: null,
      ready_for_synthesis: false,
    })
  }

  const confidenceContext = confidence
    ? `\nCurrent domain confidence: ${JSON.stringify(confidence)}
IMPORTANT: After your conversational response, append EXACTLY this JSON on a new line (no markdown, no backticks):
{"confidence_update":{"communication":X,"social":X,"sensory":X,"behaviour":X,"motor":X,"cognition":X,"family_context":X,"strengths":X},"ready_for_synthesis":false}
Replace X with updated confidence values 0-100. Set ready_for_synthesis to true only when ALL domains are ≥80.`
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
    const rawText = data.content?.find((c: { type: string }) => c.type === 'text')?.text || ''

    // Extract confidence update before cleaning
    let confidenceUpdate = null
    let readyForSynthesis = false

    const jsonMatch = rawText.match(/\{"confidence_update"\s*:\s*(\{[^}]+\})\s*,\s*"ready_for_synthesis"\s*:\s*(true|false)\s*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        confidenceUpdate = parsed.confidence_update
        readyForSynthesis = parsed.ready_for_synthesis === true
      } catch {}
    }

    // Clean the display text
    const displayText = cleanResponse(rawText)

    return NextResponse.json({
      text: displayText,
      confidence_update: confidenceUpdate,
      ready_for_synthesis: readyForSynthesis,
    })
  } catch (err) {
    console.error('Intake API error:', err)
    return NextResponse.json({
      text: 'I had a connection issue. Please try again.',
      confidence_update: null,
      ready_for_synthesis: false,
    }, { status: 500 })
  }
}
