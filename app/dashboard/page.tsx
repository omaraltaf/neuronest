import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get child
  const { data: children } = await supabase.from('children')
    .select('*').eq('user_id', user.id).order('created_at', { ascending: true })

  // No child yet → onboarding
  if (!children || children.length === 0) {
    redirect('/onboarding/child-setup')
  }

  const child = children[0]

  // Get app state
  const { data: appState } = await supabase.from('app_state')
    .select('*').eq('child_id', child.id).maybeSingle()

  // Route based on phase
  if (!appState || appState.current_phase === 'onboarding') {
    redirect('/onboarding/child-setup')
  }
  if (appState.current_phase === 'intake') {
    redirect(`/onboarding/intake?child=${child.id}`)
  }
  if (appState.current_phase === 'profile_review') {
    // Find latest session
    const { data: session } = await supabase.from('intake_sessions')
      .select('id').eq('child_id', child.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    redirect(`/onboarding/profile-review?child=${child.id}&session=${session?.id || ''}`)
  }
  if (appState.current_phase === 'plan_generation' || appState.current_phase === 'plan_feedback') {
    const { data: profile } = await supabase.from('child_profiles')
      .select('id').eq('child_id', child.id).eq('is_current', true).maybeSingle()
    redirect(`/onboarding/plan?child=${child.id}&profile=${profile?.id || ''}`)
  }

  // Active — load dashboard data
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const [
    { data: goals },
    { data: todayLogs },
    { data: recentLogs },
    { data: recentCheckin },
    { data: currentPlan },
  ] = await Promise.all([
    supabase.from('goals').select('*').eq('child_id', child.id).neq('status', 'achieved'),
    supabase.from('session_logs').select('*').eq('child_id', child.id).gte('logged_at', today.toISOString()),
    supabase.from('session_logs').select('logged_at').eq('child_id', child.id).gte('logged_at', new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString()),
    supabase.from('weekly_checkins').select('*').eq('child_id', child.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('plans').select('*').eq('child_id', child.id).eq('is_current', true).maybeSingle(),
  ])

  // Streak
  const logDays = new Set((recentLogs || []).map((l: { logged_at: string }) => new Date(l.logged_at).toDateString()))
  let streak = 0
  const d = new Date()
  while (logDays.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1) }

  return (
    <DashboardClient
      child={child}
      appState={appState}
      goals={goals || []}
      todayLogs={todayLogs || []}
      streak={streak}
      recentCheckin={recentCheckin}
      currentPlan={currentPlan}
    />
  )
}
