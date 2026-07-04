import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SESSION_COACH_PROMPT } from '@/lib/agents/prompts'

// Parent Coaching Loop (CLAUDE.md §5.4). Called right after a session is logged with a
// low rating (1-2): returns one empathy line, one diagnostic follow-up question, and one
// technique adjustment from Dr. Eriksson — in the moment, while the parent is still there.
// The parent's answer to the question is appended to the session log's notes by the client,
// where the check-in and weekly-planning agents pick it up.

const COACHING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['empathy', 'follow_up_question', 'technique_adjustment', 'pattern_insight'],
  properties: {
    empathy: { type: 'string', description: '1-2 sentences, specific to what was logged' },
    follow_up_question: { type: 'string', description: 'The single most diagnostic question, answerable in one sentence' },
    technique_adjustment: { type: 'string', description: 'One small concrete change to HOW, executable tonight' },
    pattern_insight: { type: 'string', description: 'Named pattern across recent sessions, or empty string if none' },
  },
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ coaching: null }, { status: 401 })

  const { childId, goalId, rating, notes } = await req.json()
  if (!childId || !rating) return NextResponse.json({ coaching: null }, { status: 400 })

  const [{ data: child }, { data: goal }, { data: recentLogs }] = await Promise.all([
    supabase.from('children').select('id, name, interests, language').eq('id', childId).maybeSingle(),
    goalId
      ? supabase.from('goals').select('label, area, approach, target_criterion, activities').eq('id', goalId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('session_logs').select('rating, notes, logged_at')
      .eq('child_id', childId)
      .gte('logged_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('logged_at', { ascending: false })
      .limit(15),
  ])
  if (!child) return NextResponse.json({ coaching: null }, { status: 404 })

  const context = `
--- CHILD ---
${JSON.stringify(child)}

--- THE GOAL BEING PRACTISED ---
${JSON.stringify(goal || 'general practice, no specific goal')}

--- THE SESSION JUST LOGGED (this is the hard one) ---
${JSON.stringify({ rating, notes: notes || '(no note)', logged_at: new Date().toISOString() })}

--- RECENT SESSION HISTORY, LAST 30 DAYS (check for patterns) ---
${JSON.stringify(recentLogs || [])}
`.trim()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.SESSION_COACH_MODEL || 'claude-opus-4-8',
      max_tokens: 1500,
      system: SESSION_COACH_PROMPT,
      messages: [{ role: 'user', content: context }],
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: COACHING_SCHEMA },
      },
    }),
  })

  if (!response.ok) {
    console.error('coaching generation failed:', await response.text())
    return NextResponse.json({ coaching: null })
  }

  const result = await response.json()
  if (result.stop_reason === 'refusal') return NextResponse.json({ coaching: null })
  const text = result.content?.find((b: { type: string }) => b.type === 'text')?.text
  if (!text) return NextResponse.json({ coaching: null })

  return NextResponse.json({ coaching: JSON.parse(text) })
}

export const maxDuration = 60
