import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProgressClient from './ProgressClient'

export default async function ProgressPage({ searchParams }: { searchParams: { child?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const childId = searchParams.child
  if (!childId) redirect('/dashboard')

  const [{ data: child }, { data: goals }, { data: logs }, { data: checkins }] = await Promise.all([
    supabase.from('children').select('*').eq('id', childId).single(),
    supabase.from('goals').select('*').eq('child_id', childId),
    supabase.from('session_logs').select('*').eq('child_id', childId)
      .order('logged_at', { ascending: false }).limit(100),
    supabase.from('weekly_checkins').select('*').eq('child_id', childId)
      .order('created_at', { ascending: false }).limit(10),
  ])

  if (!child) redirect('/dashboard')
  return <ProgressClient child={child} goals={goals || []} logs={logs || []} checkins={checkins || []} />
}
