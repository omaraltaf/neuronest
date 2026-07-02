import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Weekly Planning Agent (CLAUDE.md §5.1). The reasoning runs in the Supabase Edge
// Function `weekly-focus` (see supabase/functions/weekly-focus/index.ts), normally on
// a Monday-morning pg_cron schedule. This route is the app-facing surface:
//   GET  — current week's focus for a child (RLS-scoped to the signed-in parent)
//   POST — manual trigger/regenerate, forwarded to the Edge Function with the shared
//          secret (WEEKLY_FOCUS_CRON_SECRET, same value as in Supabase Vault)

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

// Vercel function config: allow time for the Edge Function's reasoning call
export const maxDuration = 300
