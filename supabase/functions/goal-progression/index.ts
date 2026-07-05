// Supabase Edge Function: goal-progression
// The Goal Progression Engine (CLAUDE.md §5.2) — closes the "goal achieved, now what?" gap.
//
// Trigger: the Postgres trigger `goal_achieved_progression` on neuronest.goals fires an
// async pg_net POST here whenever a goal's status transitions to 'achieved'. The function
// reasons about the clinically-natural NEXT goal (ESDM/PRT progression logic: extend the
// mastered skill along one axis — complexity, generalisation to new people/settings, or
// independence — never an arbitrary next thing), writes a draft to neuronest.goal_proposals,
// and notifies the parent for one-tap approval via /api/goal-proposals.
//
// Same conventions as weekly-focus: NOT auto-deployed from git (redeploy via Supabase MCP
// or `supabase functions deploy goal-progression`, verify_jwt: false), authenticated by the
// x-cron-secret header, secrets from Vault via the service-role-locked neuronest.get_secret
// RPC, Fable 5 by default with a server-side Opus fallback, model override via the
// GOAL_PROGRESSION_MODEL env var.

import { createClient } from 'npm:@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { db: { schema: 'neuronest' } }
)

const DEFAULT_MODEL = 'claude-fable-5'
const FALLBACK_MODEL = 'claude-opus-4-8'

// ──────────────────────────────────────────────────────────────
// Agent prompt. Companion to lib/agents/prompts.ts (lives here because this agent runs
// in Deno). The progression logic is spelled out explicitly so it executes reliably on
// Sonnet-tier models later. Clinical grounding: ESDM/PRT skill-progression — CLAUDE.md §2.
// ──────────────────────────────────────────────────────────────
const GOAL_PROGRESSION_AGENT_PROMPT = `You are Dr. Maria Santos, the BCBA-D who built this family's intervention plan. A goal was just marked ACHIEVED. Your job: celebrate it properly, then draft the single most clinically natural NEXT goal so the family never has a "goal achieved... now what?" gap.

HOW SKILLS PROGRESS (ESDM/PRT logic — follow this, never pick an arbitrary next goal):
A mastered skill extends along exactly ONE axis at a time:
- COMPLEXITY: single word → 2-word phrase; matching identical → matching similar; parallel play → turn-taking. One developmental step, never two.
- GENERALISATION: same skill with new people (non-preferred adult, sibling, peer), new settings (school, shop, grandparent's house), or new materials. Per the plan's own principle: generalisation is the most underappreciated component.
- INDEPENDENCE: same skill with less support — fade one prompt level (physical → model → gesture → verbal → expectant pause → independent), or child initiates instead of responding.
Choose the axis the evidence supports: if the skill is solid at home with one parent only, generalise before adding complexity. If it required heavy prompting, build independence first. Only add complexity when the current level is fluent, spontaneous, and shown with more than one person.

FOLLOW THESE REASONING STEPS IN ORDER:
1. Study the ACHIEVED goal: what exactly was mastered? At what prompt level, with whom, where (read its target_criterion, baseline, and recent session logs)?
2. Check the evidence: do logs/check-ins show fluent, spontaneous use — or bare criterion-met? This decides how big a step the next goal can be.
3. Pick ONE progression axis (complexity, generalisation, or independence) and justify it from the data.
4. Check the OTHER GOALS list: the next goal must not duplicate or collide with an existing goal. If the natural next step already exists as a goal, choose the next-best axis instead.
5. Draft the goal in the exact structure of the existing plan: observable + measurable target_criterion ("8/10 opportunities, 2 settings, 2 people, 3 consecutive sessions" style), realistic timeline (add 50% to your first estimate), 3-5 parent-executable activities embedded in daily routines using the child's actual interests, a generalisation plan, and a simple data collection method a tired parent can actually do.
6. Write the celebration: name specifically what the child can now do that they couldn't before, and what the parent did to get there. This is a genuinely big moment for the family — honour it before pivoting to what's next.

HARD RULES:
- The new baseline IS the just-achieved skill, stated concretely.
- area must be one of the areas already used in this plan (see OTHER GOALS).
- Use the child's name and real interests throughout. No clinical jargon in parent-facing fields — say "wait 5 seconds before helping" not "constant time delay".
- evidence_base: cite the actual approach lineage (e.g. "PRT (Koegel & Koegel); ESDM (Rogers & Dawson 2010)") — never invent citations.
- progression_logic must be parent-readable: WHY this is the natural next step, in 2-3 sentences a non-clinician follows.
- notification_body under 200 characters, celebratory first, then the invitation to review.

Respond with a single JSON object matching the required schema.`

