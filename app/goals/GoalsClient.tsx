'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

const AREA_CONFIG: Record<string, { color: string; icon: string; bg: string }> = {
  communication: { color: '#E8635A', icon: '💬', bg: '#FFF5F5' },
  social:        { color: '#5B7FE8', icon: '🤝', bg: '#F0F4FF' },
  sensory:       { color: '#7C3AED', icon: '🌀', bg: '#F5F0FF' },
  motor:         { color: '#16A34A', icon: '🏃', bg: '#F0FFF4' },
  cognition:     { color: '#0891B2', icon: '🧩', bg: '#F0FBFF' },
  behaviour:     { color: '#D97706', icon: '⚖️', bg: '#FFFBF0' },
  school:        { color: '#DB2777', icon: '🏫', bg: '#FFF0F9' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  not_started: { label: 'Not started', color: '#9CA3AF', dot: '#E5E7EB' },
  in_progress: { label: 'In progress', color: '#F59E0B', dot: '#F59E0B' },
  emerging:    { label: 'Emerging',    color: '#3B82F6', dot: '#3B82F6' },
  achieved:    { label: 'Achieved',    color: '#16A34A', dot: '#16A34A' },
  paused:      { label: 'Paused',      color: '#9CA3AF', dot: '#9CA3AF' },
}

function GoalProposalCard({ proposal, sourceGoalLabel, onResolved }: {
  proposal: Record<string, unknown>
  sourceGoalLabel: string
  onResolved: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const data = proposal.proposal as Record<string, unknown>
  const goal = data.next_goal as Record<string, unknown>

  const resolve = async (action: 'approve' | 'dismiss') => {
    setResolving(action)
    try {
      await fetch('/api/goal-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.id, action }),
      })
      onResolved()
    } finally {
      setResolving(null)
    }
  }

  return (
    <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-2xl px-4 py-4 shadow-md shadow-emerald-200">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🏆</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-emerald-100 uppercase tracking-wide">
            &ldquo;{sourceGoalLabel}&rdquo; achieved · Dr. Santos suggests
          </div>
          <div className="font-black text-sm mt-0.5">{goal.label as string}</div>
          {(data.celebration_message as string) && (
            <p className="text-xs text-emerald-50 mt-1.5 leading-relaxed">🌟 {data.celebration_message as string}</p>
          )}
          <p className="text-xs text-emerald-100 mt-1.5 leading-relaxed">{data.progression_logic as string}</p>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 bg-white/10 rounded-xl p-3">
          <div className="text-[11px] text-emerald-50"><span className="font-bold">Starting from:</span> {goal.baseline as string}</div>
          <div className="text-[11px] text-emerald-50"><span className="font-bold">Success looks like:</span> {goal.target_criterion as string}</div>
          <div className="text-[11px] text-emerald-50"><span className="font-bold">Approach:</span> {goal.approach as string}</div>
          <div>
            <div className="text-[11px] font-bold text-emerald-50 mb-1">Activities:</div>
            <ul className="space-y-1">
              {((goal.activities || []) as string[]).map((a, i) => (
                <li key={i} className="text-[11px] text-emerald-50 leading-relaxed">• {a}</li>
              ))}
            </ul>
          </div>
          <div className="text-[11px] text-emerald-100">⏱ Around {goal.timeline_weeks as number} weeks · {goal.evidence_base as string}</div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => resolve('approve')} disabled={!!resolving}
          className="flex-1 text-xs font-bold px-3 py-2 rounded-full bg-white text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-60">
          {resolving === 'approve' ? 'Adding…' : '✓ Add this goal'}
        </button>
        <button onClick={() => setExpanded(e => !e)}
          className="text-xs font-bold px-3 py-2 rounded-full bg-white/15 hover:bg-white/25 transition">
          {expanded ? 'Less ↑' : 'Details ↓'}
        </button>
        <button onClick={() => resolve('dismiss')} disabled={!!resolving}
          className="text-xs font-semibold px-3 py-2 rounded-full text-emerald-100 hover:text-white transition disabled:opacity-60">
          {resolving === 'dismiss' ? '…' : 'Not now'}
        </button>
      </div>
    </div>
  )
}

