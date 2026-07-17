'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// Universal quick-log (UX_PLAN.md P1/P3): bottom sheet — pick goal (or arrive with one),
// rate 1-5, optional note, save. A hard session (rating 1-2) flows straight into
// Dr. Eriksson's in-the-moment coaching (§5.4) without leaving the sheet.

type Goal = { id: string; label: string }
type Coaching = { empathy: string; follow_up_question: string; technique_adjustment: string; pattern_insight: string }

export default function PracticeLogger({ childId, goals, initialGoalId, activityTitle, onClose, onLogged }: {
  childId: string
  goals: Goal[]
  initialGoalId?: string | null
  activityTitle?: string
  onClose: () => void
  onLogged?: () => void
}) {
  const supabase = createClient()
  const [goalId, setGoalId] = useState<string>(initialGoalId || goals[0]?.id || '')
  const [rating, setRating] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [phase, setPhase] = useState<'log' | 'coaching-loading' | 'coaching' | 'done'>('log')
  const [coaching, setCoaching] = useState<Coaching | null>(null)
  const [logId, setLogId] = useState<string | null>(null)
  const [coachAnswer, setCoachAnswer] = useState('')
  const [sendingAnswer, setSendingAnswer] = useState(false)

  const RATING_FACES = ['', '😰', '😕', '😐', '😊', '🌟']

  const save = async () => {
    if (!rating) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const goal = goals.find(g => g.id === goalId)
    const { data: savedLog } = await supabase.from('session_logs').insert({
      child_id: childId, user_id: user.id,
      goal_id: goalId || null,
      activity_title: activityTitle || goal?.label || 'Practice session',
      rating, notes: note || null,
      logged_at: new Date().toISOString(),
    }).select('id').single()
    setSaving(false)
    setLogId((savedLog?.id as string) || null)

    if (rating <= 2 && savedLog) {
      setPhase('coaching-loading')
      try {
        const res = await fetch('/api/coaching', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ childId, goalId: goalId || null, rating, notes: note }),
        })
        const { coaching: data } = await res.json()
        if (data) { setCoaching(data); setPhase('coaching') }
        else setPhase('done')
      } catch { setPhase('done') }
    } else {
      setPhase('done')
    }
    onLogged?.()
  }

  const sendCoachAnswer = async () => {
    if (!coaching || !coachAnswer.trim() || !logId) return
    setSendingAnswer(true)
    const { data: log } = await supabase.from('session_logs').select('notes').eq('id', logId).single()
    const appended = `${log?.notes || ''}\n\n[Dr. Eriksson asked] ${coaching.follow_up_question}\n[Parent] ${coachAnswer.trim()}`.trim()
    await supabase.from('session_logs').update({ notes: appended }).eq('id', logId)
    setSendingAnswer(false)
    setPhase('done')
  }

  return (
    // text-gray-900 on the sheet resets colour inheritance — this component mounts
    // inside contexts like the text-white gradient focus card, which otherwise turns
    // the select/textarea text white-on-white (bug found in field use 2026-07-06)
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white text-gray-900 rounded-3xl w-full max-w-md p-5 shadow-2xl">

        {phase === 'log' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="font-black text-base text-gray-900">Log practice</div>
              <button onClick={onClose} aria-label="Close"
                className="w-11 h-11 -mr-2 flex items-center justify-center text-gray-400 text-xl">✕</button>
            </div>

            {goals.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-600 mb-1.5">What did you work on?</label>
                <select value={goalId} onChange={e => setGoalId(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:border-violet-400">
                  {goals.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                  <option value="">Just general practice</option>
                </select>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-600 mb-1.5">How did it go?</label>
              <div className="flex gap-2 justify-between">
                {[1, 2, 3, 4, 5].map(r => (
                  <button key={r} onClick={() => setRating(r)}
                    aria-label={`Rating ${r} of 5`}
                    className="flex-1 min-h-[52px] rounded-2xl text-2xl transition border-2"
                    style={rating === r
                      ? { borderColor: '#21564C', background: '#EDF4F0', transform: 'scale(1.05)' }
                      : { borderColor: '#E5E7EB', background: '#fff' }}>
                    {RATING_FACES[r]}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
                <span>Struggled</span><span>Nailed it</span>
              </div>
            </div>

            <textarea value={note} onChange={e => setNote(e.target.value)}
              placeholder="Anything to remember? (optional)" rows={2}
              className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-violet-400 transition mb-4" />

            <button onClick={save} disabled={saving || !rating}
              className="w-full py-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-black rounded-2xl text-sm transition min-h-[48px]">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}

        {phase === 'coaching-loading' && (
          <div className="text-center py-10">
            <div className="text-4xl animate-pulse mb-3">💛</div>
            <div className="text-sm text-gray-500">That sounded hard. Dr. Eriksson is thinking about this one…</div>
          </div>
        )}

        {phase === 'coaching' && coaching && (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-lg">👩‍⚕️</div>
              <div>
                <div className="text-sm font-bold text-gray-900">Dr. Eriksson</div>
                <div className="text-xs text-gray-400">your guide</div>
              </div>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{coaching.empathy}</p>
            {coaching.pattern_insight && (
              <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-3">
                <div className="text-xs font-bold text-amber-600 mb-0.5">Something I&apos;ve noticed</div>
                <p className="text-sm text-amber-800 leading-relaxed">{coaching.pattern_insight}</p>
              </div>
            )}
            <div className="mt-3 bg-violet-50 rounded-xl px-3.5 py-3">
              <div className="text-xs font-bold text-violet-500 mb-0.5">Try this next time</div>
              <p className="text-sm text-violet-900 leading-relaxed">{coaching.technique_adjustment}</p>
            </div>
            <div className="mt-4">
              <p className="text-sm font-semibold text-gray-900 leading-relaxed">{coaching.follow_up_question}</p>
              <textarea value={coachAnswer} onChange={e => setCoachAnswer(e.target.value)}
                placeholder="One sentence is plenty…" rows={2}
                className="mt-2 w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-violet-400 transition" />
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={sendCoachAnswer} disabled={sendingAnswer || !coachAnswer.trim()}
                className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition min-h-[48px]">
                {sendingAnswer ? 'Sending…' : 'Send to Dr. Eriksson'}
              </button>
              <button onClick={() => setPhase('done')}
                className="px-4 py-3 text-sm font-semibold text-gray-400 hover:text-gray-600 transition min-h-[48px]">
                Skip
              </button>
            </div>
          </>
        )}

        {phase === 'done' && (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🎉</div>
            <div className="font-black text-gray-900 text-base mb-1">Logged!</div>
            <div className="text-sm text-gray-500 mb-5">Every session counts — this is how skills stick.</div>
            <button onClick={onClose}
              className="px-8 py-3 bg-violet-600 text-white font-bold rounded-2xl text-sm min-h-[48px]">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
