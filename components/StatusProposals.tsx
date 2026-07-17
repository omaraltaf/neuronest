'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Goal status proposals (2026-07-17): after a check-in, Dr. Eriksson may suggest
// flipping a goal's status — "mark achieved" or "start now" — citing what the parent
// told her. The parent confirms with one tap; the system never silently rewrites the
// plan. Accepting 'achieved' sets achieved_at, which fires the goal_achieved_progression
// trigger (celebration + next-goal draft) automatically.

type Proposal = {
  id: string
  goal_id: string
  proposed_status: 'achieved' | 'in_progress'
  reason: string
}

export default function StatusProposals({ childId, goals }: {
  childId: string
  goals: Record<string, unknown>[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [resolving, setResolving] = useState<string | null>(null)

  useEffect(() => {
    if (!childId) return
    supabase.from('goal_status_proposals')
      .select('id, goal_id, proposed_status, reason')
      .eq('child_id', childId).eq('status', 'pending')
      .order('created_at')
      .then(({ data }) => setProposals((data || []) as Proposal[]))
  }, [childId]) // eslint-disable-line react-hooks/exhaustive-deps

  const resolve = async (p: Proposal, accept: boolean) => {
    setResolving(p.id)
    if (accept) {
      // The goal update is the meaningful act; achieved_at triggers the Progression
      // Engine, started_at starts the journey stage
      await supabase.from('goals').update({
        status: p.proposed_status,
        ...(p.proposed_status === 'achieved'
          ? { achieved_at: new Date().toISOString() }
          : { started_at: new Date().toISOString() }),
      }).eq('id', p.goal_id)
    }
    await supabase.from('goal_status_proposals').update({
      status: accept ? 'accepted' : 'dismissed',
      resolved_at: new Date().toISOString(),
    }).eq('id', p.id)
    setProposals(prev => prev.filter(x => x.id !== p.id))
    setResolving(null)
    if (accept) router.refresh()
  }

  if (!proposals.length) return null

  return (
    <div className="space-y-2">
      {proposals.map(p => {
        const goal = goals.find(g => g.id === p.goal_id)
        if (!goal) return null
        const achieved = p.proposed_status === 'achieved'
        return (
          <div key={p.id}
            className={`rounded-2xl px-4 py-4 shadow-md text-white ${
              achieved
                ? 'bg-gradient-to-br from-emerald-600 to-teal-600 shadow-emerald-200'
                : 'bg-gradient-to-br from-violet-600 to-indigo-600 shadow-violet-200'
            }`}>
            <div className="flex items-start gap-3">
              <span className="text-2xl">{achieved ? '🏆' : '▶️'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">
                  From your check-in · Dr. Eriksson — your guide — suggests
                </div>
                <div className="font-black text-base mt-0.5">
                  {achieved ? 'Mark as achieved: ' : 'Start working on: '}
                  {goal.label as string}
                </div>
                <p className="text-sm mt-1.5 leading-relaxed opacity-90">{p.reason}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => resolve(p, true)} disabled={!!resolving}
                className={`flex-1 text-sm font-bold px-3 py-3 rounded-full bg-white transition disabled:opacity-60 min-h-[48px] ${
                  achieved ? 'text-emerald-700 hover:bg-emerald-50' : 'text-violet-700 hover:bg-violet-50'
                }`}>
                {resolving === p.id ? '…' : achieved ? '✓ Yes — achieved!' : "✓ Yes — let's start"}
              </button>
              <button onClick={() => resolve(p, false)} disabled={!!resolving}
                className="text-sm font-semibold px-4 py-3 rounded-full bg-white/15 hover:bg-white/25 transition disabled:opacity-60 min-h-[48px]">
                Not yet
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