export default function GoalsClient({ child, goals, recentLogs, proposals, filterArea }: {
  child: Record<string, unknown>
  goals: Record<string, unknown>[]
  recentLogs: Record<string, unknown>[]
  proposals: Record<string, unknown>[]
  filterArea: string | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const childId = child.id as string
  const childName = child.name as string

  const [selectedGoal, setSelectedGoal] = useState<Record<string, unknown> | null>(null)
  const [logNote, setLogNote] = useState('')
  const [logRating, setLogRating] = useState(3)
  const [logging, setLogging] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [coaching, setCoaching] = useState<{
    loading: boolean
    logId: string
    data: { empathy: string; follow_up_question: string; technique_adjustment: string; pattern_insight: string } | null
  } | null>(null)
  const [coachAnswer, setCoachAnswer] = useState('')
  const [sendingAnswer, setSendingAnswer] = useState(false)

  const areas = Array.from(new Set(goals.map(g => g.area as string)))
  const filteredGoals = filterArea ? goals.filter(g => g.area === filterArea) : goals

  const logSession = async (goalId: string) => {
    setLogging(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const goal = goals.find(g => g.id === goalId)
    const { data: savedLog } = await supabase.from('session_logs').insert({
      child_id: childId, user_id: user.id, goal_id: goalId,
      activity_title: goal?.label as string || 'Practice session',
      area: goal?.area as string || null,
      rating: logRating,
      notes: logNote || null,
      logged_at: new Date().toISOString(),
    }).select('id').single()
    const savedRating = logRating
    const savedNote = logNote
    setLogging(false)
    setLogNote('')
    setSelectedGoal(null)
    router.refresh()

    // Parent Coaching Loop (§5.4): a hard session gets a warm, specific response
    // in the moment — not just a saved row.
    if (savedRating <= 2 && savedLog) {
      setCoaching({ loading: true, logId: savedLog.id as string, data: null })
      try {
        const res = await fetch('/api/coaching', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ childId, goalId, rating: savedRating, notes: savedNote }),
        })
        const { coaching: data } = await res.json()
        if (data) setCoaching({ loading: false, logId: savedLog.id as string, data })
        else setCoaching(null)
      } catch {
        setCoaching(null)
      }
    }
  }

  const sendCoachAnswer = async () => {
    if (!coaching?.data || !coachAnswer.trim()) return
    setSendingAnswer(true)
    // Append Q&A to the log's notes — the check-in and weekly-planning agents read these
    const { data: log } = await supabase.from('session_logs').select('notes').eq('id', coaching.logId).single()
    const appended = `${log?.notes || ''}\n\n[Dr. Eriksson asked] ${coaching.data.follow_up_question}\n[Parent] ${coachAnswer.trim()}`.trim()
    await supabase.from('session_logs').update({ notes: appended }).eq('id', coaching.logId)
    setSendingAnswer(false)
    setCoachAnswer('')
    setCoaching(null)
  }

  const updateStatus = async (goalId: string, status: string) => {
    setUpdatingStatus(goalId)
    await supabase.from('goals').update({
      status,
      started_at: status === 'in_progress' ? new Date().toISOString() : undefined,
      achieved_at: status === 'achieved' ? new Date().toISOString() : undefined,
    }).eq('id', goalId)
    setUpdatingStatus(null)
    router.refresh()
  }

  // Count logs per goal last 30 days
  const logCountByGoal: Record<string, number> = {}
  for (const log of recentLogs) {
    const gid = log.goal_id as string
    if (gid) logCountByGoal[gid] = (logCountByGoal[gid] || 0) + 1
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* In-the-moment coaching after a hard session (§5.4) */}
      {coaching && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-5 shadow-2xl">
            {coaching.loading ? (
              <div className="text-center py-8">
                <div className="text-4xl animate-pulse mb-3">💛</div>
                <div className="text-sm text-gray-500">Dr. Eriksson is thinking about this one…</div>
              </div>
            ) : coaching.data && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">👩‍⚕️</div>
                  <div className="text-xs font-bold text-gray-900">Dr. Eriksson</div>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{coaching.data.empathy}</p>
                {coaching.data.pattern_insight && (
                  <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                    <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-0.5">Something I&apos;ve noticed</div>
                    <p className="text-xs text-amber-800 leading-relaxed">{coaching.data.pattern_insight}</p>
                  </div>
                )}
                <div className="mt-3 bg-violet-50 rounded-xl px-3 py-2.5">
                  <div className="text-[10px] font-bold text-violet-500 uppercase tracking-wide mb-0.5">Try this next time</div>
                  <p className="text-xs text-violet-900 leading-relaxed">{coaching.data.technique_adjustment}</p>
                </div>
                <div className="mt-4">
                  <p className="text-sm font-semibold text-gray-900 leading-relaxed">{coaching.data.follow_up_question}</p>
                  <textarea value={coachAnswer} onChange={e => setCoachAnswer(e.target.value)}
                    placeholder="One sentence is plenty…" rows={2}
                    className="mt-2 w-full px-3 py-2 rounded-xl border border-gray-200 text-xs resize-none focus:outline-none focus:border-violet-400 transition" />
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={sendCoachAnswer} disabled={sendingAnswer || !coachAnswer.trim()}
                    className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition">
                    {sendingAnswer ? 'Sending…' : 'Send to Dr. Eriksson'}
                  </button>
                  <button onClick={() => { setCoaching(null); setCoachAnswer('') }}
                    className="px-4 py-2.5 text-xs font-semibold text-gray-400 hover:text-gray-600 transition">
                    Skip
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-lg">←</Link>
            <div>
              <div className="font-black text-sm text-gray-900">Goals</div>
              <div className="text-[10px] text-gray-400">{childName}&apos;s intervention plan</div>
            </div>
          </div>
          <div className="text-xs font-bold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full">
            {goals.filter(g => g.status === 'achieved').length}/{goals.length} achieved
          </div>
        </div>
        {/* Area filter tabs */}
        <div className="max-w-2xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
          <Link href={`/goals?child=${childId}`}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition ${!filterArea ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            All ({goals.length})
          </Link>
          {areas.map(area => {
            const cfg = AREA_CONFIG[area] || { icon: '📌', color: '#7C3AED', bg: '#F5F0FF' }
            const count = goals.filter(g => g.area === area).length
            return (
              <Link key={area} href={`/goals?child=${childId}&area=${area}`}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition flex items-center gap-1 ${filterArea === area ? 'text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                style={filterArea === area ? { background: cfg.color } : {}}>
                {cfg.icon} {area} ({count})
              </Link>
            )
          })}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 pb-12">
        {/* Pending next-goal proposals (Goal Progression Engine) */}
        {proposals.map(p => {
          const sourceGoal = goals.find(g => g.id === p.source_goal_id)
          return (
            <GoalProposalCard key={p.id as string}
              proposal={p}
              sourceGoalLabel={(sourceGoal?.label as string) || 'Goal'}
              onResolved={() => router.refresh()} />
          )
        })}

        {filteredGoals.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className="text-3xl mb-3">🎯</div>
            <div className="font-bold text-gray-900 mb-1">No goals yet</div>
            <div className="text-sm text-gray-400">Complete the plan step to generate goals.</div>
            <Link href={`/onboarding/plan?child=${childId}`}
              className="mt-4 inline-block text-xs font-bold text-violet-600 hover:underline">
              Go to plan →
            </Link>
          </div>
        )}

        {filteredGoals.map(goal => {
          const area = goal.area as string
          const cfg = AREA_CONFIG[area] || { color: '#7C3AED', icon: '📌', bg: '#F5F0FF' }
          const status = goal.status as string
          const scfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_started
          const recentLogCount = logCountByGoal[goal.id as string] || 0
          const isExpanded = selectedGoal?.id === goal.id

          return (
            <div key={goal.id as string}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Goal header */}
              <button className="w-full px-4 py-4 text-left flex items-start gap-3"
                onClick={() => setSelectedGoal(isExpanded ? null : goal)}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0 mt-0.5"
                  style={{ background: cfg.bg }}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-gray-900 leading-snug">{goal.label as string}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: scfg.dot }} />
                    <span className="text-xs font-medium" style={{ color: scfg.color }}>{scfg.label}</span>
                    {!!goal.timeline_weeks && (
                      <span className="text-xs text-gray-400">· {goal.timeline_weeks as number}w</span>
                    )}
                    {recentLogCount > 0 && (
                      <span className="text-xs text-emerald-600 font-medium">· {recentLogCount}x this month</span>
                    )}
                  </div>
                </div>
                <span className="text-gray-300 flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-4">
                  {/* Rationale */}
                  {!!goal.rationale && (
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Why this goal</div>
                      <div className="text-xs text-gray-600 leading-relaxed">{goal.rationale as string}</div>
                    </div>
                  )}
                  {/* Approach */}
                  {!!goal.approach && (
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Approach</div>
                      <div className="text-xs text-gray-600 leading-relaxed">{goal.approach as string}</div>
                    </div>
                  )}
                  {/* Target */}
                  {!!goal.target_criterion && (
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Success looks like</div>
                      <div className="text-xs text-gray-600 leading-relaxed">{goal.target_criterion as string}</div>
                    </div>
                  )}

                  {/* Status update */}
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Update status</div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(STATUS_CONFIG).map(([s, sc]) => (
                        <button key={s}
                          disabled={updatingStatus === goal.id || status === s}
                          onClick={() => updateStatus(goal.id as string, s)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-full border transition disabled:opacity-40"
                          style={status === s
                            ? { background: sc.dot, color: '#fff', borderColor: sc.dot }
                            : { background: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }}>
                          {sc.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Log session */}
                  <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Log a session</div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1.5">How did it go? (1 = struggled, 5 = nailed it)</div>
                      <div className="flex gap-2">
                        {[1,2,3,4,5].map(r => (
                          <button key={r} onClick={() => setLogRating(r)}
                            className="w-8 h-8 rounded-full text-sm font-bold transition"
                            style={logRating === r
                              ? { background: cfg.color, color: '#fff' }
                              : { background: '#E5E7EB', color: '#6B7280' }}>
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea value={logNote} onChange={e => setLogNote(e.target.value)}
                      placeholder="Optional note — what happened?" rows={2}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs resize-none focus:outline-none focus:border-violet-400 transition" />
                    <button onClick={() => logSession(goal.id as string)} disabled={logging}
                      className="w-full py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition">
                      {logging ? 'Saving…' : '+ Log session'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
