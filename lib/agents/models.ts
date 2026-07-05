// Central model resolution — never hardcode a model id at a call site again.
//
// Why this exists: on 2026-07-05 every conversational agent was found broken in
// production because a hardcoded model id (claude-sonnet-4-20250514) had been retired
// by Anthropic. This module prevents the recurrence: each tier has a preference list,
// and the FIRST preference that Anthropic's live Models API still serves wins. Retired
// models disappear from that API, so we advance to the next candidate automatically —
// before requests start 404ing.
//
// TIERS — match the model to the job, don't pay deep-tier prices for routine work:
//   fast     → trivial judgments: image QA, classification, routing. ~0.1¢/call.
//   standard → the workhorse (~95% of volume): every chat agent, content generation,
//              coaching, card sets, document extraction. ~1-5¢/call.
//   deep     → the two genuinely hard clinical-judgment agents (weekly planning, goal
//              progression) run in Supabase Edge Functions with their own fallback
//              chain; this tier exists here for any future deep call made from Vercel.
//
// Rules:
// - Env overrides (FAST_MODEL / STANDARD_MODEL / DEEP_MODEL) win when set and served.
// - Adopting a NEW model is deliberate: add it to the top of its tier's list after a
//   quick prompt sanity pass. Retirement protection is automatic; upgrades are chosen.
// - Aliases only — never date-suffixed ids.
// - fast/standard tiers must never contain Fable-class models: those call sites send
//   thinking: {type: 'disabled'}, which Fable rejects with a 400.

export type ModelTier = 'fast' | 'standard' | 'deep'

const PREFERENCES: Record<ModelTier, string[]> = {
  fast: ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-sonnet-4-6'],
  standard: ['claude-sonnet-5', 'claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'],
  deep: ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-5', 'claude-sonnet-4-6'],
}

function envOverride(tier: ModelTier): string | undefined {
  return {
    fast: process.env.FAST_MODEL,
    standard: process.env.STANDARD_MODEL,
    deep: process.env.DEEP_MODEL,
  }[tier]
}

let availableIds: Set<string> | null = null
let fetchedAt = 0
const TTL_MS = 60 * 60 * 1000

async function getAvailableIds(): Promise<Set<string> | null> {
  if (availableIds && Date.now() - fetchedAt < TTL_MS) return availableIds
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
    })
    if (!res.ok) return availableIds // keep stale cache on transient failure
    const data = await res.json()
    availableIds = new Set((data.data || []).map((m: { id: string }) => m.id))
    fetchedAt = Date.now()
    return availableIds
  } catch {
    return availableIds
  }
}

export async function resolveModel(tier: ModelTier): Promise<string> {
  const prefs = [envOverride(tier), ...PREFERENCES[tier]].filter(Boolean) as string[]
  const available = await getAvailableIds()
  if (!available) return prefs[0] // Models API unreachable — optimistic first choice
  for (const id of prefs) {
    if (available.has(id)) return id
  }
  // Nothing from our list is served (should never happen) — let the API name what is
  console.error(`resolveModel(${tier}): no preferred model available, using first API model`)
  return available.values().next().value || prefs[0]
}
