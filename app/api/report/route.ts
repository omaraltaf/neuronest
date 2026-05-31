import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const childId = req.nextUrl.searchParams.get('child')
  if (!childId) return NextResponse.json({ error: 'No child ID' }, { status: 400 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Gather all report data
  const [
    { data: child },
    { data: profile },
    { data: goals },
    { data: logs },
    { data: checkins },
    { data: plan },
  ] = await Promise.all([
    supabase.from('children').select('*').eq('id', childId).single(),
    supabase.from('child_profiles').select('*').eq('child_id', childId).eq('is_current', true).maybeSingle(),
    supabase.from('goals').select('*').eq('child_id', childId),
    supabase.from('session_logs').select('*').eq('child_id', childId)
      .order('logged_at', { ascending: false }).limit(50),
    supabase.from('weekly_checkins').select('*').eq('child_id', childId)
      .order('created_at', { ascending: false }).limit(5),
    supabase.from('plans').select('*').eq('child_id', childId).eq('is_current', true).maybeSingle(),
  ])

  // Pass data to Python script via env
  const reportData = {
    child, profile, goals: goals || [], logs: logs || [],
    checkins: checkins || [], plan,
    generated_at: new Date().toISOString(),
  }

  return NextResponse.json({ reportData })
}
