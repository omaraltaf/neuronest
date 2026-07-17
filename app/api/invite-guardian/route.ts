import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Family sharing (Account page): trigger the real invitation email for a pending
// guardian invite. The email itself is sent by the invite-guardian Edge Function
// (auth.admin needs the service-role key, which only Edge Functions hold); this route
// verifies the caller actually owns a pending invite for that email before forwarding.

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { childId, email } = await req.json()
  if (!childId || !email?.trim()) {
    return NextResponse.json({ ok: false, error: 'childId and email required' }, { status: 400 })
  }

  // RLS ("owner manages guardians") makes this row visible only to the child's owner
  const { data: invite } = await supabase.from('child_guardians')
    .select('id, child_name')
    .eq('child_id', childId)
    .eq('invited_email', email.trim().toLowerCase())
    .eq('status', 'pending')
    .maybeSingle()
  if (!invite) return NextResponse.json({ ok: false, error: 'no pending invite' }, { status: 404 })

  const secret = process.env.WEEKLY_FOCUS_CRON_SECRET
  if (!secret) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 500 })

  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/invite-guardian`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify({ email: email.trim().toLowerCase(), child_name: invite.child_name }),
  })
  const data = await res.json().catch(() => ({}))
  return NextResponse.json({ ok: res.ok, ...data }, { status: res.ok ? 200 : 502 })
}
