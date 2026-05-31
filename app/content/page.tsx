'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const CONTENT_TYPES = [
  { id: 'social_story',   icon: '📖', label: 'Social Story',    desc: 'A personalised story to build understanding' },
  { id: 'activity_pack',  icon: '🎯', label: 'Activity Pack',   desc: '3 home activities with scripts' },
  { id: 'flashcard_set',  icon: '🃏', label: 'Flashcard Set',   desc: '8 personalised vocabulary cards' },
  { id: 'sensory_card',   icon: '🌀', label: 'Sensory Card',    desc: 'Regulation strategies for this child' },
  { id: 'role_play',      icon: '🎭', label: 'Role Play Script', desc: 'A repeatable social scenario script' },
]

const TYPE_COLORS: Record<string, string> = {
  social_story: '#5B7FE8', activity_pack: '#E8635A',
  flashcard_set: '#7C3AED', sensory_card: '#16A34A', role_play: '#D97706',
}

function ContentCard({ item, onView }: {
  item: Record<string, unknown>
  onView: (item: Record<string, unknown>) => void
}) {
  const cfg = CONTENT_TYPES.find(t => t.id === item.content_type) ||
    { icon: '📄', label: item.content_type as string }
  const color = TYPE_COLORS[item.content_type as string] || '#7C3AED'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ background: `${color}15` }}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-gray-900 leading-snug">{item.title as string}</div>
          <div className="text-xs font-medium mt-0.5" style={{ color }}>{cfg.label}</div>
          <div className="text-[10px] text-gray-400 mt-1">
            {new Date(item.generated_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
        <button onClick={() => onView(item)}
          className="text-xs font-bold px-3 py-1.5 rounded-full border border-violet-200 text-violet-600 hover:bg-violet-50 transition flex-shrink-0">
          View
        </button>
      </div>
    </div>
  )
}

