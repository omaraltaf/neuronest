import { NextRequest, NextResponse } from 'next/server'
import { PLANNING_AGENT_PROMPT } from '@/lib/agents/prompts'
import type { ChatMessage } from '@/types'

export async function POST(req: NextRequest) {
  const { childContext, childName, action, messages, currentPlan } = await req.json()

  let systemPrompt = PLANNING_AGENT_PROMPT
  let userContent = ''

  if (action === 'generate') {
    userContent = `${childContext}

Please generate the initial personalised intervention plan for ${childName}.

First, ask me: "Before I create the plan, I want to make sure I address what matters most to your family. What are the 2-3 things that most affect your daily life right now?"

Then output the plan as JSON in this format:
{
  "overview": "2-3 sentence plan overview",
  "phases": [{"number": 1, "title": "...", "weeks": "1-4", "focus": "...", "goals": ["goal labels"]}],
  "goals": [
    {
      "id": "unique_id",
      "area": "communication/social/sensory/motor/cognition/behaviour/school",
      "label": "Parent-friendly goal name",
      "rationale": "Why this goal for this child specifically",
      "root_cause_addressed": "Which underlying mechanism this targets",
      "approach": "Specific methodology (e.g. Progressive time delay + mand training)",
      "baseline": "What the child is doing NOW",
      "target_criterion": "Observable measurable target (X/Y trials, Z settings, N people)",
      "timeline_weeks": 12,
      "evidence_base": "Author, Year",
      "activities": [],
      "generalisation_plan": "How skill moves from training to natural use",
      "dependencies": []
    }
  ],
  "parent_priorities_addressed": ["list of parent concerns this plan addresses"]
}

Then after the JSON, in plain text, present the plan to the parent warmly and ask: "Does this address your main concerns? Is there anything missing?"

Format: JSON block first, then conversational message.`
  } else {
    // Feedback iteration
    const history = (messages as ChatMessage[]).slice(-16).reduce(
      (acc: { role: string; content: string }[], msg) => {
        if (acc.length === 0 && msg.role === 'assistant') return acc
        const lastRole = acc.at(-1)?.role
        if (lastRole === msg.role) return acc
        return [...acc, { role: msg.role, content: msg.content }]
      }, []
    )

    systemPrompt = `${PLANNING_AGENT_PROMPT}

Current plan: ${JSON.stringify(currentPlan)}

${childContext}

The parent is giving feedback on the plan. Listen carefully, identify what's missing or not addressed, revise the plan accordingly, and present the revision. 

If the parent expresses satisfaction (says "yes", "looks good", "this addresses it", "approved", "happy with it", or similar), output PLAN_APPROVED: true at the start of your response, then congratulate them warmly.

When revising, output updated JSON first, then your conversational message.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        system: systemPrompt,
        messages: history,
      }),
    })
    const data = await res.json()
    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || ''

    const planApproved = text.includes('PLAN_APPROVED: true')
    // Extract JSON if present
    let updatedPlan = currentPlan
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*?"goals"[\s\S]*?\})/)
    if (jsonMatch) {
      try { updatedPlan = JSON.parse(jsonMatch[1] || jsonMatch[0]) } catch {}
    }
    // Clean message
    const message = text
      .replace(/PLAN_APPROVED:\s*true/g, '')
      .replace(/```json[\s\S]*?```/g, '')
      .trim()

    return NextResponse.json({ plan: updatedPlan, message, planApproved })
  }

  // Initial generation
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
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    })
    const data = await res.json()
    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || ''

    let plan = {}
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/(\{[\s\S]*?"goals"[\s\S]*?\})/)
    if (jsonMatch) {
      try { plan = JSON.parse(jsonMatch[1] || jsonMatch[0]) } catch {}
    }
    const message = text.replace(/```json[\s\S]*?```/g, '').trim()
    return NextResponse.json({ plan, message, planApproved: false })
  } catch (err) {
    console.error('Planning API error:', err)
    return NextResponse.json({ plan: {}, message: 'Plan generation failed. Please try again.', planApproved: false }, { status: 500 })
  }
}
