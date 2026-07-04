import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Goal Progression Engine (CLAUDE.md §5.2) — app-facing surface for goal proposals.
// Proposals are created by the goal-progression Edge Function when a goal is achieved;
// here the parent reviews them:
//   GET  — pending proposals for a child (RLS-scoped)
//   POST — one-tap resolve: approve (inserts the drafted goal into the plan) or dismiss

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ proposals: [] }, { status: 401 })

  const childId = req.nextUrl.searchParams.get('child')
  if (!childId) return NextResponse.json({ proposals: [] }, { status: 400 })

  const { data } = await supabase
    .from('goal_proposals')
    .select('*, source_goal:goals!goal_proposals_source_goal_id_fkey(label)')
    .eq('child_id', childId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return NextResponse.json({ proposals: data || [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { proposalId, action } = await req.json()
  if (!proposalId || !['approve', 'dismiss'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'proposalId and action (approve|dismiss) required' }, { status: 400 })
  }

  // RLS scopes this to the signed-in parent's own proposals
  const { data: proposal } = await supabase
    .from('goal_proposals')
    .select('*')
    .eq('id', proposalId)
    .eq('status', 'pending')
    .maybeSingle()
  if (!proposal) return NextResponse.json({ ok: false, error: 'pending proposal not found' }, { status: 404 })

  if (action === 'dismiss') {
    await supabase.from('goal_proposals')
      .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
      .eq('id', proposalId)
    return NextResponse.json({ ok: true, dismissed: true })
  }

  // Approve: the drafted goal's fields mirror the goals table, so it inserts directly
  const g = (proposal.proposal as { next_goal: Record<string, unknown> }).next_goal
  const { data: newGoal, error: insertErr } = await supabase.from('goals').insert({
    plan_id: proposal.plan_id,
    child_id: proposal.child_id,
    user_id: user.id,
    label: g.label,
    area: g.area,
    rationale: g.rationale,
    root_cause_addressed: g.root_cause_addressed,
    approach: g.approach,
    baseline: g.baseline,
    target_criterion: g.target_criterion,
    timeline_weeks: g.timeline_weeks,
    evidence_base: g.evidence_base,
    activities: g.activities,
    generalisation_plan: g.generalisation_plan,
    data_collection: g.data_collection,
    status: 'in_progress',
    started_at: new Date().toISOString(),
  }).select('id').single()

  if (insertErr) {
    console.error('goal insert failed:', insertErr)
    return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 })
  }

  await supabase.from('goal_proposals')
    .update({ status: 'approved', created_goal_id: newGoal.id, resolved_at: new Date().toISOString() })
    .eq('id', proposalId)

  return NextResponse.json({ ok: true, goalId: newGoal.id })
}
