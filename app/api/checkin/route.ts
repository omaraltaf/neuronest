import { NextRequest, NextResponse } from 'next/server'
import { resolveModel } from '@/lib/agents/models'
import { createClient } from '@/lib/supabase/server'
import { PROGRESS_AGENT_PROMPT, QUICK_CHECKIN_PROMPT } from '@/lib/agents/prompts'
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


// The 60-second check-in (UX_PLAN Round 3, P3). Same summary contract as the
// conversation, one call instead of 13-19 turns. Structured output so the fields the
// weekly planner reads can never come back malformed — including parent_wellbeing,
// goal_assessments and escalation_flags, which the chat path asks for but has never
// actually persisted (all NULL in production before 2026-08-23).
const QUICK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['wins', 'challenges', 'recommendations', 'goal_assessments', 'escalation_flags', 'plan_adjustment_needed', 'reflection'],
  properties: {
    wins: { type: 'array', items: { type: 'string' }, description: "What genuinely went well, in the parent's framing, enriched with real data" },
    challenges: { type: 'array', items: { type: 'string' }, description: 'What was hard, named plainly and without blame' },
    recommendations: { type: 'array', items: { type: 'string' }, description: '1-3 concrete, technique-coaching actions for next week' },
    goal_assessments: {
      type: 'array',
      description: 'Only goals there is genuine evidence about — omit the rest',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['goal_id', 'goal_label', 'signal', 'evidence'],
        properties: {
          goal_id: { type: 'string' },
          goal_label: { type: 'string' },
          signal: { type: 'string', enum: ['progressing', 'stuck', 'ready_to_advance', 'not_practised'] },
          evidence: { type: 'string' },
        },
      },
    },
    escalation_flags: { type: 'array', items: { type: 'string' }, description: 'Genuine needs-a-human signals only; almost always empty' },
    plan_adjustment_needed: { type: 'boolean' },
    reflection: { type: 'string', description: "2-4 warm sentences shown to the parent, quoting their own words" },
  },
}

async function quickCheckin(childId: string, childName: string, weekNumber: number, answers: Record<string, unknown>, calendarBlock: string) {
  const supabase = createClient()
  const since = new Date(Date.now() - 14 * 86400000).toISOString()
  const [{ data: goals }, { data: logs }, { data: focus }, { data: previous }] = await Promise.all([
    supabase.from('goals').select('id, label, area, status, target_criterion').eq('child_id', childId).neq('status', 'achieved'),
    supabase.from('session_logs').select('activity_title, rating, notes, logged_at, goal_id').eq('child_id', childId).gte('logged_at', since).order('logged_at', { ascending: false }),
    supabase.from('weekly_focus').select('focus_data, week_start').eq('child_id', childId).order('week_start', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('weekly_checkins').select('week_number, wins, challenges, recommendations').eq('child_id', childId).not('completed_at', 'is', null).order('completed_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const context = `
CHILD: ${childName} · programme week ${weekNumber}${calendarBlock}

--- WHAT THE PARENT JUST TOLD YOU (ground truth about their experience) ---
${JSON.stringify(answers)}

--- ACTIVE GOALS (use these UUIDs in goal_assessments) ---
${JSON.stringify(goals || [])}

--- SESSION LOGS, LAST 14 DAYS (${(logs || []).length} sessions) ---
${JSON.stringify(logs || [])}

--- THIS WEEK'S FOCUS (what you asked them to work on) ---
${JSON.stringify(focus?.focus_data || 'none yet')}

--- THEIR PREVIOUS CHECK-IN (did last week's recommendations land?) ---
${JSON.stringify(previous || 'none')}
`.trim()

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
      system: QUICK_CHECKIN_PROMPT,
      messages: [{ role: 'user', content: context }],
      output_config: { format: { type: 'json_schema', schema: QUICK_SCHEMA } },
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    console.error('quick check-in: Anthropic error', res.status, data?.error?.message)
    throw new Error(data?.error?.message || 'model call failed')
  }
  const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text
  if (!text) throw new Error('no text block in model response')
  return JSON.parse(text)
}

export async function POST(req: NextRequest) {
  const { messages, childName, weekNumber, childId, mode, answers } = await req.json()

  // Family calendar grounds the check-in in real life — Dr. Eriksson can ask how the
  // dentist went and knows swimming Tuesdays exist (RLS-scoped to the signed-in parent)
  let calendarBlock = ''
  if (childId) {
    const supabase = createClient()
    const { data: calendar } = await supabase.from('family_events')
      .select('kind, title, event_date, recurrence')
      .eq('child_id', childId).eq('active', true)
    if (calendar?.length) {
      calendarBlock = `\nFamily calendar (recent/upcoming events + rhythms — ask how named events went, and anchor recommendations in the rhythms): ${calendar
        .map(e => e.kind === 'rhythm' ? `${e.title} (${e.recurrence || 'recurring'})` : `${e.title} on ${e.event_date}`)
        .join('; ')}`
    }
  }

  if (mode === 'quick') {
    try {
      const summary = await quickCheckin(childId, childName, weekNumber, answers || {}, calendarBlock)
      return NextResponse.json({ ok: true, summary })
    } catch (err) {
      console.error('quick check-in failed:', err)
      return NextResponse.json({ ok: false, error: 'could not save your check-in — please try again' }, { status: 500 })
    }
  }

  const system = `${PROGRESS_AGENT_PROMPT}

Child: ${childName}
Week: ${weekNumber}${calendarBlock}

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
