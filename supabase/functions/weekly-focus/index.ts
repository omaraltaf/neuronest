// Supabase Edge Function: weekly-focus
// The Weekly Planning Agent (CLAUDE.md §5.1) — turns NeuroNest from reactive to proactive.
//
// Runs every Monday 06:00 UTC via pg_cron + pg_net (job 'weekly-focus-monday'), and on
// demand from /api/weekly-focus (parent-triggered regeneration). For each active child it
// pulls the last 14 days of data, has Claude reason like an NDBI-trained coach about what
// this family should focus on this week, writes the result to neuronest.weekly_focus, and
// fires a notification.
//
// Runs here (not on Vercel) because the service-role key is auto-injected and pg_cron can
// invoke it directly. NOT auto-deployed from git — after editing, redeploy manually via the Supabase
// MCP deploy_edge_function tool or `supabase functions deploy weekly-focus`, keeping
// verify_jwt: false (pg_cron and the Vercel route authenticate via x-cron-secret instead).
//
// Auth: requests must carry an `x-cron-secret` header matching the WEEKLY_FOCUS_CRON_SECRET
// stored in Supabase Vault (readable only via the service-role-locked neuronest.get_secret RPC).
//
// Model: Fable 5 by default (per CLAUDE.md §7 — use it for reasoning-heavy agents while
// available), with a server-side fallback to Opus so a classifier false-positive can't kill
// a cron run. Override with the WEEKLY_FOCUS_MODEL env var (e.g. claude-sonnet-5) once
// Fable access reverts to paid-only — the prompt is written to run well on Sonnet-tier too.

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
// Agent prompt. Companion to the personas in lib/agents/prompts.ts (kept here because
// this agent runs in Deno, not Next.js). Written with the reasoning steps spelled out
// explicitly so it executes reliably on Sonnet-tier models, not just frontier ones.
// Clinical grounding: NDBI / parent-mediated intervention research — see CLAUDE.md §2.
// ──────────────────────────────────────────────────────────────
const WEEKLY_PLANNING_AGENT_PROMPT = `You are Dr. Maria Santos, the BCBA-D who built this family's intervention plan. Every Monday morning you review the family's week and choose ONE clear focus for the coming week — the way a dedicated in-home support worker would if the family could afford one full-time.

YOUR CLINICAL FRAME (NDBI — Naturalistic Developmental Behavioral Intervention):
- Parent-mediated practice embedded in natural daily routines beats clinical drill. Every suggestion must fit inside things this family already does (meals, bath, car rides, play, bedtime).
- Parent implementation fidelity is the single strongest predictor of child outcomes. Your job is to coach the parent's TECHNIQUE, not just assign activities.
- Think in pivotal behaviors (PRT): motivation, initiations, self-management, responding to multiple cues. One pivotal skill unlocked generalises further than three splinter skills drilled.
- Joint attention, engagement, and regulation (JASPER) come before task demands. If the data shows dysregulation or disengagement, that IS the focus.
- Always positively framed, strengths-first, never pathologising. The parent reading this is tired and doing their best.

FOLLOW THESE REASONING STEPS IN ORDER:
1. READ THE DATA. What actually happened in the last 14 days? Count sessions, note ratings, read the check-in wins/challenges/recommendations, note which goals got attention and which were untouched. Note whether previous weekly focuses were acted on. If there is little or no data, that is itself the finding — the focus becomes re-entry, made as small and winnable as possible.
2. FIND THE SIGNAL. Pick the single most important pattern: a win to build on (momentum beats remediation), a goal that's stalled, a technique the parent is struggling with (low ratings), or a gap (active goal with zero practice). Prefer building on what's working over fixing what isn't, unless something is clearly blocking progress. Separately: if low-rated sessions share a signature (same time of day, same goal, same struggle in the notes — including [Dr. Eriksson asked]/[Parent] exchanges), name that pattern explicitly in pattern_insight as a coaching insight, not raw data ("sessions after 5pm tend to be the hard ones — her regulation tank is empty by then"). If no genuine pattern exists, pattern_insight is an empty string. Never invent one.
3. CHOOSE ONE FOCUS. One pivotal behavior, tied to 1-2 active goals. Not a list. A parent who is told to focus on everything focuses on nothing.
4. DESIGN THE WEEK. One 5-minute starter activity (doable tonight, with things already in the house, using the child's actual interests from their profile). 2-4 embed opportunities inside the family's existing routines. One concrete technique tip that coaches HOW the parent interacts (prompt level, wait time, following the child's lead, reinforcement timing) — not just WHAT to do.
5. CELEBRATE SOMETHING REAL. Find one specific thing from the actual data (a logged session, a check-in win, a streak) and name it concretely. Never generic praise. If the week was empty, warmly acknowledge that starting again is the win being set up.
6. ASK ABOUT THE WEEK AHEAD. One short, warm question about the family's upcoming week (trips, visitors, school events, routine changes) so future planning can embed practice into real events. Keep it answerable in one sentence.

HARD RULES:
- Use the child's name and their genuine interests throughout. Never produce content that could apply to any child.
- Cite real data in focus_reason ("only 2 sessions logged", "you rated turn-taking 4/5 twice") — the parent must feel SEEN, not templated.
- primary_goal_ids must be UUIDs copied exactly from the ACTIVE GOALS data. 1-2 goals maximum.
- Never repeat the previous week's focus verbatim; either progress it one step or pivot with a stated reason.
- Language: match the family's language preference. Warm, specific, zero clinical jargon (say "wait 5 seconds before helping" not "constant time delay").
- notification_body must be under 200 characters and standalone-readable: "This week: [focus] because [reason]. [starter hook]".

Respond with a single JSON object matching the required schema.`

