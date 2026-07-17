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

// §5.6 Momentum & Celebration Layer: every auto-notification is tied to what the family
// actually did — never generic. §5.3: one content-gap nudge at a time, never a pile.
async function generateNotifications(
  supabase: ReturnType<typeof createClient>,
  childId: string,
  userId: string
) {
  const now = new Date()

  const [
    { data: appState },
    { data: goals },
    { data: recentLogs },
    { data: child },
    { data: weeklyFocus },
    { data: recentContent },
    { data: upcomingEvents },
  ] = await Promise.all([
    supabase.from('app_state').select('*').eq('child_id', childId).maybeSingle(),
    supabase.from('goals').select('*').eq('child_id', childId),
    supabase.from('session_logs').select('*').eq('child_id', childId)
      .gte('logged_at', new Date(now.getTime() - 7 * 86400000).toISOString()),
    supabase.from('children').select('name').eq('id', childId).maybeSingle(),
    supabase.from('weekly_focus').select('focus_data, week_start').eq('child_id', childId)
      .order('week_start', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('generated_content').select('goal_id, title, generated_at').eq('child_id', childId)
      .neq('content_type', 'child_zone_cards'),
    supabase.from('family_events').select('id, title, event_date').eq('child_id', childId)
      .eq('kind', 'event').eq('active', true)
      .gte('event_date', now.toISOString().slice(0, 10))
      .lte('event_date', new Date(now.getTime() + 5 * 86400000).toISOString().slice(0, 10)),
  ])

  const childName = (child?.name as string) || 'your child'
  const focusData = (weeklyFocus?.focus_data || null) as Record<string, unknown> | null
  const focusTitle = focusData?.focus_title as string | undefined

  const toInsert: {
    child_id: string; user_id: string; type: string;
    title: string; body: string; action_url: string
  }[] = []

  // 1. Check-in due — framed as the child's story, not admin
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
          title: '📊 Time to reflect on the week',
          body: `Dr. Eriksson would love to hear how ${childName}'s week went — the wins count as much as the hard parts. ~15 minutes.`,
          action_url: `/checkin?child=${childId}`,
        })
      }
    }
  }

  // 2. Goals newly achieved — name what the child can now do; the Goal Progression
  // Engine's own notification (with the drafted next step) follows within a minute
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
        title: `🏆 ${childName} did it!`,
        body: `"${goal.label}" is achieved — a skill ${childName} didn't have when you started. Dr. Santos is drafting the natural next step. id:${goal.id}`,
        action_url: `/goals?child=${childId}`,
      })
    }
  }

  // 3. Streak milestone — celebrate what was actually practised, not the number
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
      const practised = Array.from(new Set(
        (recentLogs || []).map(l => (l.activity_title as string) || (l.area as string)).filter(Boolean)
      )).slice(0, 2)
      const practisedText = practised.length
        ? `working on ${practised.join(' and ')}`
        : 'showing up for practice'
      toInsert.push({
        child_id: childId, user_id: userId,
        type: 'streak',
        title: `🔥 ${streak} days in a row`,
        body: `${streak} straight days of ${practisedText}. This daily repetition is exactly how new skills stick for ${childName}.`,
        action_url: `/goals?child=${childId}`,
      })
    }
  }

  // 4. No sessions this week — point at this week's focus starter, smallest possible re-entry
  if ((recentLogs || []).length === 0 && appState?.current_phase === 'active') {
    const existing = await supabase.from('notifications')
      .select('id').eq('child_id', childId).eq('type', 'no_sessions')
      .gte('created_at', new Date(now.getTime() - 72 * 3600000).toISOString())
      .maybeSingle()
    if (!existing.data) {
      const starter = (focusData?.starter_activity as Record<string, unknown>)?.title as string | undefined
      toInsert.push({
        child_id: childId, user_id: userId,
        type: 'no_sessions',
        title: '🌱 A fresh start is one tap away',
        body: focusTitle && starter
          ? `This week's focus is "${focusTitle}" — the ${starter} takes 5 minutes and it's ready on your dashboard.`
          : `Nothing logged yet this week — that's okay. One 5-minute moment with ${childName} tonight restarts everything.`,
        action_url: `/dashboard?child=${childId}`,
      })
    }
  }

  // 5. Content gap (§5.3): an in-progress goal with no fresh material — one nudge at a
  // time, max one per week, so the inbox never piles up
  if (appState?.current_phase === 'active') {
    const workingGoals = (goals || []).filter(g => ['in_progress', 'emerging'].includes(g.status as string))
    const stale = workingGoals
      .map(g => {
        const newest = (recentContent || [])
          .filter(c => c.goal_id === g.id)
          .map(c => new Date(c.generated_at as string).getTime())
          .sort((a, b) => b - a)[0]
        return { goal: g, newest: newest || 0 }
      })
      .filter(({ goal, newest }) => {
        const activeSince = goal.started_at ? new Date(goal.started_at as string).getTime() : 0
        const sevenDaysAgo = now.getTime() - 7 * 86400000
        return newest < sevenDaysAgo && activeSince < sevenDaysAgo
      })
      .sort((a, b) => a.newest - b.newest)[0]

    if (stale) {
      const existing = await supabase.from('notifications')
        .select('id').eq('child_id', childId).eq('type', 'content_gap')
        .gte('created_at', new Date(now.getTime() - 7 * 86400000).toISOString())
        .maybeSingle()
      if (!existing.data) {
        toInsert.push({
          child_id: childId, user_id: userId,
          type: 'content_gap',
          title: '✨ Fresh material for a goal you\'re working on',
          body: `"${stale.goal.label}" hasn't had new material in a while. Emma can make an activity pack or story for it in under a minute.`,
          action_url: `/content?child=${childId}`,
        })
      }
    }
  }

  // 6. Event coming up (family calendar): suggest preparing material ahead of it —
  // one nudge per event ever (tracked by the id marker), and only when nothing was
  // freshly made in the days since the event became known
  for (const event of upcomingEvents || []) {
    const { data: alreadyNudged } = await supabase.from('notifications')
      .select('id').eq('child_id', childId).eq('type', 'event_prep')
      .like('body', `%id:${event.id}%`).maybeSingle()
    if (alreadyNudged) continue
    const eventDay = new Date(event.event_date as string)
      .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
    toInsert.push({
      child_id: childId, user_id: userId,
      type: 'event_prep',
      title: `📅 ${event.title} — ${eventDay}`,
      body: `Knowing what to expect makes days like this easier for ${childName}. Describe it to Emma in Materials ("a social story about ${(event.title as string).toLowerCase()}") and it's ready before it happens. id:${event.id}`,
      action_url: `/content?child=${childId}`,
    })
  }

  if (toInsert.length > 0) {
    await supabase.from('notifications').insert(toInsert)
  }
}
