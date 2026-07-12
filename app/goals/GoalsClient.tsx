'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import TabBar from '@/components/TabBar'
import PracticeLogger from '@/components/PracticeLogger'

// Goals as a staged journey, not a wall (field feedback 2026-07-06): parents work on
// 1-2 goals at a time ("Working on now"), the rest wait in "Up next", achieved goals
// collapse into a trophy row. Clinically this IS the NDBI model — few active targets,
// master, then progress — the Goal Progression Engine feeds the queue as goals complete.

const AREA_CONFIG: Record<string, { color: string; icon: string; bg: string }> = {
  communication: { color: '#E8635A', icon: '💬', bg: '#FFF5F5' },
  social:        { color: '#5B7FE8', icon: '🤝', bg: '#F0F4FF' },
  sensory:       { color: '#7C3AED', icon: '🌀', bg: '#F5F0FF' },
  motor:         { color: '#16A34A', icon: '🏃', bg: '#F0FFF4' },
  cognition:     { color: '#0891B2', icon: '🧩', bg: '#F0FBFF' },
  behaviour:     { color: '#D97706', icon: '⚖️', bg: '#FFFBF0' },
  school:        { color: '#DB2777', icon: '🏫', bg: '#FFF0F9' },
  adaptive:      { color: '#0891B2', icon: '🧰', bg: '#F0FBFF' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  not_started: { label: 'Up next', color: '#9CA3AF', dot: '#E5E7EB' },
  in_progress: { label: 'Working on it', color: '#F59E0B', dot: '#F59E0B' },
  emerging:    { label: 'Emerging',    color: '#3B82F6', dot: '#3B82F6' },
  achieved:    { label: 'Achieved',    color: '#16A34A', dot: '#16A34A' },
  paused:      { label: 'Paused',      color: '#9CA3AF', dot: '#9CA3AF' },
}

function GoalProposalCard({ proposal, sourceGoalLabel, child, onResolved }: {
  proposal: Record<string, unknown>
  sourceGoalLabel: string
  child: Record<string, unknown>
  onResolved: () => void
}) {
  const supabase = createClient()
  const [expanded, setExpanded] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [packPhase, setPackPhase] = useState<'making' | 'done' | null>(null)
  const data = proposal.proposal as Record<string, unknown>
  const goal = data.next_goal as Record<string, unknown>

  const resolve = async (action: 'approve' | 'dismiss') => {
    setResolving(action)
    try {
      const res = await fetch('/api/goal-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.id, action }),
      })
      const result = await res.json()

      // §5.2 (optional part, now built): a freshly approved goal starts with material
      // in hand — Emma generates its first activity pack right away. If the parent
      // navigates off mid-generation, the content_gap nudge is the backstop.
      if (action === 'approve' && result.goalId) {
        setPackPhase('making')
        try {
          const genRes = await fetch('/api/content', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              goal: { ...goal, id: result.goalId },
              child,
              contentType: 'activity_pack',
              language: (child.language as string) || 'en',
              action: 'generate',
            }),
          })
          const { content } = await genRes.json()
          if (content && !content.raw) {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
              await supabase.from('generated_content').insert({
                child_id: child.id as string, user_id: user.id,
                goal_id: result.goalId, content_type: 'activity_pack',
                title: content.title || `Starter pack — ${goal.label as string}`,
                content_data: content,
                language: (child.language as string) || 'en',
              })
            }
          }
        } catch (err) {
          console.error('starter pack generation failed:', err)
        }
        setPackPhase('done')
        setTimeout(onResolved, 2500) // let the confirmation be read before the list refreshes
      } else {
        onResolved()
      }
    } finally {
      setResolving(null)
    }
  }

  if (packPhase) {
    return (
      <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-2xl px-4 py-5 shadow-md shadow-emerald-200 text-center">
        {packPhase === 'making' ? (
          <>
            <div className="text-3xl mb-2 animate-pulse">🎯</div>
            <div className="font-black text-base">Goal added!</div>
            <div className="text-sm text-emerald-100 mt-1">Emma is making a starter activity pack so you can begin tonight…</div>
          </>
        ) : (
          <>
            <div className="text-3xl mb-2">🎉</div>
            <div className="font-black text-base">All set</div>
            <div className="text-sm text-emerald-100 mt-1">The goal is in your plan and its starter pack is waiting in Materials.</div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-2xl px-4 py-4 shadow-md shadow-emerald-200">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🏆</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-emerald-100 uppercase tracking-wide">
            &ldquo;{sourceGoalLabel}&rdquo; achieved · Dr. Santos — your planner — suggests
          </div>
          <div className="font-black text-base mt-0.5">{goal.label as string}</div>
          {(data.celebration_message as string) && (
            <p className="text-sm text-emerald-50 mt-1.5 leading-relaxed">🌟 {data.celebration_message as string}</p>
          )}
          <p className="text-sm text-emerald-100 mt-1.5 leading-relaxed">{data.progression_logic as string}</p>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 bg-white/10 rounded-xl p-3.5">
          <div className="text-sm text-emerald-50"><span className="font-bold">Starting from:</span> {goal.baseline as string}</div>
          <div className="text-sm text-emerald-50"><span className="font-bold">Success looks like:</span> {goal.target_criterion as string}</div>
          <div className="text-sm text-emerald-50"><span className="font-bold">Approach:</span> {goal.approach as string}</div>
          <div>
            <div className="text-sm font-bold text-emerald-50 mb-1">Activities:</div>
            <ul className="space-y-1">
              {((goal.activities || []) as string[]).map((a, i) => (
                <li key={i} className="text-sm text-emerald-50 leading-relaxed">• {a}</li>
              ))}
            </ul>
          </div>
          <div className="text-sm text-emerald-100">⏱ Around {goal.timeline_weeks as number} weeks · {goal.evidence_base as string}</div>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button onClick={() => resolve('approve')} disabled={!!resolving}
          className="flex-1 text-sm font-bold px-3 py-3 rounded-full bg-white text-emerald-700 hover:bg-emerald-50 transition disabled:opacity-60 min-h-[48px]">
          {resolving === 'approve' ? 'Adding…' : '✓ Add this goal'}
        </button>
        <button onClick={() => setExpanded(e => !e)}
          className="text-sm font-bold px-4 py-3 rounded-full bg-white/15 hover:bg-white/25 transition min-h-[48px]">
          {expanded ? 'Less ↑' : 'Details ↓'}
        </button>
        <button onClick={() => resolve('dismiss')} disabled={!!resolving}
          className="text-sm font-semibold px-3 py-3 rounded-full text-emerald-100 hover:text-white transition disabled:opacity-60 min-h-[48px]">
          {resolving === 'dismiss' ? '…' : 'Not now'}
        </button>
      </div>
    </div>
  )
}

export default function GoalsClient({ child, goals, recentLogs, proposals, focusGoalIds }: {
  child: Record<string, unknown>
  goals: Record<string, unknown>[]
  recentLogs: Record<string, unknown>[]
  proposals: Record<string, unknown>[]
  focusGoalIds: string[]
  filterArea?: string | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const childId = child.id as string
  const childName = child.name as string

  const [selectedGoal, setSelectedGoal] = useState<Record<string, unknown> | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [logger, setLogger] = useState<{ goalId: string | null } | null>(null)
  const [showAchieved, setShowAchieved] = useState(false)
  const [starting, setStarting] = useState(false)

  // The staged journey
  const nowGoals = goals.filter(g => ['in_progress', 'emerging'].includes(g.status as string))
  const upNextGoals = goals.filter(g => g.status === 'not_started')
  const pausedGoals = goals.filter(g => g.status === 'paused')
  const achievedGoals = goals.filter(g => g.status === 'achieved')

  // Dr. Santos's suggested starting set: this week's focus goals, else the first two
  const suggested = (focusGoalIds.length
    ? upNextGoals.filter(g => focusGoalIds.includes(g.id as string))
    : []
  ).slice(0, 2)
  const suggestedFinal = suggested.length > 0 ? suggested : upNextGoals.slice(0, 2)

  const loggableGoals = [...nowGoals, ...upNextGoals]
    .map(g => ({ id: g.id as string, label: g.label as string }))

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

  const startSuggested = async () => {
    setStarting(true)
    for (const g of suggestedFinal) {
      await supabase.from('goals').update({
        status: 'in_progress', started_at: new Date().toISOString(),
      }).eq('id', g.id as string)
    }
    setStarting(false)
    router.refresh()
  }

  // Count logs per goal last 30 days
  const logCountByGoal: Record<string, number> = {}
  for (const log of recentLogs) {
    const gid = log.goal_id as string
    if (gid) logCountByGoal[gid] = (logCountByGoal[gid] || 0) + 1
  }

  const renderGoalCard = (goal: Record<string, unknown>, dimmed = false) => {
    const area = goal.area as string
    const cfg = AREA_CONFIG[area] || { color: '#7C3AED', icon: '📌', bg: '#F5F0FF' }
    const status = goal.status as string
    const scfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_started
    const recentLogCount = logCountByGoal[goal.id as string] || 0
    const isExpanded = selectedGoal?.id === goal.id

    return (
      <div key={goal.id as string}
        className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${dimmed && !isExpanded ? 'opacity-80' : ''}`}>
        <button className="w-full px-4 py-4 text-left flex items-start gap-3"
          onClick={() => setSelectedGoal(isExpanded ? null : goal)}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0 mt-0.5"
            style={{ background: cfg.bg }}>
            {cfg.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-gray-900 leading-snug">{goal.label as string}</div>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: scfg.dot }} />
              <span className="text-sm font-medium" style={{ color: scfg.color }}>{scfg.label}</span>
              {recentLogCount > 0 && (
                <span className="text-sm text-emerald-600 font-medium">· {recentLogCount}x this month</span>
              )}
            </div>
          </div>
          <span className="text-gray-300 flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-4">
            {!!goal.rationale && (
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Why this goal</div>
                <div className="text-sm text-gray-600 leading-relaxed">{goal.rationale as string}</div>
              </div>
            )}
            {!!goal.approach && (
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Approach</div>
                <div className="text-sm text-gray-600 leading-relaxed">{goal.approach as string}</div>
              </div>
            )}
            {!!goal.target_criterion && (
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Success looks like</div>
                <div className="text-sm text-gray-600 leading-relaxed">{goal.target_criterion as string}</div>
              </div>
            )}

            {/* Primary action depends on stage */}
            {status === 'not_started' ? (
              <button onClick={() => updateStatus(goal.id as string, 'in_progress')}
                disabled={updatingStatus === goal.id}
                className="w-full py-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-black rounded-2xl text-sm transition min-h-[48px]">
                ▶ Start working on this goal
              </button>
            ) : status !== 'achieved' ? (
              <button onClick={() => setLogger({ goalId: goal.id as string })}
                className="w-full py-3.5 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-2xl text-sm transition min-h-[48px]">
                + Log practice on this goal
              </button>
            ) : null}

            {/* Status update */}
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Update status</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(STATUS_CONFIG).map(([s, sc]) => (
                  <button key={s}
                    disabled={updatingStatus === goal.id || status === s}
                    onClick={() => updateStatus(goal.id as string, s)}
                    className="text-sm font-semibold px-3.5 py-2.5 rounded-full border transition disabled:opacity-40 min-h-[44px]"
                    style={status === s
                      ? { background: sc.dot, color: '#fff', borderColor: sc.dot }
                      : { background: '#fff', color: '#6B7280', borderColor: '#E5E7EB' }}>
                    {sc.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {logger && (
        <PracticeLogger
          childId={childId}
          goals={loggableGoals}
          initialGoalId={logger.goalId}
          onClose={() => { setLogger(null); router.refresh() }}
        />
      )}

      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-black text-sm text-gray-900">Goals</div>
            <div className="text-xs text-gray-400">{childName}&apos;s plan · Dr. Santos — your planner</div>
          </div>
          <div className="text-sm font-bold text-violet-600 bg-violet-50 px-3 py-1.5 rounded-full">
            {achievedGoals.length}/{goals.length} achieved
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 pb-32">
        {/* Pending next-goal proposals (Goal Progression Engine) */}
        {proposals.map(p => {
          const sourceGoal = goals.find(g => g.id === p.source_goal_id)
          return (
            <GoalProposalCard key={p.id as string}
              proposal={p}
              sourceGoalLabel={(sourceGoal?.label as string) || 'Goal'}
              child={child}
              onResolved={() => router.refresh()} />
          )
        })}

        {goals.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className="text-3xl mb-3">🎯</div>
            <div className="font-bold text-gray-900 mb-1">No goals yet</div>
            <div className="text-sm text-gray-400">Complete the plan step to generate goals.</div>
            <Link href={`/onboarding/plan?child=${childId}`}
              className="mt-4 inline-block text-sm font-bold text-violet-600 hover:underline">
              Go to plan →
            </Link>
          </div>
        )}

        {/* Start here — no active goals yet: Dr. Santos suggests where to begin */}
        {nowGoals.length === 0 && suggestedFinal.length > 0 && (
          <div className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-3xl px-5 py-5 shadow-md shadow-violet-200">
            <div className="text-xs font-bold text-violet-200 uppercase tracking-wide">🧭 Where to start · Dr. Santos — your planner</div>
            <p className="text-sm text-violet-100 mt-2 leading-relaxed">
              Work on <span className="font-bold text-white">one or two goals at a time</span> — small and
              focused is how skills stick. The others wait their turn and move up as {childName} progresses.
              This week&apos;s plan points at {suggestedFinal.length === 1 ? 'this one' : 'these two'}:
            </p>
            <div className="mt-3 space-y-2">
              {suggestedFinal.map(g => {
                const cfg = AREA_CONFIG[g.area as string] || { icon: '📌' }
                return (
                  <div key={g.id as string} className="bg-white/10 rounded-xl px-3.5 py-3 flex items-center gap-2.5">
                    <span className="text-lg">{cfg.icon}</span>
                    <span className="text-sm font-bold leading-snug">{g.label as string}</span>
                  </div>
                )
              })}
            </div>
            <button onClick={startSuggested} disabled={starting}
              className="mt-3 w-full py-3.5 rounded-2xl bg-white text-violet-700 font-black text-sm active:scale-95 transition disabled:opacity-60 min-h-[48px]">
              {starting ? 'Starting…' : `▶ Start ${suggestedFinal.length === 1 ? 'this goal' : 'these goals'}`}
            </button>
          </div>
        )}

        {/* Working on now */}
        {nowGoals.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-2 px-1">
              <h2 className="text-sm font-black text-gray-900">Working on now</h2>
              <span className="text-xs text-gray-400">1–2 at a time is perfect</span>
            </div>
            <div className="space-y-3">{nowGoals.map(g => renderGoalCard(g))}</div>
          </section>
        )}

        {/* Up next — when the start-here card is up, don't repeat its suggested goals here */}
        {(() => {
          const queue = nowGoals.length === 0
            ? upNextGoals.filter(g => !suggestedFinal.includes(g))
            : upNextGoals
          if (queue.length === 0) return null
          return (
            <section className="pt-2">
              <div className="flex items-baseline justify-between mb-2 px-1">
                <h2 className="text-sm font-black text-gray-500">Up next</h2>
                <span className="text-xs text-gray-400">waiting their turn</span>
              </div>
              <div className="space-y-3">{queue.map(g => renderGoalCard(g, true))}</div>
            </section>
          )
        })()}

        {/* Paused */}
        {pausedGoals.length > 0 && (
          <section className="pt-2">
            <h2 className="text-sm font-black text-gray-500 mb-2 px-1">Paused</h2>
            <div className="space-y-3">{pausedGoals.map(g => renderGoalCard(g, true))}</div>
          </section>
        )}

        {/* Achieved — collapsed trophy row */}
        {achievedGoals.length > 0 && (
          <section className="pt-2">
            <button onClick={() => setShowAchieved(s => !s)}
              className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3.5 flex items-center gap-3 min-h-[52px]">
              <span className="text-xl">🏆</span>
              <span className="flex-1 text-left text-sm font-bold text-emerald-800">
                {achievedGoals.length} goal{achievedGoals.length > 1 ? 's' : ''} achieved
              </span>
              <span className="text-emerald-400">{showAchieved ? '▲' : '▼'}</span>
            </button>
            {showAchieved && (
              <div className="space-y-3 mt-3">{achievedGoals.map(g => renderGoalCard(g, true))}</div>
            )}
          </section>
        )}
      </div>

      {/* Floating quick-log (UX_PLAN.md P3): two taps to a rating from anywhere */}
      {nowGoals.length > 0 && (
        <button onClick={() => setLogger({ goalId: null })}
          className="fixed bottom-20 right-4 z-30 px-5 py-3.5 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-full text-sm shadow-lg shadow-violet-300 transition min-h-[48px]">
          + Log practice
        </button>
      )}

      <TabBar childId={childId} />
    </div>
  )
}