function ContentViewer({ item, onClose }: { item: Record<string, unknown>; onClose: () => void }) {
  const data = item.content_data as Record<string, unknown>
  const cfg = CONTENT_TYPES.find(t => t.id === item.content_type)
  const color = TYPE_COLORS[item.content_type as string] || '#7C3AED'

  const renderContent = () => {
    switch (item.content_type) {
      case 'social_story':
        return (
          <div className="space-y-4">
            {Array.isArray(data.sentences) && (
              <div className="space-y-3">
                {(data.sentences as string[]).map((s, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 leading-relaxed">
                    {s}
                  </div>
                ))}
              </div>
            )}
            {!!data.how_to_use && (
              <div className="bg-blue-50 rounded-xl p-3">
                <div className="text-xs font-bold text-blue-700 mb-1">How to use</div>
                <div className="text-xs text-blue-600">{data.how_to_use as string}</div>
              </div>
            )}
            {!!data.frequency && (
              <div className="text-xs text-gray-500"><span className="font-bold">Frequency:</span> {data.frequency as string}</div>
            )}
          </div>
        )

      case 'activity_pack':
        return (
          <div className="space-y-4">
            {!!data.goal_connection && (
              <div className="bg-violet-50 rounded-xl p-3 text-xs text-violet-700">{data.goal_connection as string}</div>
            )}
            {Array.isArray(data.activities) && (data.activities as Record<string, unknown>[]).map((act, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-2">
                <div className="font-bold text-sm text-gray-900">{i + 1}. {act.title as string}</div>
                <div className="text-xs text-gray-500">{act.duration as string}</div>
                {!!act.script && (
                  <div className="bg-amber-50 rounded-lg p-2">
                    <div className="text-[10px] font-bold text-amber-700 mb-1">What to say</div>
                    <div className="text-xs text-amber-800 italic">&ldquo;{act.script as string}&rdquo;</div>
                  </div>
                )}
                {Array.isArray(act.steps) && (
                  <div className="space-y-1">
                    {(act.steps as string[]).map((step, j) => (
                      <div key={j} className="text-xs text-gray-600 flex gap-2">
                        <span className="text-violet-400 flex-shrink-0">{j + 1}.</span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!!act.success_looks_like && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 rounded-lg p-2">
                    ✓ {act.success_looks_like as string}
                  </div>
                )}
                {!!act.why_it_works && (
                  <div className="text-[10px] text-gray-400 italic">{act.why_it_works as string}</div>
                )}
              </div>
            ))}
            {!!data.data_collection && (
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs font-bold text-gray-600 mb-1">Tracking progress</div>
                <div className="text-xs text-gray-600">{data.data_collection as string}</div>
              </div>
            )}
          </div>
        )

      case 'flashcard_set':
        return (
          <div className="space-y-3">
            {!!data.how_to_use && (
              <div className="bg-violet-50 rounded-xl p-3 text-xs text-violet-700">{data.how_to_use as string}</div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {Array.isArray(data.cards) && (data.cards as Record<string, unknown>[]).map((card, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-3 text-center"
                  style={{ borderTopColor: color, borderTopWidth: 3 }}>
                  <div className="text-3xl mb-1">{card.emoji as string}</div>
                  <div className="font-black text-sm text-gray-900">{card.word as string}</div>
                  {!!card.pronunciation && (
                    <div className="text-[10px] text-gray-400 mt-0.5">{card.pronunciation as string}</div>
                  )}
                  {!!card.model_sentence && (
                    <div className="text-[10px] text-gray-500 mt-1 italic">&ldquo;{card.model_sentence as string}&rdquo;</div>
                  )}
                </div>
              ))}
            </div>
            {!!data.progression && (
              <div className="text-xs text-gray-500"><span className="font-bold">Next step:</span> {data.progression as string}</div>
            )}
          </div>
        )

      case 'sensory_card':
        return (
          <div className="space-y-3">
            {!!data.purpose && (
              <div className="bg-emerald-50 rounded-xl p-3 text-xs text-emerald-700">{data.purpose as string}</div>
            )}
            {Array.isArray(data.warning_signs) && (
              <div className="bg-red-50 rounded-xl p-3">
                <div className="text-xs font-bold text-red-700 mb-1">Use this when you see:</div>
                {(data.warning_signs as string[]).map((s, i) => (
                  <div key={i} className="text-xs text-red-600">• {s}</div>
                ))}
              </div>
            )}
            {Array.isArray(data.activities) && (data.activities as Record<string, unknown>[]).map((act, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-gray-900">{act.name as string}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                    style={{ background: act.type === 'calming' ? '#F0FFF4' : '#FFF5F5', color: act.type === 'calming' ? '#16A34A' : '#E8635A' }}>
                    {act.type as string}
                  </span>
                </div>
                <div className="text-xs text-gray-600">{act.how_to as string}</div>
                {!!act.when_to_use && <div className="text-[10px] text-gray-400">When: {act.when_to_use as string}</div>}
                {!!act.why_it_works && <div className="text-[10px] text-gray-400 italic">{act.why_it_works as string}</div>}
              </div>
            ))}
          </div>
        )

      case 'role_play':
        return (
          <div className="space-y-3">
            {!!data.scenario && (
              <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-700">{data.scenario as string}</div>
            )}
            {Array.isArray(data.script) && (data.script as Record<string, unknown>[]).map((line, i) => (
              <div key={i} className={`rounded-xl p-3 ${line.speaker === 'Parent' ? 'bg-violet-50 ml-0 mr-6' : 'bg-emerald-50 ml-6 mr-0'}`}>
                <div className="text-[10px] font-bold mb-1" style={{ color: line.speaker === 'Parent' ? '#7C3AED' : '#16A34A' }}>
                  {line.speaker as string}
                </div>
                <div className="text-sm font-medium text-gray-800">&ldquo;{line.line as string}&rdquo;</div>
                {!!line.action && <div className="text-[10px] text-gray-400 mt-1 italic">{line.action as string}</div>}
                {!!line.child_cue && (
                  <div className="text-[10px] text-emerald-700 mt-1 font-bold">→ Wait for: {line.child_cue as string}</div>
                )}
              </div>
            ))}
            {!!data.celebration && (
              <div className="bg-yellow-50 rounded-xl p-3 text-xs text-yellow-700">
                <span className="font-bold">Celebrate with:</span> {data.celebration as string}
              </div>
            )}
          </div>
        )

      default:
        return <pre className="text-xs text-gray-600 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg"
            style={{ background: `${color}15` }}>
            {cfg?.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-gray-900 truncate">{item.title as string}</div>
            <div className="text-[10px] font-medium" style={{ color }}>{cfg?.label}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl px-1">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}

function GenerateModal({ goals, child, onGenerate, onClose, generating }: {
  goals: Record<string, unknown>[]
  child: Record<string, unknown>
  onGenerate: (goalId: string, type: string) => void
  onClose: () => void
  generating: boolean
}) {
  const [selectedGoal, setSelectedGoal] = useState(goals[0]?.id as string || '')
  const [selectedType, setSelectedType] = useState('activity_pack')

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="font-black text-gray-900">Generate content for {child.name as string}</div>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Select a goal</label>
            <select value={selectedGoal} onChange={e => setSelectedGoal(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-violet-400 transition">
              {goals.map(g => (
                <option key={g.id as string} value={g.id as string}>{g.label as string}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Content type</label>
            <div className="space-y-2">
              {CONTENT_TYPES.map(ct => (
                <button key={ct.id} onClick={() => setSelectedType(ct.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-left transition ${
                    selectedType === ct.id ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <span className="text-xl">{ct.icon}</span>
                  <div>
                    <div className="font-bold text-sm text-gray-900">{ct.label}</div>
                    <div className="text-xs text-gray-400">{ct.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => onGenerate(selectedGoal, selectedType)}
            disabled={generating || !selectedGoal}
            className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-black rounded-xl text-sm transition">
            {generating ? 'Emma is creating…' : 'Generate →'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ContentContent() {
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const supabase = createClient()

  const [child, setChild] = useState<Record<string, unknown> | null>(null)
  const [goals, setGoals] = useState<Record<string, unknown>[]>([])
  const [contentItems, setContentItems] = useState<Record<string, unknown>[]>([])
  const [showGenerate, setShowGenerate] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [viewing, setViewing] = useState<Record<string, unknown> | null>(null)
  const [filterType, setFilterType] = useState<string | null>(null)

  useEffect(() => {
    if (!childId) return
    const load = async () => {
      const [{ data: c }, { data: g }, { data: content }] = await Promise.all([
        supabase.from('children').select('*').eq('id', childId).single(),
        supabase.from('goals').select('*').eq('child_id', childId).neq('status', 'achieved'),
        supabase.from('generated_content').select('*').eq('child_id', childId)
          .order('generated_at', { ascending: false }),
      ])
      if (c) setChild(c)
      setGoals(g || [])
      setContentItems(content || [])
    }
    load()
  }, [childId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async (goalId: string, contentType: string) => {
    if (!child) return
    setGenerating(true)
    const goal = goals.find(g => g.id === goalId)

    const res = await fetch('/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, child, contentType, language: child.language || 'en' }),
    })
    const { content } = await res.json()

    const { data: { user } } = await supabase.auth.getUser()
    const cfg = CONTENT_TYPES.find(t => t.id === contentType)

    const { data: saved } = await supabase.from('generated_content').insert({
      child_id: childId, user_id: user!.id,
      goal_id: goalId,
      content_type: contentType,
      title: content.title || `${cfg?.label} — ${(goal?.label as string || '').slice(0, 40)}`,
      content_data: content,
      language: child.language as string || 'en',
    }).select().single()

    if (saved) {
      setContentItems(prev => [saved, ...prev])
      setViewing(saved)
    }

    setGenerating(false)
    setShowGenerate(false)

    // Notify
    await supabase.from('notifications').insert({
      child_id: childId, user_id: user!.id,
      type: 'content_ready',
      title: `✨ New ${cfg?.label} ready`,
      body: `Emma has created: ${content.title || cfg?.label}`,
      action_url: `/content?child=${childId}`,
    })
  }

  const filtered = filterType ? contentItems.filter(c => c.content_type === filterType) : contentItems

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-lg">←</Link>
              <div>
                <div className="font-black text-sm text-gray-900">Content Library</div>
                <div className="text-[10px] text-gray-400">Generated by Emma Blackwell · SEN Teacher</div>
              </div>
            </div>
            <button onClick={() => setShowGenerate(true)}
              className="text-xs font-black px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition">
              + Generate
            </button>
          </div>
          {/* Type filter */}
          <div className="max-w-2xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
            <button onClick={() => setFilterType(null)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition ${!filterType ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
              All ({contentItems.length})
            </button>
            {CONTENT_TYPES.map(ct => {
              const count = contentItems.filter(c => c.content_type === ct.id).length
              if (count === 0) return null
              return (
                <button key={ct.id} onClick={() => setFilterType(ct.id)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition ${filterType === ct.id ? 'text-white' : 'bg-gray-100 text-gray-500'}`}
                  style={filterType === ct.id ? { background: TYPE_COLORS[ct.id] } : {}}>
                  {ct.icon} {ct.label} ({count})
                </button>
              )
            })}
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 pb-12">
          {generating && (
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 flex items-center gap-3">
              <div className="flex gap-1"><div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" /></div>
              <div className="text-sm text-violet-700 font-medium">Emma is creating personalised content…</div>
            </div>
          )}

          {filtered.length === 0 && !generating && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <div className="text-4xl mb-3">✨</div>
              <div className="font-bold text-gray-900 mb-1">No content yet</div>
              <div className="text-sm text-gray-400 mb-4">Emma can create personalised activities, stories, and flashcards for each goal.</div>
              <button onClick={() => setShowGenerate(true)}
                className="px-5 py-2.5 bg-violet-600 text-white font-bold rounded-xl text-sm">
                Generate your first piece
              </button>
            </div>
          )}

          {filtered.map(item => (
            <ContentCard key={item.id as string} item={item} onView={setViewing} />
          ))}
        </div>
      </div>

      {showGenerate && child && (
        <GenerateModal
          goals={goals} child={child}
          onGenerate={handleGenerate}
          onClose={() => setShowGenerate(false)}
          generating={generating}
        />
      )}

      {viewing && <ContentViewer item={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}

export default function ContentPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading…</div>}>
      <ContentContent />
    </Suspense>
  )
}