// Structured-output schema — guarantees parseable JSON even on an unattended cron run.
const FOCUS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'focus_title', 'focus_reason', 'primary_goal_ids', 'pivotal_behavior', 'celebrate',
    'coaching_tip', 'starter_activity', 'embed_opportunities', 'watch_for',
    'week_ahead_question', 'notification_body', 'pattern_insight',
  ],
  properties: {
    focus_title: { type: 'string', description: 'Parent-facing focus for the week, max ~60 chars, no jargon' },
    focus_reason: { type: 'string', description: '2-4 warm sentences citing the actual data that led to this focus' },
    primary_goal_ids: { type: 'array', items: { type: 'string' }, description: '1-2 goal UUIDs copied exactly from ACTIVE GOALS' },
    pivotal_behavior: { type: 'string', description: 'The pivotal skill this week targets, in plain language' },
    celebrate: { type: 'string', description: 'One specific, real thing from the past week to celebrate' },
    coaching_tip: {
      type: 'object',
      additionalProperties: false,
      required: ['technique', 'how_to', 'why_it_works'],
      properties: {
        technique: { type: 'string', description: 'Name of the parent technique, in plain words' },
        how_to: { type: 'string', description: 'Exactly how to do it, concrete enough for 7pm on a hard day' },
        why_it_works: { type: 'string', description: 'One sentence of why, accessible' },
      },
    },
    starter_activity: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'duration_minutes', 'materials', 'steps', 'success_looks_like'],
      properties: {
        title: { type: 'string' },
        duration_minutes: { type: 'integer' },
        materials: { type: 'string', description: 'Things already in the house' },
        steps: { type: 'array', items: { type: 'string' }, description: '3-5 short steps with exact words to say' },
        success_looks_like: { type: 'string' },
      },
    },
    embed_opportunities: {
      type: 'array',
      description: '2-4 ways to embed practice in existing daily routines',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['routine', 'what_to_do'],
        properties: {
          routine: { type: 'string', description: 'An existing family routine, e.g. breakfast, bath time' },
          what_to_do: { type: 'string', description: 'One sentence of what to embed there' },
        },
      },
    },
    watch_for: { type: 'string', description: 'One thing to observe and note this week' },
    week_ahead_question: { type: 'string', description: 'One warm question about the upcoming week to surface naturalistic opportunities' },
    notification_body: { type: 'string', description: 'Push-style summary under 200 chars' },
    pattern_insight: { type: 'string', description: 'Named pattern across low-rated sessions as a coaching insight, or empty string if none' },
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticate: shared secret from Vault (pg_cron and the Vercel route both send it)
    const expected = await getSecret('WEEKLY_FOCUS_CRON_SECRET')
    const provided = req.headers.get('x-cron-secret')
    if (!expected || provided !== expected) {
      return json({ error: 'unauthorized' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const targetChildId: string | null = body.child_id || null
    const force: boolean = !!body.force
    const weekStart = mondayOf(new Date())

    // Which children to plan for: one (manual trigger) or all active (cron)
    let childrenQuery = supabase.from('app_state').select('child_id, user_id, current_week').eq('current_phase', 'active')
    if (targetChildId) childrenQuery = childrenQuery.eq('child_id', targetChildId)
    const { data: activeStates, error: stateErr } = await childrenQuery
    if (stateErr) throw stateErr

    const results = []
    for (const state of activeStates || []) {
      try {
        results.push(await planWeekForChild(state.child_id, state.user_id, state.current_week || 1, weekStart, force))
      } catch (err) {
        console.error(`weekly-focus failed for child ${state.child_id}:`, err)
        results.push({ child_id: state.child_id, error: String(err) })
      }
    }

    return json({ ok: true, week_start: weekStart, results })
  } catch (err) {
    console.error('weekly-focus error:', err)
    return json({ error: String(err) }, 500)
  }
})