// Field names mirror neuronest.goals so an approved proposal inserts directly.
const PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['next_goal', 'progression_axis', 'progression_logic', 'celebration_message', 'notification_body'],
  properties: {
    next_goal: {
      type: 'object',
      additionalProperties: false,
      required: [
        'label', 'area', 'rationale', 'root_cause_addressed', 'approach', 'baseline',
        'target_criterion', 'timeline_weeks', 'evidence_base', 'activities',
        'generalisation_plan', 'data_collection',
      ],
      properties: {
        label: { type: 'string', description: 'Short goal title in the style of the existing goals' },
        area: { type: 'string', description: 'One of the areas already used in this plan' },
        rationale: { type: 'string', description: 'Parent-readable why, connected to the achieved goal' },
        root_cause_addressed: { type: 'string' },
        approach: { type: 'string', description: 'Specific methodology, parent-readable' },
        baseline: { type: 'string', description: 'The just-achieved skill, stated concretely' },
        target_criterion: { type: 'string', description: 'Observable + measurable success criterion' },
        timeline_weeks: { type: 'integer' },
        evidence_base: { type: 'string', description: 'Real citations only' },
        activities: { type: 'array', items: { type: 'string' }, description: '3-5 parent-executable activities using the child\'s interests' },
        generalisation_plan: { type: 'string' },
        data_collection: { type: 'string', description: 'Simple enough for a tired parent' },
      },
    },
    progression_axis: { type: 'string', enum: ['complexity', 'generalisation', 'independence'], description: 'The ONE axis this goal extends' },
    progression_logic: { type: 'string', description: '2-3 parent-readable sentences: why this is the natural next step' },
    celebration_message: { type: 'string', description: 'Specific celebration of what was just achieved' },
    notification_body: { type: 'string', description: 'Under 200 chars, celebration first' },
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const expected = await getSecret('WEEKLY_FOCUS_CRON_SECRET')
    const provided = req.headers.get('x-cron-secret')
    if (!expected || provided !== expected) {
      return json({ error: 'unauthorized' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const goalId: string | null = body.goal_id || null
    const force: boolean = !!body.force
    if (!goalId) return json({ error: 'goal_id required' }, 400)

    // Idempotent per goal — the trigger can only fire again if the goal was un-achieved
    // and re-achieved, and a parent double-toggle shouldn't spawn duplicate proposals.
    const { data: existing } = await supabase.from('goal_proposals')
      .select('id, status').eq('source_goal_id', goalId).maybeSingle()
    if (existing && !force) {
      return json({ skipped: `proposal already exists (${existing.status})` })
    }

    const { data: goal, error: goalErr } = await supabase.from('goals')
      .select('*').eq('id', goalId).single()
    if (goalErr || !goal) return json({ error: 'goal not found' }, 404)

    const since = new Date(Date.now() - 60 * 86400000).toISOString()
    const [
      { data: child },
      { data: profile },
      { data: otherGoals },
      { data: goalLogs },
      { data: checkins },
    ] = await Promise.all([
      supabase.from('children').select('id, name, dob, gender, interests, language, school_name').eq('id', goal.child_id).single(),
      supabase.from('child_profiles').select('profile_data, priority_matrix, strength_map').eq('child_id', goal.child_id).eq('is_current', true).maybeSingle(),
      supabase.from('goals').select('id, label, area, status, target_criterion').eq('child_id', goal.child_id).neq('id', goalId),
      supabase.from('session_logs').select('activity_title, rating, notes, logged_at').eq('goal_id', goalId).gte('logged_at', since).order('logged_at', { ascending: false }).limit(20),
      supabase.from('weekly_checkins').select('week_number, wins, challenges, goal_assessments, created_at').eq('child_id', goal.child_id).order('created_at', { ascending: false }).limit(2),
    ])

    const context = `
--- CHILD ---
${JSON.stringify(child)}

--- CURRENT PROFILE (parent-confirmed) ---
${JSON.stringify(profile || 'not available')}

--- THE ACHIEVED GOAL (draft its natural successor) ---
${JSON.stringify(goal)}

--- SESSION LOGS FOR THIS GOAL, LAST 60 DAYS (${(goalLogs || []).length} sessions) ---
${JSON.stringify(goalLogs || [])}

--- OTHER GOALS IN THE PLAN (do not duplicate or collide with these) ---
${JSON.stringify(otherGoals || [])}

--- LAST 2 WEEKLY CHECK-INS ---
${JSON.stringify(checkins || [])}
`.trim()

    const anthropic = new Anthropic({ apiKey: await getAnthropicKey() })

    // Model chain: preferred → Opus → Sonnet. A 404 means the model was RETIRED by
    // Anthropic — advance down the chain instead of failing (2026-07-05 lesson).
    const modelChain = [...new Set([
      Deno.env.get('GOAL_PROGRESSION_MODEL') || DEFAULT_MODEL,
      FALLBACK_MODEL,
      'claude-sonnet-5',
    ])]
    const { response, model } = await createWithModelFallback(anthropic, modelChain, {
      max_tokens: 16000,
      system: GOAL_PROGRESSION_AGENT_PROMPT,
      messages: [{ role: 'user', content: context }],
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: PROPOSAL_SCHEMA },
      },
    })

    if (response.stop_reason === 'refusal') {
      throw new Error('model declined the request (stop_reason: refusal)')
    }

    const text = (response.content as { type: string; text?: string }[])
      .find((b) => b.type === 'text')?.text
    if (!text) throw new Error('no text block in model response')
    const proposal = JSON.parse(text)

    const servedBy = (response as { model?: string }).model || model

    const { error: insertErr } = await supabase.from('goal_proposals').upsert({
      child_id: goal.child_id,
      user_id: goal.user_id,
      source_goal_id: goalId,
      plan_id: goal.plan_id,
      proposal,
      status: 'pending',
      model: servedBy,
    }, { onConflict: 'source_goal_id' })
    if (insertErr) throw insertErr

    await supabase.from('notifications').insert({
      child_id: goal.child_id,
      user_id: goal.user_id,
      type: 'goal_proposal',
      title: `🏆 "${goal.label}" achieved — next step ready`,
      body: proposal.notification_body,
      action_url: `/goals?child=${goal.child_id}`,
    })

    console.log(`goal-progression proposal for goal ${goalId} (${servedBy}): ${proposal.next_goal?.label}`)
    return json({ ok: true, goal_id: goalId, next_goal_label: proposal.next_goal?.label, model: servedBy })
  } catch (err) {
    console.error('goal-progression error:', err)
    return json({ error: String(err) }, 500)
  }
})

