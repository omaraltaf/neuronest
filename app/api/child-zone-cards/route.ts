import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CHILD_ZONE_CARDS_PROMPT } from '@/lib/agents/prompts'

// Child Zone ↔ active goals wiring (CLAUDE.md §5.5). Returns a flashcard set generated
// from the child's active goals ("My Words"), cached in generated_content
// (content_type 'child_zone_cards') and regenerated whenever the goal set changes —
// tracked by a hash of goal ids + statuses. Runs on Vercel because it only calls
// api.anthropic.com (the one external domain Vercel allows — CLAUDE.md §6).

const CARDS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['set_label', 'cards'],
  properties: {
    set_label: { type: 'string', description: "Short personal label, e.g. \"Arya's Words\"" },
    cards: {
      type: 'array',
      description: '6-8 cards practising goal vocabulary',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['emoji', 'word', 'sound', 'colour', 'goal_link'],
        properties: {
          emoji: { type: 'string', description: 'Exactly one widely-supported emoji' },
          word: { type: 'string', description: "At the child's language level, in their language" },
          sound: { type: 'string', description: 'Playful phrase the parent says aloud' },
          colour: { type: 'string', description: 'Hex colour from the allowed palette' },
          goal_link: { type: 'string', description: 'One parent-facing sentence tying the card to its goal' },
        },
      },
    },
  },
}

function goalsHash(goals: { id: string; status: string }[]): string {
  return goals.map(g => `${g.id}:${g.status}`).sort().join('|')
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ cards: null }, { status: 401 })

  const childId = req.nextUrl.searchParams.get('child')
  if (!childId) return NextResponse.json({ cards: null }, { status: 400 })

  // Active = anything the family is (or will be) working on
  const [{ data: child }, { data: goals }] = await Promise.all([
    supabase.from('children').select('id, name, interests, language').eq('id', childId).maybeSingle(),
    supabase.from('goals').select('id, label, area, status, approach, target_criterion, activities')
      .eq('child_id', childId).in('status', ['not_started', 'in_progress', 'emerging']),
  ])
  if (!child) return NextResponse.json({ cards: null }, { status: 404 })
  if (!goals || goals.length === 0) return NextResponse.json({ cards: null })

  const hash = goalsHash(goals as { id: string; status: string }[])

  // Fresh cache → serve it
  const { data: cached } = await supabase.from('generated_content')
    .select('id, content_data')
    .eq('child_id', childId).eq('content_type', 'child_zone_cards').eq('active', true)
    .maybeSingle()

  const cachedData = cached?.content_data as { goals_hash?: string } | null
  if (cached && cachedData?.goals_hash === hash) {
    return NextResponse.json({ cards: cached.content_data })
  }

  // Stale or missing → regenerate from the current goals
  const { data: profile } = await supabase.from('child_profiles')
    .select('profile_data').eq('child_id', childId).eq('is_current', true).maybeSingle()
  const profileData = (profile?.profile_data || {}) as Record<string, unknown>

  const context = `
--- CHILD ---
${JSON.stringify(child)}

--- COMMUNICATION PROFILE (for language level) ---
${JSON.stringify(profileData.communication || 'not available')}

--- ACTIVE GOALS (source the vocabulary from these) ---
${JSON.stringify(goals)}
`.trim()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.CHILD_ZONE_MODEL || 'claude-opus-4-8',
      max_tokens: 4000,
      system: CHILD_ZONE_CARDS_PROMPT,
      messages: [{ role: 'user', content: context }],
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: CARDS_SCHEMA },
      },
    }),
  })

  if (!response.ok) {
    console.error('child-zone-cards generation failed:', await response.text())
    // Serve the stale set rather than nothing — the Child Zone must never break for a child
    return NextResponse.json({ cards: cached?.content_data || null })
  }

  const result = await response.json()
  if (result.stop_reason === 'refusal') {
    console.error('child-zone-cards: model refusal')
    return NextResponse.json({ cards: cached?.content_data || null })
  }
  const text = result.content?.find((b: { type: string }) => b.type === 'text')?.text
  if (!text) return NextResponse.json({ cards: cached?.content_data || null })

  const generated = { ...JSON.parse(text), goals_hash: hash, generated_at: new Date().toISOString() }

  if (cached) {
    await supabase.from('generated_content')
      .update({ content_data: generated, generated_at: new Date().toISOString() })
      .eq('id', cached.id)
  } else {
    await supabase.from('generated_content').insert({
      child_id: childId,
      user_id: user.id,
      content_type: 'child_zone_cards',
      title: generated.set_label || 'My Words',
      content_data: generated,
      language: (child.language as string) || 'en',
      active: true,
    })
  }

  return NextResponse.json({ cards: generated })
}

export const maxDuration = 60
