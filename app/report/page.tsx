'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not started', color: '#9CA3AF' },
  in_progress:  { label: 'In progress', color: '#F59E0B' },
  emerging:     { label: 'Emerging',    color: '#3B82F6' },
  achieved:     { label: 'Achieved',    color: '#16A34A' },
  paused:       { label: 'Paused',      color: '#9CA3AF' },
}

function ReportContent() {
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const supabase = createClient()
  const printRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    child: Record<string, unknown>
    profile: Record<string, unknown> | null
    goals: Record<string, unknown>[]
    logs: Record<string, unknown>[]
    checkins: Record<string, unknown>[]
  } | null>(null)

  useEffect(() => {
    if (!childId) return
    const load = async () => {
      const [
        { data: child },
        { data: profile },
        { data: goals },
        { data: logs },
        { data: checkins },
      ] = await Promise.all([
        supabase.from('children').select('*').eq('id', childId).single(),
        supabase.from('child_profiles').select('*').eq('child_id', childId).eq('is_current', true).maybeSingle(),
        supabase.from('goals').select('*').eq('child_id', childId).order('area'),
        supabase.from('session_logs').select('*').eq('child_id', childId)
          .order('logged_at', { ascending: false }).limit(30),
        supabase.from('weekly_checkins').select('*').eq('child_id', childId)
          .order('created_at', { ascending: false }).limit(4),
      ])
      if (child) setData({ child, profile, goals: goals || [], logs: logs || [], checkins: checkins || [] })
      setLoading(false)
    }
    load()
  }, [childId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrint = () => window.print()

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="text-4xl mb-3 animate-pulse">📋</div>
        <div className="text-sm text-gray-500">Building your report…</div>
      </div>
    </div>
  )

  if (!data) return <div className="p-8 text-gray-500">Report data not found.</div>

  const { child, profile, goals, logs, checkins } = data
  const childName = child.name as string
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const profileData = profile?.profile_data as Record<string, unknown> | null
  const priorityMatrix = profile?.priority_matrix as { rank: number; label: string; rationale: string; urgency: string }[] | null

  const achieved = goals.filter(g => g.status === 'achieved').length
  const inProgress = goals.filter(g => g.status === 'in_progress').length

  const logDays = new Set(logs.map(l => new Date(l.logged_at as string).toDateString()))
  let streak = 0
  const d = new Date()
  while (logDays.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1) }

  const goalsByArea: Record<string, Record<string, unknown>[]> = {}
  for (const g of goals) {
    const area = (g.area as string) || 'other'
    if (!goalsByArea[area]) goalsByArea[area] = []
    goalsByArea[area].push(g)
  }

  return (
    <>
      {/* Screen controls */}
      <div className="no-print bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href={`/progress?child=${childId}`} className="text-gray-400 hover:text-gray-600 text-sm flex items-center gap-1">
            ← Back
          </Link>
          <div className="font-black text-sm text-gray-900">Progress Report</div>
          <button onClick={handlePrint}
            className="text-xs font-black px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition">
            🖨️ Print / Save PDF
          </button>
        </div>
      </div>

      {/* Report body */}
      <div ref={printRef} className="max-w-3xl mx-auto px-6 py-8 print:px-8 print:py-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b border-gray-200">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🧠</span>
              <span className="font-black text-xl text-gray-900">NeuroNest</span>
            </div>
            <div className="text-gray-500 text-sm">Personalised ASD Support Programme</div>
          </div>
          <div className="text-right">
            <div className="font-black text-lg text-gray-900">{childName}&apos;s Progress Report</div>
            <div className="text-sm text-gray-500">{today}</div>
            {!!child.school_name && (
              <div className="text-sm text-gray-400 mt-0.5">{String(child.school_name)}</div>
            )}
          </div>
        </div>


        <div className="grid grid-cols-4 gap-3 mb-8">
          <div className="border border-gray-200 rounded-xl p-3 text-center">
            <div className="text-2xl font-black text-violet-600">{goals.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">Total goals</div>
          </div>
          <div className="border border-gray-200 rounded-xl p-3 text-center">
            <div className="text-2xl font-black text-emerald-600">{achieved}</div>
            <div className="text-xs text-gray-500 mt-0.5">Achieved</div>
          </div>
          <div className="border border-gray-200 rounded-xl p-3 text-center">
            <div className="text-2xl font-black text-amber-500">{inProgress}</div>
            <div className="text-xs text-gray-500 mt-0.5">In progress</div>
          </div>
          <div className="border border-gray-200 rounded-xl p-3 text-center">
            <div className="text-2xl font-black text-orange-500">{streak}d</div>
            <div className="text-xs text-gray-500 mt-0.5">Streak</div>
          </div>
        </div>

        {/* Child overview */}
        {!!profileData?.snapshot && (
          <div className="mb-8">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-3">Child Overview</h2>
            <div className="bg-violet-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed border border-violet-100">
              {String(profileData.snapshot)}
            </div>
          </div>
        )}

        {/* Priority areas */}
        {!!priorityMatrix && priorityMatrix.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-3">Priority Areas</h2>
            <div className="space-y-2">
              {priorityMatrix.map((p) => (
                <div key={p.rank} className="flex items-start gap-3 border border-gray-200 rounded-xl p-3">
                  <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-black flex-shrink-0">
                    {p.rank}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-gray-900">{p.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{p.rationale}</div>
                  </div>
                  <div className="ml-auto flex-shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                      style={{
                        background: p.urgency === 'high' ? '#FEF2F2' : p.urgency === 'medium' ? '#FFF7ED' : '#F0FDF4',
                        color: p.urgency === 'high' ? '#DC2626' : p.urgency === 'medium' ? '#D97706' : '#16A34A',
                      }}>
                      {p.urgency}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Goals by area */}
        <div className="mb-8">
          <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-3">Goals Status</h2>
          {Object.entries(goalsByArea).map(([area, aGoals]: [string, Record<string, unknown>[]]) => (
            <div key={area} className="mb-4">
              <div className="font-bold text-sm text-gray-700 capitalize mb-2 flex items-center gap-2">
                <div className="w-1 h-4 rounded-full bg-violet-400" />
                {area}
              </div>
              <div className="space-y-2">
                {aGoals.map(goal => {
                  const scfg = STATUS_CONFIG[goal.status as string] || STATUS_CONFIG.not_started
                  const goalLogs = logs.filter(l => l.goal_id === goal.id)
                  const avgRating = goalLogs.length
                    ? Math.round(goalLogs.reduce((s, l) => s + (l.rating as number || 3), 0) / goalLogs.length * 10) / 10
                    : null

                  return (
                    <div key={String(goal.id)} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex items-start gap-3">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5"
                          style={{ background: scfg.color }} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-gray-900">{String(goal.label)}</div>
                          {!!goal.target_criterion && (
                            <div className="text-xs text-gray-500 mt-0.5">Target: {String(goal.target_criterion)}</div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-xs font-bold" style={{ color: scfg.color }}>{scfg.label}</span>
                          {goalLogs.length > 0 && (
                            <span className="text-[10px] text-gray-400">{goalLogs.length} sessions{avgRating ? ` · avg ${avgRating}/5` : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Recent sessions */}
        {logs.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-3">
              Recent Practice Sessions ({logs.length})
            </h2>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold text-gray-600">Date</th>
                    <th className="text-left px-3 py-2 font-bold text-gray-600">Activity</th>
                    <th className="text-left px-3 py-2 font-bold text-gray-600">Area</th>
                    <th className="text-center px-3 py-2 font-bold text-gray-600">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 20).map((log, i) => (
                    <tr key={String(log.id)} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-500">
                        {new Date(log.logged_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-3 py-2 text-gray-800 font-medium">{(log.activity_title as string).slice(0, 45)}</td>
                      <td className="px-3 py-2 text-gray-500 capitalize">{log.area as string || '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {log.rating ? ['','😰','😕','😐','😊','🌟'][log.rating as number] : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Weekly check-in summaries */}
        {checkins.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-3">Weekly Check-in Highlights</h2>
            <div className="space-y-3">
              {checkins.map(checkin => (
                <div key={String(checkin.id)} className="border border-gray-200 rounded-xl p-4">
                  <div className="font-bold text-sm text-gray-900 mb-2">
                    Week {Number(checkin.week_number)} · {new Date(checkin.created_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  {Array.isArray(checkin.wins) && (checkin.wins as string[]).length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10px] font-bold text-emerald-700 mb-1">WINS</div>
                      {(checkin.wins as string[]).map((w, i) => (
                        <div key={i} className="text-xs text-gray-600">✓ {w}</div>
                      ))}
                    </div>
                  )}
                  {Array.isArray(checkin.recommendations) && (checkin.recommendations as string[]).length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold text-blue-700 mb-1">RECOMMENDATIONS</div>
                      {(checkin.recommendations as string[]).map((r, i) => (
                        <div key={i} className="text-xs text-gray-600">→ {r}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-200 pt-4 mt-8 text-xs text-gray-400 flex justify-between">
          <span>Generated by NeuroNest · neuronest-nine.vercel.app</span>
          <span>{today}</span>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          @page { margin: 1.5cm; }
        }
      `}</style>
    </>
  )
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading…</div>}>
      <ReportContent />
    </Suspense>
  )
}
