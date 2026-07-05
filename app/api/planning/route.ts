import { NextRequest, NextResponse } from 'next/server'
import { resolveModel } from '@/lib/agents/models'
import { PLANNING_AGENT_PROMPT } from '@/lib/agents/prompts'
import type { ChatMessage } from '@/types'

function extractPlanAndMessage(text: string): { plan: Record<string, unknown> | null; message: string } {
  // Method 1: explicit delimiter
  if (text.includes('---PLAN_JSON---')) {
    const parts = text.split('---PLAN_JSON---')
    const message = parts[0].trim()
    const jsonPart = parts[1]?.split('---END_PLAN---')[0]?.trim() || ''
    try {
      return { plan: JSON.parse(jsonPart), message }
    } catch {}
  }

  // Method 2: ```json fenced block
  const fenceMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (fenceMatch) {
    try {
      const plan = JSON.parse(fenceMatch[1])
      const message = text.replace(/```json[\s\S]*?```/g, '').trim()
      return { plan, message }
    } catch {}
  }

  // Method 3: find first { that starts a goals object
  const jsonStart = text.indexOf('{\n  "overview"') !== -1
    ? text.indexOf('{\n  "overview"')
    : text.indexOf('{"overview"')
  if (jsonStart !== -1) {
    // Find matching closing brace
    let depth = 0
    let end = -1
    for (let i = jsonStart; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break } }
    }
    if (end !== -1) {
      try {
        const plan = JSON.parse(text.slice(jsonStart, end + 1))
        const message = (text.slice(0, jsonStart) + text.slice(end + 1)).trim()
        return { plan, message }
      } catch {}
    }
  }

  // No JSON found — pure conversational message
  return { plan: null, message: text.trim() }
}

export async function POST(req: NextRequest) {
  const { childContext, childName, action, messages, currentPlan } = await req.json()

  const JSON_INSTRUCTION = `
CRITICAL OUTPUT FORMAT:
When you output a plan (new or revised), structure your response EXACTLY like this:
[Your conversational message to the parent here — warm, clear, no JSON]

---PLAN_JSON---
{
  "overview": "...",
  "phases": [...],
  "goals": [...],
  "parent_priorities_addressed": [...]
}
---END_PLAN---

The conversational message MUST come BEFORE the JSON block.
NEVER mix JSON and conversation. NEVER output raw JSON without the delimiters.
If you are only asking a question (no plan yet), output ONLY the question — no JSON block at all.`

  if (action === 'generate') {
    const userContent = `${childContext}

Generate the intervention plan for ${childName} now.

The parent context above contains everything — the intake interview, priority matrix, root causes, profile corrections. You know their priorities already.

DO NOT ask what their priorities are. You have them.

Open with ONE warm sentence referencing something specific from the context (e.g. the top priority from the matrix, or something mentioned in the intake). Then immediately present the plan.

Use the ---PLAN_JSON--- format. After the plan, ask: "Does this address what you experience day to day? What feels missing?"`

    try {
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
          max_tokens: 3000,
          system: `${PLANNING_AGENT_PROMPT}\n\n${JSON_INSTRUCTION}`,
          messages: [{ role: 'user', content: userContent }],
        }),
      })
      const data = await res.json()
      const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || ''
      const { plan, message } = extractPlanAndMessage(text)
      return NextResponse.json({ plan: plan || {}, message, planApproved: false })
    } catch (err) {
      console.error('Planning generate error:', err)
      return NextResponse.json({ plan: {}, message: 'Plan generation failed. Please try again.', planApproved: false }, { status: 500 })
    }
  }

  // Feedback iteration
  const history = (messages as ChatMessage[]).slice(-20).reduce(
    (acc: { role: string; content: string }[], msg) => {
      if (acc.length === 0 && msg.role === 'assistant') return acc
      const lastRole = acc.at(-1)?.role
      if (lastRole === msg.role) return acc
      return [...acc, { role: msg.role, content: msg.content }]
    }, []
  )

  if (!history.length) {
    return NextResponse.json({ plan: currentPlan || {}, message: 'Please tell me about your priorities.', planApproved: false })
  }

  const systemPrompt = `${PLANNING_AGENT_PROMPT}\n\n${JSON_INSTRUCTION}

Current plan (if any): ${currentPlan ? JSON.stringify(currentPlan) : 'Not yet generated'}
${childContext}

Instructions:
- If the parent has just told you their priorities and no plan exists yet, NOW generate the full personalised plan.
- If the parent is giving feedback on an existing plan, revise it and present the updated version.
- If the parent expresses satisfaction ("yes", "looks good", "this is good", "approved", "happy"), respond warmly and output PLAN_APPROVED: true on a line by itself (no JSON needed).
- Always ask: "Does this plan address your main concerns? What feels missing?" after presenting a plan.`

  try {
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
        max_tokens: 4000,
        system: systemPrompt,
        messages: history,
      }),
    })
    const data = await res.json()
    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || ''

    const planApproved = text.includes('PLAN_APPROVED: true')
    const cleanText = text.replace('PLAN_APPROVED: true', '').trim()
    const { plan: extractedPlan, message } = extractPlanAndMessage(cleanText)
    const updatedPlan = extractedPlan || currentPlan || {}

    return NextResponse.json({ plan: updatedPlan, message, planApproved })
  } catch (err) {
    console.error('Planning feedback error:', err)
    return NextResponse.json({ plan: currentPlan || {}, message: 'Something went wrong. Please try again.', planApproved: false }, { status: 500 })
  }
}
