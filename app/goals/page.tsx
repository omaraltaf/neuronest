import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GoalsClient from './GoalsClient'

export default async function GoalsPage({ searchParams }: { searchParams: { child?: string; area?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const childId = searchParams.child
  if (!childId) redirect('/dashboard')

  const [{ data: child }, { data: goals }, { data: logs }] = await Promise.all([
    supabase.from('children').select('*').eq('id', childId).single(),
    supabase.from('goals').select('*').eq('child_id', childId).order('area'),
    supabase.from('session_logs').select('*').eq('child_id', childId)
      .gte('logged_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()),
  ])

  if (!child) redirect('/dashboard')
  return <GoalsClient child={child} goals={goals || []} recentLogs={logs || []} filterArea={searchParams.area || null} />
}
