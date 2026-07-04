import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CONTENT_AGENT_PROMPT, CONTENT_ANTICIPATION_PROMPT } from '@/lib/agents/prompts'
import { TYPE_PROMPTS, VISUAL_INSTRUCTION } from '@/lib/agents/contentTemplates'

// Weekly Planning Agent (CLAUDE.md §5.1). The reasoning runs in the Supabase Edge
// Function `weekly-focus` (see supabase/functions/weekly-focus/index.ts), normally on
// a Monday-morning pg_cron schedule. This route is the app-facing surface:
//   GET   — current week's focus for a child (RLS-scoped to the signed-in parent)
//   POST  — manual trigger/regenerate, forwarded to the Edge Function with the shared
//           secret (WEEKLY_FOCUS_CRON_SECRET, same value as in Supabase Vault)
//   PATCH — save the parent's answer to the week-ahead question, then (§5.3) let Emma
//           decide whether it names a concrete upcoming event worth preparing content
//           for ahead of time — if so, generate it straight into the Content Library

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ focus: null }, { status: 401 })

  const childId = req.nextUrl.searchParams.get('child')
  if (!childId) return NextResponse.json({ focus: null }, { status: 400 })

  const { data } = await supabase
    .from('weekly_focus')
    .select('*')
    .eq('child_id', childId)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({ focus: data || null })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { childId, force } = await req.json()
  if (!childId) return NextResponse.json({ ok: false, error: 'childId required' }, { status: 400 })

  // RLS-backed ownership check before spending a reasoning call
  const { data: child } = await supabase.from('children').select('id').eq('id', childId).maybeSingle()
  if (!child) return NextResponse.json({ ok: false, error: 'child not found' }, { status: 404 })

  const secret = process.env.WEEKLY_FOCUS_CRON_SECRET
  if (!secret) {
    console.error('WEEKLY_FOCUS_CRON_SECRET is not set')
    return NextResponse.json({ ok: false, error: 'not configured' }, { status: 500 })
  }

  // The Edge Function call runs a full reasoning pass — can take a couple of minutes
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/weekly-focus`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
      body: JSON.stringify({ child_id: childId, force: !!force, trigger: 'manual' }),
    }
  )

  const data = await res.json().catch(() => ({}))
  return NextResponse.json({ ok: res.ok, ...data }, { status: res.ok ? 200 : 502 })
}

const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['should_generate', 'content_type', 'topic', 'opportunity'],
  properties: {
    should_generate: { type: 'boolean' },
    content_type: { type: 'string', enum: ['social_story', 'activity_pack'], description: 'Ignored when should_generate is false' },
    topic: { type: 'string', description: "The child's experience, e.g. 'Going to the dentist'. Empty if not generating" },
    opportunity: { type: 'string', description: 'The event from the parent answer. Empty if not generating' },
  },
}

async function callClaude(system: string, prompt: string, options: { schema?: object; maxTokens?: number } = {}) {
  const body: Record<string, unknown> = {
    model: process.env.CONTENT_ANTICIPATION_MODEL || 'claude-opus-4-8',
    max_tokens: options.maxTokens || 3000,
    system,
    messages: [{ role: 'user', content: prompt }],
  }
  if (options.schema) {
    body.output_config = { effort: 'medium', format: { type: 'json_schema', schema: options.schema } }
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) { console.error('anthropic error:', await res.text()); return null }
  const data = await res.json()
  if (data.stop_reason === 'refusal') return null
  const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text
  if (!text) return null
  try {
    return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
  } catch { return null }
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { childId, answer } = await req.json()
  if (!childId || !answer?.trim()) {
    return NextResponse.json({ ok: false, error: 'childId and answer required' }, { status: 400 })
  }

  // Save the answer onto the current focus row (RLS-scoped)
  const { data: focus } = await supabase.from('weekly_focus')
    .select('id, focus_data')
    .eq('child_id', childId)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!focus) return NextResponse.json({ ok: false, error: 'no weekly focus yet' }, { status: 404 })

  const mergedData = {
    ...(focus.focus_data as Record<string, unknown>),
    week_ahead_answer: answer.trim(),
    week_ahead_answered_at: new Date().toISOString(),
  }
  await supabase.from('weekly_focus').update({ focus_data: mergedData }).eq('id', focus.id)

  // §5.3: does the answer name a concrete event worth preparing for?
  const [{ data: child }, { data: goals }] = await Promise.all([
    supabase.from('children').select('id, name, dob, interests, language, school_name').eq('id', childId).maybeSingle(),
    supabase.from('goals').select('id, label, area, status').eq('child_id', childId).in('status', ['not_started', 'in_progress', 'emerging']),
  ])
  if (!child) return NextResponse.json({ ok: true, saved: true, generated: null })

  const decision = await callClaude(CONTENT_ANTICIPATION_PROMPT, `
--- PARENT'S ANSWER TO "WHAT DOES YOUR WEEK LOOK LIKE?" ---
"${answer.trim()}"

--- CHILD ---
${JSON.stringify(child)}

--- ACTIVE GOALS ---
${JSON.stringify(goals || [])}
`.trim(), { schema: DECISION_SCHEMA, maxTokens: 1000 })

  if (!decision?.should_generate || !decision.topic) {
    return NextResponse.json({ ok: true, saved: true, generated: null })
  }

  // Generate through the same templates the Content Library uses, so it renders natively
  const pseudoGoal = {
    label: decision.topic,
    root_cause_addressed: `Preparing for: ${decision.opportunity}`,
    approach: 'naturalistic preparation ahead of a real family event',
    rationale: `The family's week includes: ${decision.opportunity}`,
  }
  const typePromptFn = TYPE_PROMPTS[decision.content_type] || TYPE_PROMPTS.activity_pack
  const content = await callClaude(CONTENT_AGENT_PROMPT, `${typePromptFn(pseudoGoal, child as Record<string, unknown>)}

CHILD CONTEXT:
Name: ${child.name}
Interests: ${((child.interests as string[]) || []).join(', ') || 'not specified'}
School: ${child.school_name || 'not specified'}
Language: ${(child.language as string) || 'en'}

${VISUAL_INSTRUCTION}

This is PREPARATION content: the event ("${decision.opportunity}") is coming up this week, so frame everything as getting ready for it, positively.
Return ONLY valid JSON — no markdown, no explanation.`)

  if (!content || content.raw) {
    return NextResponse.json({ ok: true, saved: true, generated: null })
  }

  const { data: saved } = await supabase.from('generated_content').insert({
    child_id: childId,
    user_id: user.id,
    content_type: decision.content_type,
    title: content.title || decision.topic,
    content_data: content,
    language: (child.language as string) || 'en',
    active: true,
  }).select('id').single()

  await supabase.from('notifications').insert({
    child_id: childId,
    user_id: user.id,
    type: 'content_ready',
    title: `✨ Ready for ${decision.opportunity}`,
    body: `Emma made "${content.title || decision.topic}" so ${child.name} can feel prepared before it happens. It's waiting in your library.`,
    action_url: `/content?child=${childId}`,
  })

  return NextResponse.json({
    ok: true, saved: true,
    generated: { id: saved?.id, title: content.title || decision.topic, content_type: decision.content_type, opportunity: decision.opportunity },
  })
}

// Vercel function config: allow time for the Edge Function's reasoning call
export const maxDuration = 300
