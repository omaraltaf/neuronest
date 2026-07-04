'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const AREA_CONFIG: Record<string, { color: string; icon: string }> = {
  communication: { color: '#E8635A', icon: '💬' },
  social:        { color: '#5B7FE8', icon: '🤝' },
  sensory:       { color: '#7C3AED', icon: '🌀' },
  motor:         { color: '#16A34A', icon: '🏃' },
  cognition:     { color: '#0891B2', icon: '🧩' },
  behaviour:     { color: '#D97706', icon: '⚖️' },
  school:        { color: '#DB2777', icon: '🏫' },
}

const STATUS_COLORS: Record<string, string> = {
  not_started: '#9CA3AF',
  in_progress: '#F59E0B',
  emerging:    '#3B82F6',
  achieved:    '#16A34A',
  paused:      '#9CA3AF',
}

function mondayOf(d: Date): string {
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday))
  return monday.toISOString().slice(0, 10)
}

function WeeklyFocusCard({ childId, focus }: { childId: string; focus: Record<string, unknown> | null }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [weekAnswer, setWeekAnswer] = useState('')
  const [sendingAnswer, setSendingAnswer] = useState(false)
  const [answerResult, setAnswerResult] = useState<{ title: string; opportunity: string } | null>(null)

  const sendWeekAnswer = async () => {
    if (!weekAnswer.trim()) return
    setSendingAnswer(true)
    try {
      const res = await fetch('/api/weekly-focus', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId, answer: weekAnswer.trim() }),
      })
      const data = await res.json()
      if (data.generated) setAnswerResult(data.generated)
      router.refresh()
    } finally {
      setSendingAnswer(false)
    }
  }

  const isCurrentWeek = focus && (focus.week_start as string) === mondayOf(new Date())
  const data = (focus?.focus_data || null) as Record<string, unknown> | null

  const generate = async () => {
    setGenerating(true)
    try {
      await fetch('/api/weekly-focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId }),
      })
      router.refresh()
    } finally {
      setGenerating(false)
    }
  }

  if (!isCurrentWeek || !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-3">
        <span className="text-2xl">🎯</span>
        <div className="flex-1">
          <div className="font-bold text-sm text-gray-900">This week&apos;s focus</div>
          <div className="text-xs text-gray-400">Dr. Santos hasn&apos;t planned this week yet</div>
        </div>
        <button onClick={generate} disabled={generating}
          className="text-xs font-bold px-3 py-1.5 rounded-full bg-violet-600 text-white hover:bg-violet-700 transition disabled:opacity-50">
          {generating ? 'Planning… ~1 min' : 'Plan this week'}
        </button>
      </div>
    )
  }

  const tip = data.coaching_tip as Record<string, string> | undefined
  const activity = data.starter_activity as Record<string, unknown> | undefined
  const embeds = (data.embed_opportunities || []) as Record<string, string>[]

  return (
    <div className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-2xl px-4 py-4 shadow-md shadow-violet-200">
      <div className="flex items-start gap-3">
        <span className="text-2xl">🎯</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-violet-200 uppercase tracking-wide">This week&apos;s focus · Dr. Santos</div>
          <div className="font-black text-sm mt-0.5">{data.focus_title as string}</div>
          <p className="text-xs text-violet-100 mt-1.5 leading-relaxed">{data.focus_reason as string}</p>
          {(data.celebrate as string) && (
            <p className="text-xs text-violet-100 mt-2 leading-relaxed">🌟 {data.celebrate as string}</p>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3">
          {activity && (
            <div className="bg-white/10 rounded-xl p-3">
              <div className="text-xs font-bold">▶️ Start tonight: {activity.title as string} ({activity.duration_minutes as number} min)</div>
              <div className="text-[11px] text-violet-100 mt-1">You need: {activity.materials as string}</div>
              <ol className="mt-1.5 space-y-1">
                {((activity.steps || []) as string[]).map((s, i) => (
                  <li key={i} className="text-[11px] text-violet-50 leading-relaxed">{i + 1}. {s}</li>
                ))}
              </ol>
              <div className="text-[11px] text-violet-100 mt-1.5">✅ Success looks like: {activity.success_looks_like as string}</div>
            </div>
          )}
          {tip && (
            <div className="bg-white/10 rounded-xl p-3">
              <div className="text-xs font-bold">💡 Technique of the week: {tip.technique}</div>
              <div className="text-[11px] text-violet-50 mt-1 leading-relaxed">{tip.how_to}</div>
              <div className="text-[11px] text-violet-200 mt-1 italic">{tip.why_it_works}</div>
            </div>
          )}
          {embeds.length > 0 && (
            <div className="bg-white/10 rounded-xl p-3">
              <div className="text-xs font-bold mb-1.5">🔄 Weave it into your day</div>
              {embeds.map((e, i) => (
                <div key={i} className="text-[11px] text-violet-50 leading-relaxed mb-1">
                  <span className="font-semibold capitalize">{e.routine}:</span> {e.what_to_do}
                </div>
              ))}
            </div>
          )}
          {(data.pattern_insight as string) && (
            <div className="bg-white/10 rounded-xl p-3">
              <div className="text-xs font-bold">🔍 Something I&apos;ve noticed</div>
              <div className="text-[11px] text-violet-50 mt-1 leading-relaxed">{data.pattern_insight as string}</div>
            </div>
          )}
          {(data.watch_for as string) && (
            <div className="text-[11px] text-violet-100">👀 Watch for: {data.watch_for as string}</div>
          )}
          {(data.week_ahead_question as string) && (
            <div className="bg-white/10 rounded-xl p-3">
              <div className="text-[11px] text-violet-50 leading-relaxed">💬 {data.week_ahead_question as string}</div>
              {answerResult ? (
                <div className="mt-2 text-[11px] text-violet-50 leading-relaxed">
                  ✨ Thanks! Emma prepared <span className="font-bold">&ldquo;{answerResult.title}&rdquo;</span> for {answerResult.opportunity} — it&apos;s in your library.
                </div>
              ) : (data.week_ahead_answer as string) ? (
                <div className="mt-2 text-[11px] text-violet-200 italic">You said: &ldquo;{data.week_ahead_answer as string}&rdquo;</div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <input value={weekAnswer} onChange={e => setWeekAnswer(e.target.value)}
                    placeholder="One sentence is plenty…"
                    className="flex-1 px-3 py-2 rounded-xl text-[11px] text-gray-800 bg-white/90 placeholder-gray-400 focus:outline-none" />
                  <button onClick={sendWeekAnswer} disabled={sendingAnswer || !weekAnswer.trim()}
                    className="text-[11px] font-bold px-3 py-2 rounded-xl bg-white text-violet-700 disabled:opacity-50 transition">
                    {sendingAnswer ? '…' : 'Send'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <button onClick={() => setExpanded(e => !e)}
        className="mt-3 text-xs font-bold text-white/90 hover:text-white transition">
        {expanded ? 'Show less ↑' : 'See the plan for this week ↓'}
      </button>
    </div>
  )
}

function CheckinDueBanner({ childId }: { childId: string }) {
  return (
    <Link href={`/checkin?child=${childId}`}
      className="block bg-violet-600 text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-md shadow-violet-200">
      <span className="text-2xl">📊</span>
      <div className="flex-1">
        <div className="font-bold text-sm">Weekly check-in is due</div>
        <div className="text-xs text-violet-200">Review progress with Dr. Eriksson · ~15 min</div>
      </div>
      <span className="text-white/70">›</span>
    </Link>
  )
}

export default function DashboardClient({ child, appState, goals, todayLogs, streak, recentCheckin, currentPlan, weeklyFocus }: {
  child: Record<string, unknown>
  appState: Record<string, unknown>
  goals: Record<string, unknown>[]
  todayLogs: Record<string, unknown>[]
  streak: number
  recentCheckin: Record<string, unknown> | null
  currentPlan: Record<string, unknown> | null
  weeklyFocus: Record<string, unknown> | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const [notifications, setNotifications] = useState<Record<string, unknown>[]>([])
  const [showNotifs, setShowNotifs] = useState(false)

  useEffect(() => {
    const fetchNotifs = async () => {
      const res = await fetch(`/api/notifications?child=${childId}`)
      const { notifications: notifs } = await res.json()
      setNotifications(notifs || [])
    }
    fetchNotifs()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const markAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true, childId }),
    })
    setNotifications([])
    setShowNotifs(false)
  }
  const childName = child.name as string
  const childId = child.id as string

  const now = new Date()
  const lastCheckin = recentCheckin ? new Date(recentCheckin.created_at as string) : null
  const checkinDue = !lastCheckin || (now.getTime() - lastCheckin.getTime()) > 7 * 24 * 3600 * 1000

  const totalGoals = goals.length
  const inProgress = goals.filter(g => g.status === 'in_progress').length
  const byArea: Record<string, Record<string, unknown>[]> = {}
  for (const g of goals) {
    const area = (g.area as string) || 'other'
    if (!byArea[area]) byArea[area] = []
    byArea[area].push(g)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-sm">🧠</div>
            <div>
              <div className="font-black text-sm text-gray-900">NeuroNest</div>
              <div className="text-[10px] text-gray-400">{childName}&apos;s platform</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/child-zone?child=${childId}`}
              className="text-xs font-bold px-3 py-1.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100 hover:bg-violet-100 transition">
              ✨ {childName}&apos;s Zone
            </Link>
            <button onClick={() => setShowNotifs(s => !s)} className="relative p-1.5 text-gray-500 hover:text-violet-600 transition">
              🔔
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>
            <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600 transition">Sign out</button>
          </div>
        </div>

        {/* Notification dropdown */}
        {showNotifs && (
          <div className="absolute right-4 top-14 w-80 bg-white rounded-2xl border border-gray-100 shadow-lg z-20 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <span className="font-bold text-sm text-gray-900">Notifications</span>
              {notifications.length > 0 && (
                <button onClick={markAllRead} className="text-xs text-violet-600 hover:underline">Mark all read</button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-gray-400">All caught up! 🎉</div>
              ) : notifications.map(n => (
                <Link key={n.id as string}
                  href={n.action_url as string || '/dashboard'}
                  onClick={() => { fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) }); setShowNotifs(false) }}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs text-gray-900">{n.title as string}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{(n.body as string).replace(/\s*id:[a-z0-9-]+/g, '')}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Nav */}
        <div className="max-w-2xl mx-auto px-4 pb-2 flex gap-1">
          {[
            { href: '/dashboard', label: '🏠 Home' },
            { href: `/goals?child=${childId}`, label: '🎯 Goals' },
            { href: `/progress?child=${childId}`, label: '📈 Progress' },
            { href: `/ai?child=${childId}`, label: '💬 Ask AI' },
          ].map(n => (
            <Link key={n.href} href={n.href}
              className="text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-gray-100 text-gray-600 transition">
              {n.label}
            </Link>
          ))}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-12">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-black text-gray-900">Hello! 👋</h1>
          <p className="text-sm text-gray-400 mt-0.5">{date}</p>
        </div>

        {/* This week's focus (Weekly Planning Agent) */}
        <WeeklyFocusCard childId={childId} focus={weeklyFocus} />

        {/* Check-in banner */}
        {checkinDue && <CheckinDueBanner childId={childId} />}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Day streak', val: streak, icon: '🔥', color: '#F97316' },
            { label: 'Done today', val: todayLogs.length, icon: '✅', color: '#16A34A' },
            { label: 'Active goals', val: inProgress, icon: '🎯', color: '#7C3AED' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
              <div className="text-2xl mb-1">{s.icon}</div>
              <div className="text-xl font-black" style={{ color: s.color }}>{s.val}</div>
              <div className="text-[10px] text-gray-400 font-semibold">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Goals by area */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black text-gray-900">Active Goals</h2>
            <Link href={`/goals?child=${childId}`} className="text-xs text-violet-600 font-semibold">View all →</Link>
          </div>
          <div className="space-y-2">
            {Object.entries(byArea).map(([area, aGoals]) => {
              const cfg = AREA_CONFIG[area] || { color: '#7C3AED', icon: '📌' }
              return (
                <Link key={area} href={`/goals?child=${childId}&area=${area}`}
                  className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-gray-200 transition">
                  <span className="text-xl">{cfg.icon}</span>
                  <div className="flex-1">
                    <div className="font-bold text-sm text-gray-900 capitalize">{area}</div>
                    <div className="text-xs text-gray-400">{aGoals.length} goal{aGoals.length > 1 ? 's' : ''}</div>
                  </div>
                  <div className="flex gap-1">
                    {aGoals.slice(0, 3).map((g, i) => (
                      <div key={i} className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[g.status as string] || '#E5E7EB' }} />
                    ))}
                  </div>
                  <span className="text-gray-300 text-sm">›</span>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Quick actions */}
        <div>
          <h2 className="text-sm font-black text-gray-900 mb-3">Quick access</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: `/checkin?child=${childId}`, icon: '📊', label: 'Weekly check-in', desc: 'Review progress with Dr. Eriksson', color: '#7C3AED' },
              { href: `/child-zone?child=${childId}`, icon: '✨', label: `${childName}'s Zone`, desc: 'Games, flashcards & songs', color: '#E8635A' },
              { href: `/ai?child=${childId}`, icon: '💬', label: 'Ask a question', desc: 'Get specific guidance', color: '#5B7FE8' },
              { href: `/progress?child=${childId}`, icon: '📈', label: 'View progress', desc: 'Milestones & history', color: '#16A34A' },
              { href: `/documents?child=${childId}`, icon: '📄', label: 'Add documents', desc: 'Upload reports to enrich profile', color: '#0891B2' },
              { href: `/content?child=${childId}`, icon: '✨', label: 'Content library', desc: 'Activities, stories & flashcards', color: '#7C3AED' },
              { href: `/report?child=${childId}`, icon: '📋', label: 'Progress report', desc: 'Print or save PDF for school', color: '#16A34A' },
            ].map(a => (
              <Link key={a.href} href={a.href}
                className="bg-white rounded-2xl border border-gray-100 p-4 hover:border-gray-200 transition">
                <div className="text-2xl mb-2">{a.icon}</div>
                <div className="font-bold text-sm text-gray-900 mb-0.5">{a.label}</div>
                <div className="text-xs text-gray-400">{a.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
