import { NextRequest, NextResponse } from 'next/server'
import { resolveModel } from '@/lib/agents/models'
import { createClient } from '@/lib/supabase/server'
import { STATUS_PROPOSAL_PROMPT } from '@/lib/agents/prompts'

// Goal status proposals (2026-07-17): fired right after a check-in completes. Dr.
// Eriksson reads the fresh check-in against the goals and — conservatively — proposes
// status flips (achieved / start now) for the parent to confirm with one tap on the
// Plan tab (components/StatusProposals.tsx). The system never silently edits the plan.

const PROPOSALS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['proposals'],
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['goal_id', 'proposed_status', 'reason'],
        properties: {
          goal_id: { type: 'string', description: 'UUID copied exactly from GOALS' },
          proposed_status: { type: 'string', enum: ['achieved', 'in_progress'] },
          reason: { type: 'string', description: "1-2 warm sentences echoing the parent's own words" },
        },
      },
    },
  },
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { childId } = await req.json()
  if (!childId) return NextResponse.json({ ok: false, error: 'childId required' }, { status: 400 })

  const [{ data: goals }, { data: checkin }, { data: focus }, { data: pending }] = await Promise.all([
    supabase.from('goals').select('id, label, area, status, target_criterion, baseline').eq('child_id', childId),
    supabase.from('weekly_checkins').select('id, week_number, wins, challenges, recommendations, messages, completed_at')
      .eq('child_id', childId).not('completed_at', 'is', null)
      .order('completed_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('weekly_focus').select('focus_data').eq('child_id', childId)
      .order('week_start', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('goal_status_proposals').select('goal_id').eq('child_id', childId).eq('status', 'pending'),
  ])
  if (!checkin || !goals?.length) return NextResponse.json({ ok: true, created: 0 })

  // Goals that already carry a live suggestion are off the table
  const blocked = new Set((pending || []).map(p => p.goal_id as string))
  const candidates = goals.filter(g => !blocked.has(g.id as string) && g.status !== 'paused')
  if (!candidates.length) return NextResponse.json({ ok: true, created: 0 })

  // The conversation itself carries the parent's exact words — trim to the last
  // exchanges to keep the call lean
  const transcript = ((checkin.messages || []) as { role: string; content: string }[])
    .slice(-16)
    .map(m => `${m.role === 'user' ? 'Parent' : 'Dr. Eriksson'}: ${m.content}`)
    .join('\n')

  const context = `
--- GOALS (propose changes only where the check-in clearly supports them) ---
${JSON.stringify(candidates)}

--- THE CHECK-IN THAT JUST FINISHED (week ${checkin.week_number}) ---
Wins: ${JSON.stringify(checkin.wins || [])}
Challenges: ${JSON.stringify(checkin.challenges || [])}
Recommendations: ${JSON.stringify(checkin.recommendations || [])}

--- CONVERSATION (the parent's own words) ---
${transcript}

--- CURRENT WEEKLY FOCUS ---
${JSON.stringify((focus?.focus_data as Record<string, unknown>)?.focus_title || 'none')} (targets goal ids: ${JSON.stringify((focus?.focus_data as Record<string, unknown>)?.primary_goal_ids || [])})
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
      max_tokens: 1500,
      system: STATUS_PROPOSAL_PROMPT,
      messages: [{ role: 'user', content: context }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: PROPOSALS_SCHEMA } },
    }),
  })
  if (!res.ok) {
    console.error('status proposals generation failed:', await res.text())
    return NextResponse.json({ ok: false }, { status: 502 })
  }
  const data = await res.json()
  if (data.stop_reason === 'refusal') return NextResponse.json({ ok: true, created: 0 })
  const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text
  if (!text) return NextResponse.json({ ok: true, created: 0 })

  const goalById = new Map(candidates.map(g => [g.id as string, g]))
  const rows = (JSON.parse(text).proposals as { goal_id: string; proposed_status: string; reason: string }[])
    .filter(p => {
      const g = goalById.get(p.goal_id)
      // Validate against reality: never propose the status a goal already has,
      // never achieve what hasn't started being worked on in some form
      return g && g.status !== p.proposed_status &&
        !(p.proposed_status === 'in_progress' && g.status !== 'not_started')
    })
    .slice(0, 3)
    .map(p => ({
      child_id: childId,
      user_id: user.id,
      goal_id: p.goal_id,
      checkin_id: checkin.id,
      proposed_status: p.proposed_status,
      reason: p.reason,
    }))

  if (rows.length) {
    const { error } = await supabase.from('goal_status_proposals').insert(rows)
    if (error) console.error('status proposals insert:', error.message)
    else {
      await supabase.from('notifications').insert({
        child_id: childId,
        user_id: user.id,
        type: 'status_proposal',
        title: '📋 Your check-in suggests plan updates',
        body: `Dr. Eriksson has ${rows.length === 1 ? 'a suggestion' : `${rows.length} suggestions`} for the plan based on what you told her — one tap to confirm.`,
        action_url: `/goals?child=${childId}`,
      })
    }
  }

  return NextResponse.json({ ok: true, created: rows.length })
}

export const maxDuration = 60
