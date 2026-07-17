import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GoalsClient from './GoalsClient'

export default async function GoalsPage({ searchParams }: { searchParams: { child?: string; area?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const childId = searchParams.child
  if (!childId) redirect('/dashboard')

  const [{ data: child }, { data: goals }, { data: logs }, { data: proposals }, { data: weeklyFocus }, { data: goalContent }, { data: latestCheckin }] = await Promise.all([
    supabase.from('children').select('*').eq('id', childId).single(),
    supabase.from('goals').select('*').eq('child_id', childId).order('area'),
    supabase.from('session_logs').select('*').eq('child_id', childId)
      .gte('logged_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
      .order('logged_at', { ascending: false }),
    supabase.from('goal_proposals').select('*').eq('child_id', childId)
      .eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('weekly_focus').select('focus_data').eq('child_id', childId)
      .order('week_start', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('generated_content').select('goal_id, content_type').eq('child_id', childId)
      .neq('content_type', 'child_zone_cards'),
    supabase.from('weekly_checkins').select('week_number, wins, recommendations, completed_at')
      .eq('child_id', childId).not('completed_at', 'is', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (!child) redirect('/dashboard')
  // Dr. Eriksson's suggested starting goals = this week's focus goals (fallback: first two)
  const focusGoalIds = ((weeklyFocus?.focus_data as { primary_goal_ids?: string[] })?.primary_goal_ids) || []
  return <GoalsClient child={child} goals={goals || []} recentLogs={logs || []} proposals={proposals || []}
    focusGoalIds={focusGoalIds} goalContent={goalContent || []} latestCheckin={latestCheckin} />
}
