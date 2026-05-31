import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ notifications: [] })

  const childId = req.nextUrl.searchParams.get('child')
  if (!childId) return NextResponse.json({ notifications: [] })

  // Auto-generate notifications based on app state
  await generateNotifications(supabase, childId, user.id)

  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('child_id', childId)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ notifications: data || [] })
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false })

  const { id, all, childId } = await req.json()

  if (all && childId) {
    await supabase.from('notifications').update({ read: true })
      .eq('child_id', childId).eq('user_id', user.id)
  } else if (id) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
  }

  return NextResponse.json({ ok: true })
}

async function generateNotifications(
  supabase: ReturnType<typeof createClient>,
  childId: string,
  userId: string
) {
  const now = new Date()

  const [{ data: appState }, { data: goals }, { data: recentLogs }] = await Promise.all([
    supabase.from('app_state').select('*').eq('child_id', childId).maybeSingle(),
    supabase.from('goals').select('*').eq('child_id', childId),
    supabase.from('session_logs').select('*').eq('child_id', childId)
      .gte('logged_at', new Date(now.getTime() - 7 * 86400000).toISOString()),
  ])

  const toInsert: {
    child_id: string; user_id: string; type: string;
    title: string; body: string; action_url: string
  }[] = []

  // 1. Check-in due
  if (appState?.current_phase === 'active') {
    const lastCheckin = appState.last_checkin_at
      ? new Date(appState.last_checkin_at) : null
    const daysSince = lastCheckin
      ? (now.getTime() - lastCheckin.getTime()) / 86400000 : 999

    if (daysSince >= 7) {
      const existing = await supabase.from('notifications')
        .select('id').eq('child_id', childId).eq('type', 'checkin_due')
        .eq('read', false).maybeSingle()
      if (!existing.data) {
        toInsert.push({
          child_id: childId, user_id: userId,
          type: 'checkin_due',
          title: '📊 Weekly check-in is due',
          body: `It's been ${Math.floor(daysSince)} days since your last check-in with Dr. Eriksson.`,
          action_url: `/checkin?child=${childId}`,
        })
      }
    }
  }

  // 2. Goals newly achieved
  const achievedGoals = (goals || []).filter(g =>
    g.status === 'achieved' && g.achieved_at &&
    (now.getTime() - new Date(g.achieved_at as string).getTime()) < 48 * 3600000
  )
  for (const goal of achievedGoals) {
    const existing = await supabase.from('notifications')
      .select('id').eq('child_id', childId).eq('type', 'goal_achieved')
      .like('body', `%${goal.id}%`).maybeSingle()
    if (!existing.data) {
      toInsert.push({
        child_id: childId, user_id: userId,
        type: 'goal_achieved',
        title: '🏆 Goal achieved!',
        body: `"${goal.label}" has been achieved! id:${goal.id}`,
        action_url: `/goals?child=${childId}`,
      })
    }
  }

  // 3. Streak milestone
  const logDays = new Set((recentLogs || []).map(l =>
    new Date(l.logged_at as string).toDateString()
  ))
  let streak = 0
  const d = new Date()
  while (logDays.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1) }

  if ([3, 7, 14, 21, 30].includes(streak)) {
    const existing = await supabase.from('notifications')
      .select('id').eq('child_id', childId).eq('type', 'streak')
      .gte('created_at', new Date(now.getTime() - 24 * 3600000).toISOString())
      .maybeSingle()
    if (!existing.data) {
      toInsert.push({
        child_id: childId, user_id: userId,
        type: 'streak',
        title: `🔥 ${streak}-day streak!`,
        body: `You've practised ${streak} days in a row. Incredible consistency!`,
        action_url: `/progress?child=${childId}`,
      })
    }
  }

  // 4. No sessions logged this week
  if ((recentLogs || []).length === 0 && appState?.current_phase === 'active') {
    const existing = await supabase.from('notifications')
      .select('id').eq('child_id', childId).eq('type', 'no_sessions')
      .gte('created_at', new Date(now.getTime() - 72 * 3600000).toISOString())
      .maybeSingle()
    if (!existing.data) {
      toInsert.push({
        child_id: childId, user_id: userId,
        type: 'no_sessions',
        title: '💪 Keep the momentum going',
        body: 'No sessions logged this week yet. Even 5 minutes counts!',
        action_url: `/goals?child=${childId}`,
      })
    }
  }

  if (toInsert.length > 0) {
    await supabase.from('notifications').insert(toInsert)
  }
}