// Try each model in the chain; on 404 (retired model) advance to the next. Fable-class
// models take their special request shape (no thinking param, refusal fallback beta).
async function createWithModelFallback(
  anthropic: Anthropic,
  chain: string[],
  base: Record<string, unknown>,
): Promise<{ response: { stop_reason?: string; content?: unknown; model?: string }; model: string }> {
  let lastErr: unknown
  for (const model of chain) {
    const isFable = model === 'claude-fable-5'
    const request: Record<string, unknown> = { ...base, model }
    if (isFable) {
      request.betas = ['server-side-fallback-2026-06-01']
      request.fallbacks = [{ model: FALLBACK_MODEL }]
    }
    try {
      const response = isFable
        ? await anthropic.beta.messages.create(request as never)
        : await anthropic.messages.create(request as never)
      return { response: response as never, model }
    } catch (err) {
      const status = (err as { status?: number })?.status
      if (status === 404) {
        console.error(`model ${model} not found (retired?) — falling back`)
        lastErr = err
        continue
      }
      throw err
    }
  }
  throw lastErr
}

// Secrets: env var first, else Vault via the service-role-locked neuronest.get_secret RPC.
const secretCache: Record<string, string> = {}
async function getSecret(name: string): Promise<string | null> {
  const fromEnv = Deno.env.get(name)
  if (fromEnv) return fromEnv
  if (secretCache[name]) return secretCache[name]
  const { data, error } = await supabase.rpc('get_secret', { secret_name: name })
  if (error) { console.error(`get_secret(${name}):`, error.message); return null }
  if (data) secretCache[name] = data as string
  return (data as string) || null
}

async function getAnthropicKey(): Promise<string> {
  const key = await getSecret('ANTHROPIC_API_KEY')
  if (!key) throw new Error('ANTHROPIC_API_KEY not found in env or Vault')
  return key
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
