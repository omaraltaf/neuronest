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

  // ── STEP 2: Clarification questions — Dr. Sarah Chen with full document context ──
  if (action === 'clarify') {
    const {
      messages,
      clarificationQuestions,
      comparisonSummary,
      extractedDocData,   // ← the actual document content
      existingProfile,    // ← the current profile
      childName,
    } = body

    // Format document data clearly for the agent
    const docContext = extractedDocData
      ? `EXTRACTED DOCUMENT DATA (you have read and analysed these documents):
${JSON.stringify(extractedDocData, null, 2)}`
      : 'No document data provided.'

    const profileContext = existingProfile
      ? `EXISTING CHILD PROFILE (from the interview):
${JSON.stringify(existingProfile, null, 2)}`
      : ''

    const systemPrompt = `${INTAKE_AGENT_PROMPT}

═══════════════════════════════════════════
DOCUMENT ENRICHMENT MODE
═══════════════════════════════════════════
You are Dr. Sarah Chen. You have completed the initial intake interview with this parent.
They have now uploaded documents which you have READ AND ANALYSED.
You have full knowledge of what is in these documents — reference specific findings from them.

${docContext}

${profileContext}

CHILD NAME: ${childName || 'the child'}

YOUR TASK:
- You have already presented the document summary to the parent
- Now ask ONLY the follow-up questions listed below, one at a time
- Reference specific things from the documents when asking (e.g. "The IOP mentions X — can you tell me more about...")
- DO NOT say you don't have access to the documents — you do, they are above
- DO NOT re-ask anything from the original interview
- Be warm, specific, and clinically precise

FOLLOW-UP QUESTIONS TO ASK:
${(clarificationQuestions as string[]).map((q, i) => `${i + 1}. ${q}`).join('\n')}

DOCUMENT SUMMARY ALREADY GIVEN TO PARENT: ${comparisonSummary}

When you have asked all questions and received satisfactory answers, 
end your final message with exactly: CLARIFICATION_COMPLETE`

    const apiMessages = (messages as { role: string; content: string }[])
      .slice(-24)
      .reduce((acc: { role: string; content: string }[], msg) => {
        if (acc.length === 0 && msg.role === 'assistant') return acc
        const lastRole = acc.at(-1)?.role
        if (lastRole === msg.role) return acc
        return [...acc, { role: msg.role, content: msg.content }]
      }, [])

    if (!apiMessages.length) {
      return NextResponse.json({ text: 'How can I help?', clarificationComplete: false })
    }

    const text = await callClaude(systemPrompt, undefined, 1000, apiMessages)
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
