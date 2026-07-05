import { NextRequest, NextResponse } from 'next/server'
import { resolveModel } from '@/lib/agents/models'
import { PROFILE_AGENT_PROMPT } from '@/lib/agents/prompts'

export async function POST(req: NextRequest) {
  const { childContext, childName } = await req.json()

  const prompt = `${childContext}

Please generate a comprehensive child profile for ${childName} based on all the intake information above.

Output the profile as a JSON object with these exact keys:
{
  "snapshot": "2-3 sentence strengths-first overview readable by parents",
  "communication": {
    "summary": "...",
    "current_level": "...",
    "root_cause": "...",
    "strengths": ["..."],
    "challenges": ["..."],
    "targets": ["..."],
    "echolalia_analysis": "..."
  },
  "social": { "summary": "...", "root_cause": "...", "strengths": [...], "challenges": [...], "what_works": "..." },
  "sensory": { "summary": "...", "profile_type": "seeking/avoiding/mixed", "root_cause": "...", "modalities": {...}, "regulation_strategies": [...] },
  "behaviour": { "summary": "...", "root_cause": "...", "key_behaviours": [...], "triggers": [...], "de_escalation": [...] },
  "motor": { "summary": "...", "gross_motor": "...", "fine_motor": "...", "strengths": [...] },
  "cognition": { "summary": "...", "cognitive_level": "...", "verbal_nonverbal_gap": "...", "learning_style": "...", "strengths": [...] },
  "family_context": { "summary": "...", "support_factors": [...], "complicating_factors": [...], "parental_stress_level": "low/medium/high" },
  "root_causes": { "communication": "...", "social": "...", "sensory": "...", "behaviour": "...", "motor": "...", "cognition": "..." },
  "strength_map": {
    "strengths": [
      { "label": "...", "description": "...", "leverage": "how to use this as a learning scaffold" }
    ]
  },
  "priority_matrix": [
    { "rank": 1, "area": "...", "label": "...", "rationale": "...", "urgency": "high/medium/low" },
    { "rank": 2, ... },
    { "rank": 3, ... }
  ],
  "hypotheses": [
    { "if": "...", "then": "...", "because": "..." }
  ]
}

Return ONLY valid JSON, no markdown, no explanation.`

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
        system: PROFILE_AGENT_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await res.json()
    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || '{}'

    let profile
    try {
      // Strip markdown fences if present
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      profile = JSON.parse(clean)
    } catch {
      // If JSON parse fails, wrap as summary
      profile = { snapshot: text, raw: true }
    }

    return NextResponse.json({ profile })
  } catch (err) {
    console.error('Profile API error:', err)
    return NextResponse.json({ profile: { snapshot: 'Profile generation failed. Please try again.' } }, { status: 500 })
  }
}
