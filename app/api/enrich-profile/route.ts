import { NextRequest, NextResponse } from 'next/server'
import { INTAKE_AGENT_PROMPT } from '@/lib/agents/prompts'

const COMPARE_SYSTEM = `You are a clinical profile synthesis specialist for ASD assessments. 
Compare newly extracted document data against an existing child profile.
Return ONLY valid JSON — no markdown, no explanation.`

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  // ── STEP 1: Compare document data vs existing profile ──
  if (action === 'compare') {
    const { existingProfile, extractedDocData, childName } = body

    const prompt = `Compare this newly extracted document data against an existing child profile.

EXISTING PROFILE:
${JSON.stringify(existingProfile, null, 2)}

NEWLY EXTRACTED DOCUMENT DATA:
${JSON.stringify(extractedDocData, null, 2)}

CHILD NAME: ${childName || 'the child'}

Return JSON:
{
  "new_information": {
    "communication": "new finding not already in profile, or null",
    "social": "...",
    "sensory": "...",
    "behaviour": "...",
    "motor": "...",
    "cognition": "...",
    "family_context": "...",
    "strengths": "..."
  },
  "conflicts": [
    { "section": "...", "existing": "...", "document_says": "...", "needs_clarification": true }
  ],
  "clarification_questions": [
    "Only questions arising from THIS document that were not covered in the interview. Empty array if none needed."
  ],
  "profile_updates": {
    "communication": { ...updated section merging existing + new, or null if no change },
    "social": null,
    "sensory": null,
    "behaviour": null,
    "motor": null,
    "cognition": null,
    "family_context": null,
    "strengths": null
  },
  "summary_for_parent": "One warm sentence explaining what the document added."
}`

    const res = await callClaude(COMPARE_SYSTEM, prompt, 2000)
    try {
      const clean = res.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      return NextResponse.json({ comparison: JSON.parse(clean) })
    } catch {
      return NextResponse.json({ comparison: null, error: 'Parse failed', raw: res })
    }
  }

  // ── STEP 2: Clarification questions from Dr. Sarah Chen ──
  if (action === 'clarify') {
    const { messages, clarificationQuestions, comparisonSummary } = body

    const systemPrompt = `${INTAKE_AGENT_PROMPT}

IMPORTANT — DOCUMENT ENRICHMENT MODE:
A new document was uploaded AFTER the initial interview was already completed.
DO NOT re-ask anything from the original interview.
ONLY ask the specific follow-up questions listed below, one at a time.

QUESTIONS FROM DOCUMENT: ${JSON.stringify(clarificationQuestions)}
DOCUMENT SUMMARY: ${comparisonSummary}

When you have asked all questions and received answers, end with exactly: CLARIFICATION_COMPLETE`

    const apiMessages = (messages as { role: string; content: string }[])
      .slice(-20)
      .reduce((acc: { role: string; content: string }[], msg) => {
        if (acc.length === 0 && msg.role === 'assistant') return acc
        const lastRole = acc.at(-1)?.role
        if (lastRole === msg.role) return acc
        return [...acc, { role: msg.role, content: msg.content }]
      }, [])

    if (!apiMessages.length) {
      return NextResponse.json({ text: 'How can I help?', clarificationComplete: false })
    }

    const text = await callClaude(systemPrompt, undefined, 800, apiMessages)
    const clarificationComplete = text.includes('CLARIFICATION_COMPLETE')
    const displayText = text.replace('CLARIFICATION_COMPLETE', '').trim()

    return NextResponse.json({ text: displayText, clarificationComplete })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

async function callClaude(
  system: string,
  userContent?: string,
  maxTokens = 1000,
  messages?: { role: string; content: string }[]
): Promise<string> {
  const apiMessages = messages || (userContent ? [{ role: 'user', content: userContent }] : [])
  if (!apiMessages.length) return ''

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: apiMessages,
    }),
  })

  const data = await res.json()
  return data.content?.find((c: { type: string }) => c.type === 'text')?.text || ''
}