async function planWeekForChild(childId: string, userId: string, currentWeek: number, weekStart: string, force: boolean) {
  // Idempotent per week — cron re-runs and duplicate triggers are no-ops unless forced
  const { data: existing } = await supabase.from('weekly_focus')
    .select('id').eq('child_id', childId).eq('week_start', weekStart).maybeSingle()
  if (existing && !force) {
    return { child_id: childId, skipped: 'already generated for this week' }
  }

  const since = new Date(Date.now() - 14 * 86400000).toISOString()

  const [
    { data: child },
    { data: profile },
    { data: goals },
    { data: logs },
    { data: checkins },
    { data: recentContent },
    { data: recentNotifs },
    { data: previousFocuses },
  ] = await Promise.all([
    supabase.from('children').select('id, name, dob, gender, interests, language, school_name').eq('id', childId).single(),
    supabase.from('child_profiles').select('profile_data, priority_matrix, strength_map, hypotheses').eq('child_id', childId).eq('is_current', true).maybeSingle(),
    supabase.from('goals').select('id, label, area, status, approach, baseline, target_criterion, rationale, started_at, achieved_at').eq('child_id', childId),
    supabase.from('session_logs').select('activity_title, area, rating, notes, duration_min, logged_at, goal_id').eq('child_id', childId).gte('logged_at', since).order('logged_at', { ascending: false }),
    supabase.from('weekly_checkins').select('week_number, parent_wellbeing, wins, challenges, recommendations, goal_assessments, escalation_flags, created_at').eq('child_id', childId).order('created_at', { ascending: false }).limit(2),
    supabase.from('generated_content').select('goal_id, content_type, title, generated_at').eq('child_id', childId).order('generated_at', { ascending: false }).limit(15),
    supabase.from('notifications').select('type, title, read, created_at').eq('child_id', childId).gte('created_at', since),
    supabase.from('weekly_focus').select('week_start, focus_data').eq('child_id', childId).order('week_start', { ascending: false }).limit(3),
  ])

  const context = `
--- CHILD ---
${JSON.stringify(child)}

--- CURRENT PROFILE (parent-confirmed) ---
${JSON.stringify(profile || 'not available')}

--- ACTIVE GOALS (use these UUIDs for primary_goal_ids) ---
${JSON.stringify(goals || [])}

--- SESSION LOGS, LAST 14 DAYS (${(logs || []).length} sessions) ---
${JSON.stringify(logs || [])}

--- LAST 2 WEEKLY CHECK-INS WITH DR. ERIKSSON ---
${JSON.stringify(checkins || [])}

--- RECENTLY GENERATED CONTENT (what materials the family already has) ---
${JSON.stringify(recentContent || [])}

--- NOTIFICATION ENGAGEMENT, LAST 14 DAYS ---
${JSON.stringify(recentNotifs || [])}

--- PREVIOUS WEEKLY FOCUSES (do not repeat; progress or pivot) ---
${JSON.stringify(previousFocuses || [])}

--- WEEK ---
This is programme week ${currentWeek}. The new week starts Monday ${weekStart}.
`.trim()

  const model = Deno.env.get('WEEKLY_FOCUS_MODEL') || DEFAULT_MODEL
  const anthropic = new Anthropic({ apiKey: await getAnthropicKey() })

  // Fable 5: no `thinking` param (always on), no sampling params, and a server-side
  // fallback so a safety-classifier false positive degrades to Opus instead of failing
  // the cron run. On non-Fable overrides, call without the fallback beta.
  const isFable = model === 'claude-fable-5'
  const request: Record<string, unknown> = {
    model,
    max_tokens: 16000,
    system: WEEKLY_PLANNING_AGENT_PROMPT,
    messages: [{ role: 'user', content: context }],
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: FOCUS_SCHEMA },
    },
  }
  if (isFable) {
    request.betas = ['server-side-fallback-2026-06-01']
    request.fallbacks = [{ model: FALLBACK_MODEL }]
  }

  const response = isFable
    ? await anthropic.beta.messages.create(request as never)
    : await anthropic.messages.create(request as never)

  if (response.stop_reason === 'refusal') {
    throw new Error('model declined the request (stop_reason: refusal)')
  }

  const text = (response.content as { type: string; text?: string }[])
    .find((b) => b.type === 'text')?.text
  if (!text) throw new Error('no text block in model response')
  const focus = JSON.parse(text)

  const servedBy = (response as { model?: string }).model || model

  const { error: upsertErr } = await supabase.from('weekly_focus').upsert({
    child_id: childId,
    user_id: userId,
    week_start: weekStart,
    focus_data: focus,
    model: servedBy,
  }, { onConflict: 'child_id,week_start' })
  if (upsertErr) throw upsertErr

  await supabase.from('notifications').insert({
    child_id: childId,
    user_id: userId,
    type: 'weekly_focus',
    title: `🎯 This week's focus: ${focus.focus_title}`,
    body: focus.notification_body,
    action_url: `/dashboard?child=${childId}`,
  })

  console.log(`weekly-focus generated for ${childId} (${servedBy}): ${focus.focus_title}`)
  return { child_id: childId, week_start: weekStart, focus_title: focus.focus_title, model: servedBy }
}

// Secrets: env var first (set via dashboard if desired), else Supabase Vault via the
// service-role-locked neuronest.get_secret RPC.
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

function mondayOf(d: Date): string {
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday))
  return monday.toISOString().slice(0, 10)
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
