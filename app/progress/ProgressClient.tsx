'use client'
import Link from 'next/link'
import TabBar from '@/components/TabBar'

// The records area (UX_PLAN.md P4): the one place to look back — momentum, sessions,
// check-in history, and the occasional admin (school report, documents) live here
// instead of holding front-door rank on Today.

const STATUS_COLORS: Record<string, string> = {
  not_started: '#E5E7EB', in_progress: '#F59E0B',
  emerging: '#3B82F6', achieved: '#16A34A', paused: '#9CA3AF',
}

export default function ProgressClient({ child, goals, logs, checkins }: {
  child: Record<string, unknown>
  goals: Record<string, unknown>[]
  logs: Record<string, unknown>[]
  checkins: Record<string, unknown>[]
}) {
  const childId = child.id as string
  const childName = child.name as string

  const achieved = goals.filter(g => g.status === 'achieved').length
  const inProgress = goals.filter(g => g.status === 'in_progress').length
  const emerging = goals.filter(g => g.status === 'emerging').length

  // Streak calculation
  const logDays = new Set(logs.map(l => new Date(l.logged_at as string).toDateString()))
  let streak = 0
  const d = new Date()
  while (logDays.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1) }

  // Last 30 days log counts by day
  const last30: Record<string, number> = {}
  const now = Date.now()
  for (let i = 29; i >= 0; i--) {
    const day = new Date(now - i * 86400000).toDateString()
    last30[day] = 0
  }
  for (const log of logs) {
    const day = new Date(log.logged_at as string).toDateString()
    if (day in last30) last30[day]++
  }
  const activityDays = Object.entries(last30)

  const latestCompleteCheckin = checkins.find(c => c.completed_at)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="font-black text-sm text-gray-900">Progress</div>
          <div className="text-xs text-gray-400">{childName}&apos;s journey</div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4 pb-28">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Streak', val: streak, icon: '🔥', color: '#F97316' },
            { label: 'Achieved', val: achieved, icon: '✅', color: '#16A34A' },
            { label: 'In progress', val: inProgress, icon: '🎯', color: '#F59E0B' },
            { label: 'Emerging', val: emerging, icon: '🌱', color: '#3B82F6' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
              <div className="text-xl mb-0.5">{s.icon}</div>
              <div className="text-lg font-black" style={{ color: s.color }}>{s.val}</div>
              <div className="text-xs text-gray-400 font-semibold leading-tight">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Activity heatmap */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="text-sm font-black text-gray-900 mb-3">Practice — last 30 days</div>
          <div className="flex gap-1 flex-wrap">
            {activityDays.map(([day, count]) => (
              <div key={day} title={`${day}: ${count} session${count !== 1 ? 's' : ''}`}
                className="w-5 h-5 rounded-sm transition"
                style={{ background: count === 0 ? '#F3F4F6' : count === 1 ? '#DDD6FE' : count === 2 ? '#8B5CF6' : '#5B21B6' }} />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
            <div className="w-3 h-3 rounded-sm bg-gray-200" /> None
            <div className="w-3 h-3 rounded-sm bg-violet-200" /> 1 session
            <div className="w-3 h-3 rounded-sm bg-violet-500" /> 2+
            <div className="w-3 h-3 rounded-sm bg-violet-800" /> 3+
          </div>
        </div>

        {/* Latest check-in summary — one place to look back at what Dr. Eriksson heard */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-black text-gray-900">Weekly check-ins</div>
            <Link href={`/checkin?child=${childId}`} className="text-sm text-violet-600 font-semibold py-1">
              {latestCompleteCheckin ? 'All check-ins →' : 'Start one →'}
            </Link>
          </div>
          {latestCompleteCheckin ? (
            <>
              <div className="text-xs text-gray-400 mb-2">
                Week {latestCompleteCheckin.week_number as number} · with Dr. Eriksson — your coach
              </div>
              {((latestCompleteCheckin.wins || []) as string[]).slice(0, 2).map((w, i) => (
                <div key={i} className="text-sm text-gray-600 flex gap-1.5 mb-1">
                  <span className="text-emerald-500 flex-shrink-0">✓</span><span>{w}</span>
                </div>
              ))}
              {((latestCompleteCheckin.recommendations || []) as string[]).slice(0, 1).map((r, i) => (
                <div key={i} className="text-sm text-gray-600 flex gap-1.5">
                  <span className="text-violet-400 flex-shrink-0">→</span><span>{r}</span>
                </div>
              ))}
            </>
          ) : (
            <div className="text-sm text-gray-400">No check-ins yet — a 15-minute chat with Dr. Eriksson each week keeps the plan on track.</div>
          )}
        </div>

        {/* Goals status breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="text-sm font-black text-gray-900 mb-3">All goals</div>
          <div className="space-y-2.5">
            {goals.map(goal => (
              <div key={goal.id as string} className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: STATUS_COLORS[goal.status as string] || '#E5E7EB' }} />
                <div className="flex-1 text-sm text-gray-700 truncate">{goal.label as string}</div>
                <div className="text-xs text-gray-400 capitalize flex-shrink-0">
                  {(goal.status as string).replace('_', ' ')}
                </div>
              </div>
            ))}
            {goals.length === 0 && (
              <div className="text-sm text-gray-400 text-center py-4">
                No goals yet — <Link href={`/onboarding/plan?child=${childId}`} className="text-violet-600">complete the plan</Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent sessions */}
        {logs.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="text-sm font-black text-gray-900 mb-3">Recent sessions</div>
            <div className="space-y-2">
              {logs.slice(0, 15).map(log => (
                <div key={log.id as string} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center text-base flex-shrink-0">
                    {log.rating ? ['','😰','😕','😐','😊','🌟'][log.rating as number] : '✓'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{log.activity_title as string}</div>
                    {!!log.notes && <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{log.notes as string}</div>}
                  </div>
                  <div className="text-xs text-gray-400 flex-shrink-0">
                    {new Date(log.logged_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reports & files — occasional admin lives here, not on Today */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="text-sm font-black text-gray-900 px-4 pt-4 pb-2">Reports & files</div>
          <Link href={`/report?child=${childId}`}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 border-t border-gray-50 transition">
            <span className="text-xl">📋</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-800">Progress report</div>
              <div className="text-xs text-gray-400">Print or save a PDF for school or clinicians</div>
            </div>
            <span className="text-gray-300">›</span>
          </Link>
          <Link href={`/documents?child=${childId}`}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 border-t border-gray-50 transition">
            <span className="text-xl">📄</span>
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-800">Add documents</div>
              <div className="text-xs text-gray-400">Upload assessments or reports to enrich {childName}&apos;s profile</div>
            </div>
            <span className="text-gray-300">›</span>
          </Link>
        </div>
      </div>

      <TabBar childId={childId} />
    </div>
  )
}
