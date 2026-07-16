'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import TabBar from '@/components/TabBar'
import PracticeLogger from '@/components/PracticeLogger'

// "Today" (UX_PLAN.md P1): one screen, one question — what should I do right now?
// Hero = this week's focus with the practice loop built in. One contextual banner
// maximum. Child Zone launcher. Everything else lives in the bottom tabs.

function mondayOf(d: Date): string {
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday))
  return monday.toISOString().slice(0, 10)
}

function WeeklyFocusCard({ childId, focus, goals, streak, achievedCount, totalGoals, practisedToday }: {
  childId: string
  focus: Record<string, unknown> | null
  goals: { id: string; label: string }[]
  streak: number
  achievedCount: number
  totalGoals: number
  practisedToday: boolean
}) {
  const router = useRouter()
  const [showStarter, setShowStarter] = useState(false)
  const [showPlan, setShowPlan] = useState(false)
  const [showLogger, setShowLogger] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [weekAnswer, setWeekAnswer] = useState('')
  const [sendingAnswer, setSendingAnswer] = useState(false)
  const [answerResult, setAnswerResult] = useState<{ title: string; opportunity: string } | null>(null)

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

  const sendWeekAnswer = async () => {
    if (!weekAnswer.trim()) return
    setSendingAnswer(true)
    try {
      const res = await fetch('/api/weekly-focus', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId, answer: weekAnswer.trim() }),
      })
      const result = await res.json()
      if (result.generated) setAnswerResult(result.generated)
      router.refresh()
    } finally {
      setSendingAnswer(false)
    }
  }

  if (!isCurrentWeek || !data) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 flex items-center gap-3">
        <span className="text-2xl">🎯</span>
        <div className="flex-1">
          <div className="font-bold text-sm text-gray-900">This week&apos;s focus</div>
          <div className="text-sm text-gray-400">Dr. Santos — your planner — hasn&apos;t planned this week yet</div>
        </div>
        <button onClick={generate} disabled={generating}
          className="text-sm font-bold px-4 py-3 rounded-full bg-violet-600 text-white hover:bg-violet-700 transition disabled:opacity-50 min-h-[44px]">
          {generating ? 'Planning… ~1 min' : 'Plan this week'}
        </button>
      </div>
    )
  }

  const tip = data.coaching_tip as Record<string, string> | undefined
  const activity = data.starter_activity as Record<string, unknown> | undefined
  const embeds = (data.embed_opportunities || []) as Record<string, string>[]
  const primaryGoalIds = (data.primary_goal_ids || []) as string[]
  const primaryGoalId = primaryGoalIds[0] || null
  // The thread to the plan, made visible (field feedback 2026-07-13): the focus is
  // this week's step INSIDE the plan — show which goal(s) it serves
  const focusGoals = goals.filter(g => primaryGoalIds.includes(g.id))

  return (
    <div className="bg-gradient-to-br from-violet-600 to-indigo-600 text-white rounded-3xl px-5 py-5 shadow-md shadow-violet-200">
      <div className="text-xs font-bold text-violet-200 uppercase tracking-wide">This week&apos;s step in the plan · Dr. Santos — your planner</div>
      <div className="font-black text-lg mt-1 leading-snug">{data.focus_title as string}</div>
      {focusGoals.length > 0 && (
        <Link href={`/goals?child=${childId}`} className="mt-2 flex flex-wrap gap-1.5">
          {focusGoals.map(g => (
            <span key={g.id} className="inline-flex items-center gap-1 bg-white/15 rounded-full px-3 py-1.5 text-xs font-bold text-violet-50">
              🎯 {g.label} ›
            </span>
          ))}
        </Link>
      )}
      <p className="text-sm text-violet-100 mt-2 leading-relaxed">{data.focus_reason as string}</p>
      {(data.celebrate as string) && (
        <p className="text-sm text-violet-100 mt-2 leading-relaxed">🌟 {data.celebrate as string}</p>
      )}

      {/* The practice loop, right here — the ACTION is the headline (Round 2):
          a busy parent wants "do this now", not a title to interpret */}
      <div className="mt-4 flex gap-2">
        <button onClick={() => setShowStarter(s => !s)}
          className="flex-1 py-3.5 px-3 rounded-2xl bg-white text-violet-700 font-black text-sm leading-snug active:scale-95 transition min-h-[48px] text-left">
          {practisedToday
            ? '✓ Practised today · again?'
            : <>▶ Today&apos;s 5 minutes{activity ? <span className="font-bold">: {activity.title as string}</span> : null}</>}
        </button>
        <button onClick={() => setShowPlan(p => !p)}
          className="px-4 py-3.5 rounded-2xl bg-white/15 hover:bg-white/25 font-bold text-sm transition min-h-[48px] flex-shrink-0">
          {showPlan ? 'Less ↑' : 'Full plan ↓'}
        </button>
      </div>

      {showStarter && activity && (
        <div className="mt-3 bg-white/10 rounded-2xl p-4">
          <div className="text-sm font-bold">{activity.title as string} · {activity.duration_minutes as number} min</div>
          <div className="text-sm text-violet-100 mt-1">You need: {activity.materials as string}</div>
          <ol className="mt-2 space-y-1.5">
            {((activity.steps || []) as string[]).map((s, i) => (
              <li key={i} className="text-sm text-violet-50 leading-relaxed">{i + 1}. {s}</li>
            ))}
          </ol>
          <div className="text-sm text-violet-100 mt-2">✅ Success looks like: {activity.success_looks_like as string}</div>
          <button onClick={() => setShowLogger(true)}
            className="mt-3 w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm transition min-h-[48px]">
            ✓ We did it — log it
          </button>
        </div>
      )}

      {/* Week-ahead question surfaces on the card until answered (Round 2) — buried in
          "Full plan" it starves the content-anticipation loop. One sentence from the
          parent = materials prepared before real events + a grounded plan next Monday. */}
      {!showPlan && (data.week_ahead_question as string) && !(data.week_ahead_answer as string) && !answerResult && (
        <div className="mt-3 bg-white/10 rounded-2xl p-4">
          <div className="text-sm text-violet-50 leading-relaxed">💬 {data.week_ahead_question as string}</div>
          <div className="mt-2 flex gap-2">
            <input value={weekAnswer} onChange={e => setWeekAnswer(e.target.value)}
              placeholder="One sentence is plenty…"
              className="flex-1 px-3.5 py-3 rounded-xl text-sm text-gray-800 bg-white/90 placeholder-gray-400 focus:outline-none" />
            <button onClick={sendWeekAnswer} disabled={sendingAnswer || !weekAnswer.trim()}
              className="text-sm font-bold px-4 py-3 rounded-xl bg-white text-violet-700 disabled:opacity-50 transition min-h-[44px]">
              {sendingAnswer ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}
      {!showPlan && answerResult && (
        <div className="mt-3 bg-white/10 rounded-2xl p-4 text-sm text-violet-50 leading-relaxed">
          ✨ Thanks! Emma prepared <span className="font-bold">&ldquo;{answerResult.title}&rdquo;</span> for {answerResult.opportunity} — it&apos;s in Materials.
        </div>
      )}

      {showPlan && (
        <div className="mt-3 space-y-3">
          {tip && (
            <div className="bg-white/10 rounded-2xl p-4">
              <div className="text-sm font-bold">💡 Technique of the week: {tip.technique}</div>
              <div className="text-sm text-violet-50 mt-1 leading-relaxed">{tip.how_to}</div>
              <div className="text-sm text-violet-200 mt-1 italic">{tip.why_it_works}</div>
            </div>
          )}
          {embeds.length > 0 && (
            <div className="bg-white/10 rounded-2xl p-4">
              <div className="text-sm font-bold mb-1.5">🔄 Weave it into your day</div>
              {embeds.map((e, i) => (
                <div key={i} className="text-sm text-violet-50 leading-relaxed mb-1">
                  <span className="font-semibold capitalize">{e.routine}:</span> {e.what_to_do}
                </div>
              ))}
            </div>
          )}
          {(data.pattern_insight as string) && (
            <div className="bg-white/10 rounded-2xl p-4">
              <div className="text-sm font-bold">🔍 Something I&apos;ve noticed</div>
              <div className="text-sm text-violet-50 mt-1 leading-relaxed">{data.pattern_insight as string}</div>
            </div>
          )}
          {(data.watch_for as string) && (
            <div className="text-sm text-violet-100">👀 Watch for: {data.watch_for as string}</div>
          )}
          {(data.week_ahead_question as string) && (
            <div className="bg-white/10 rounded-2xl p-4">
              <div className="text-sm text-violet-50 leading-relaxed">💬 {data.week_ahead_question as string}</div>
              {answerResult ? (
                <div className="mt-2 text-sm text-violet-50 leading-relaxed">
                  ✨ Thanks! Emma prepared <span className="font-bold">&ldquo;{answerResult.title}&rdquo;</span> for {answerResult.opportunity} — it&apos;s in Materials.
                </div>
              ) : (data.week_ahead_answer as string) ? (
                <div className="mt-2 text-sm text-violet-200 italic">You said: &ldquo;{data.week_ahead_answer as string}&rdquo;</div>
              ) : (
                <div className="mt-2 flex gap-2">
                  <input value={weekAnswer} onChange={e => setWeekAnswer(e.target.value)}
                    placeholder="One sentence is plenty…"
                    className="flex-1 px-3.5 py-3 rounded-xl text-sm text-gray-800 bg-white/90 placeholder-gray-400 focus:outline-none" />
                  <button onClick={sendWeekAnswer} disabled={sendingAnswer || !weekAnswer.trim()}
                    className="text-sm font-bold px-4 py-3 rounded-xl bg-white text-violet-700 disabled:opacity-50 transition min-h-[44px]">
                    {sendingAnswer ? '…' : 'Send'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Momentum line — replaces the old stat tiles */}
      <div className="mt-4 pt-3 border-t border-white/15 text-sm text-violet-100">
        {streak > 0 ? `🔥 ${streak} day${streak > 1 ? 's' : ''} in a row` : '🌱 Ready for today'}
        {totalGoals > 0 && <> · ✅ {achievedCount} of {totalGoals} goals achieved</>}
      </div>

      {showLogger && (
        <PracticeLogger
          childId={childId}
          goals={goals}
          initialGoalId={primaryGoalId}
          activityTitle={(activity?.title as string) || undefined}
          onClose={() => { setShowLogger(false); router.refresh() }}
        />
      )}
    </div>
  )
}

export default function DashboardClient({ child, appState, goals, todayLogs, streak, recentCheckin, weeklyFocus, pendingProposals, allChildren, totalRecentLogs }: {
  child: Record<string, unknown>
  appState: Record<string, unknown>
  goals: Record<string, unknown>[]
  todayLogs: Record<string, unknown>[]
  streak: number
  recentCheckin: Record<string, unknown> | null
  weeklyFocus: Record<string, unknown> | null
  pendingProposals: number
  allChildren: { id: string; name: string }[]
  totalRecentLogs: number
}) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Record<string, unknown>[]>([])
  const [showNotifs, setShowNotifs] = useState(false)

  const childName = child.name as string
  const childId = child.id as string

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

  const now = new Date()
  const lastCheckin = recentCheckin ? new Date(recentCheckin.created_at as string) : null
  const checkinDue = !lastCheckin || (now.getTime() - lastCheckin.getTime()) > 7 * 24 * 3600 * 1000

  const achievedCount = goals.filter(g => g.status === 'achieved').length
  const openGoals = goals
    .filter(g => g.status !== 'achieved' && g.status !== 'paused')
    .map(g => ({ id: g.id as string, label: g.label as string }))

  // Split notifications so celebration and to-do read differently at a glance
  const winTypes = ['goal_achieved', 'streak', 'weekly_focus', 'content_ready']
  const wins = notifications.filter(n => winTypes.includes(n.type as string))
  const forYou = notifications.filter(n => !winTypes.includes(n.type as string))

  const date = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const renderNotif = (n: Record<string, unknown>) => (
    <Link key={n.id as string}
      href={n.action_url as string || '/dashboard'}
      onClick={() => { fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) }); setShowNotifs(false) }}
      className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 transition">
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-gray-900">{n.title as string}</div>
        <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{(n.body as string).replace(/\s*id:[a-z0-9-]+/g, '')}</div>
      </div>
    </Link>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header — identity, notifications, sign out. Navigation lives in the tab bar. */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-base">🧠</div>
            <div>
              <div className="font-black text-sm text-gray-900">NeuroNest</div>
              {allChildren.length > 1 ? (
                <select value={childId}
                  onChange={e => {
                    if (e.target.value === '__add__') router.push('/onboarding/child-setup')
                    else router.push(`/dashboard?child=${e.target.value}`)
                  }}
                  className="text-xs text-gray-500 bg-transparent -ml-1 py-1 focus:outline-none"
                  aria-label="Switch child">
                  {allChildren.map(c => (
                    <option key={c.id} value={c.id}>{c.name}&apos;s platform</option>
                  ))}
                  <option value="__add__">＋ Add a child…</option>
                </select>
              ) : (
                <div className="text-xs text-gray-400">{childName}&apos;s platform</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowNotifs(s => !s)} aria-label="Notifications"
              className="relative w-11 h-11 flex items-center justify-center text-gray-500 hover:text-violet-600 transition text-lg">
              🔔
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 w-4.5 h-4.5 min-w-[18px] px-0.5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                  {notifications.length > 9 ? '9+' : notifications.length}
                </span>
              )}
            </button>
            <Link href="/account" aria-label="Account"
              className="w-11 h-11 flex items-center justify-center text-gray-500 hover:text-violet-600 transition text-lg">
              ⚙️
            </Link>
          </div>
        </div>

        {/* Notification dropdown — wins and to-dos grouped */}
        {showNotifs && (
          <div className="absolute right-4 top-14 w-80 bg-white rounded-2xl border border-gray-100 shadow-lg z-20 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <span className="font-bold text-sm text-gray-900">Notifications</span>
              {notifications.length > 0 && (
                <button onClick={markAllRead} className="text-xs text-violet-600 hover:underline py-1">Mark all read</button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">All caught up! 🎉</div>
              ) : (
                <>
                  {wins.length > 0 && (
                    <div className="px-4 pt-2 pb-1 text-xs font-bold text-emerald-600 uppercase tracking-wide">🎉 Wins</div>
                  )}
                  {wins.map(renderNotif)}
                  {forYou.length > 0 && (
                    <div className="px-4 pt-2 pb-1 text-xs font-bold text-violet-500 uppercase tracking-wide">👉 For you</div>
                  )}
                  {forYou.map(renderNotif)}
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-28">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-black text-gray-900">Hello! 👋</h1>
          <p className="text-sm text-gray-400 mt-0.5">{date}</p>
        </div>

        {/* Handhold for new families (field feedback 2026-07-06: "where do I start?").
            Disappears on its own once logging practice becomes a habit. */}
        {totalRecentLogs < 3 && appState?.current_phase === 'active' && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-sm font-black text-gray-900 mb-2.5">How this works — just 3 steps a day</div>
            <div className="space-y-2">
              <div className="flex gap-2.5 text-sm text-gray-600 leading-relaxed">
                <span className="font-black text-violet-500 flex-shrink-0">1</span>
                <span>Read <span className="font-semibold text-gray-800">this week&apos;s focus</span> in the purple card below — Dr. Santos picks the ONE thing that matters most right now</span>
              </div>
              <div className="flex gap-2.5 text-sm text-gray-600 leading-relaxed">
                <span className="font-black text-violet-500 flex-shrink-0">2</span>
                <span>Do <span className="font-semibold text-gray-800">today&apos;s 5 minutes</span> with {childName} — the activity is inside the card, step by step</span>
              </div>
              <div className="flex gap-2.5 text-sm text-gray-600 leading-relaxed">
                <span className="font-black text-violet-500 flex-shrink-0">3</span>
                <span>Tap <span className="font-semibold text-gray-800">&ldquo;We did it — log it&rdquo;</span> and say how it went — that&apos;s how the plan learns and adapts to {childName}</span>
              </div>
            </div>
            <div className="text-xs text-gray-400 mt-2.5">That&apos;s it. Everything else — goals, materials, progress — flows from these 5 minutes.</div>
          </div>
        )}

        {/* Hero: this week's focus with the practice loop built in */}
        <WeeklyFocusCard
          childId={childId}
          focus={weeklyFocus}
          goals={openGoals}
          streak={streak}
          achievedCount={achievedCount}
          totalGoals={goals.length}
          practisedToday={todayLogs.length > 0}
        />

        {/* ONE contextual banner, priority-ordered — never stacked */}
        {pendingProposals > 0 ? (
          <Link href={`/goals?child=${childId}`}
            className="bg-emerald-600 text-white rounded-2xl px-4 py-3.5 flex items-center gap-3 shadow-md shadow-emerald-200">
            <span className="text-2xl">🏆</span>
            <div className="flex-1">
              <div className="font-bold text-sm">A goal was achieved — the next step is ready</div>
              <div className="text-sm text-emerald-100">Dr. Santos drafted it · one tap to add</div>
            </div>
            <span className="text-white/70">›</span>
          </Link>
        ) : checkinDue && appState?.current_phase === 'active' ? (
          <Link href={`/checkin?child=${childId}`}
            className="bg-white border border-violet-200 rounded-2xl px-4 py-3.5 flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div className="flex-1">
              <div className="font-bold text-sm text-gray-900">Time for your weekly chat</div>
              <div className="text-sm text-gray-400">Dr. Eriksson — your coach · ~15 min</div>
            </div>
            <span className="text-gray-300">›</span>
          </Link>
        ) : null}

        {/* Child Zone launcher — the one destination not in the tabs */}
        <Link href={`/child-zone?child=${childId}`}
          className="block rounded-3xl p-5 bg-gradient-to-br from-amber-400 to-orange-400 active:scale-[0.98] transition shadow-lg text-center">
          <div className="text-5xl mb-1.5">✨</div>
          <div className="font-black text-white text-lg">{childName}&apos;s Zone</div>
          <div className="text-sm text-white/80">Games & words made just for {childName}</div>
        </Link>
      </div>

      <TabBar childId={childId} />
    </div>
  )
}
