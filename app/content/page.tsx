'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const CONTENT_TYPES = [
  { id: 'social_story',   icon: '📖', label: 'Social Story',     desc: 'Personalised story with emoji sentences' },
  { id: 'activity_pack',  icon: '🎯', label: 'Activity Pack',    desc: 'Visual step-by-step home activities' },
  { id: 'flashcard_set',  icon: '🃏', label: 'Flashcard Set',    desc: 'Visual vocabulary cards with prompts' },
  { id: 'sensory_card',   icon: '🌀', label: 'Sensory Toolkit',  desc: 'Visual regulation strategies' },
  { id: 'role_play',      icon: '🎭', label: 'Role Play Script', desc: 'Visual scenario with cues' },
]

const TYPE_COLORS: Record<string, string> = {
  social_story: '#5B7FE8', activity_pack: '#E8635A',
  flashcard_set: '#7C3AED', sensory_card: '#16A34A', role_play: '#D97706',
}

// ── Visual Renderers ──────────────────────────────────────────────────────────

function StoryImage({ query, alt }: { query: string; alt: string }) {
  const [status, setStatus] = useState<'loading'|'loaded'|'error'>('loading')

  // Build a child-friendly, photorealistic prompt for the social story
  const prompt = encodeURIComponent(
    `photorealistic, child-friendly illustration: ${query}, warm colours, soft lighting, safe for children, no text, no words`
  )
  // Pollinations.ai - free AI image generation, works client-side
  const src = `https://image.pollinations.ai/prompt/${prompt}?width=600&height=400&nologo=true&seed=${query.length}`

  return (
    <div className="w-full rounded-xl overflow-hidden bg-gray-100 relative" style={{ height: 200 }}>
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-1"><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></div>
            <div className="text-xs text-gray-400">Generating image…</div>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-300">
            <div className="text-4xl mb-1">🖼️</div>
            <div className="text-xs">{alt}</div>
          </div>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: status === 'loaded' ? 'block' : 'none' }}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </div>
  )
}

// Derive image query from sentence text if image_query not set
function getImageQuery(s: Record<string, unknown>): string {
  if (s.image_query) return s.image_query as string
  // Use the full sentence text as the image prompt — AI can interpret it directly
  const text = (s.text as string || '').trim()
  // Strip child's name placeholder patterns and simplify
  return text.length > 0 ? text : 'child happy safe'
}

function SocialStoryViewer({ data }: { data: Record<string, unknown> }) {
  const colour = (data.cover_colour as string) || '#5B7FE8'
  return (
    <div className="space-y-4">
      {/* Cover */}
      <div className="rounded-2xl p-6 text-center" style={{ background: colour + '20', border: `2px solid ${colour}30` }}>
        <div className="text-6xl mb-2">{data.cover_emoji as string || '📖'}</div>
        <div className="font-black text-lg text-gray-900">{data.title as string}</div>
      </div>

      {/* Notice for stories without image queries — suggest regenerating */}
      {Array.isArray(data.sentences) && !(data.sentences as Record<string, unknown>[])[0]?.image_query && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
          💡 This story was generated before real photos were added. Give feedback &ldquo;add real photos&rdquo; to get photos for each sentence.
        </div>
      )}

      {/* Sentences with real photos */}
      {Array.isArray(data.sentences) && (
        <div className="space-y-3">
          {(data.sentences as Record<string, unknown>[]).map((s, i) => (
            <div key={i}
              className={`rounded-2xl overflow-hidden border ${
                s.type === 'directive' ? 'border-emerald-200' : 'border-gray-100'
              }`}>
              {/* Real photo */}
              <StoryImage
                query={getImageQuery(s)}
                alt={s.text as string}
                
              />
              {/* Sentence */}
              <div className={`p-3.5 flex items-start gap-3 ${
                s.type === 'directive' ? 'bg-emerald-50' : 'bg-white'
              }`}>
                <span className="text-2xl flex-shrink-0">{s.emoji as string}</span>
                <div>
                  <div className="text-sm text-gray-800 leading-relaxed font-medium">{s.text as string}</div>
                  <div className="text-[9px] font-bold uppercase tracking-wide mt-0.5"
                    style={{ color: s.type === 'directive' ? '#16A34A' : '#9CA3AF' }}>
                    {s.type as string}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Usage tips */}
      {!!data.how_to_use && (
        <div className="bg-blue-50 rounded-xl p-3 flex gap-2">
          <span className="text-lg flex-shrink-0">💡</span>
          <div>
            <div className="text-xs font-bold text-blue-700 mb-0.5">How to use</div>
            <div className="text-xs text-blue-600">{data.how_to_use as string}</div>
          </div>
        </div>
      )}
      {!!data.frequency && (
        <div className="bg-violet-50 rounded-xl p-3 flex gap-2">
          <span className="text-lg">🔄</span>
          <div className="text-xs text-violet-700">{data.frequency as string}</div>
        </div>
      )}
      {!!data.print_tip && (
        <div className="bg-amber-50 rounded-xl p-3 flex gap-2">
          <span className="text-lg">🖨️</span>
          <div className="text-xs text-amber-700">{data.print_tip as string}</div>
        </div>
      )}
    </div>
  )
}

function ActivityPackViewer({ data }: { data: Record<string, unknown> }) {
  const [activeAct, setActiveAct] = useState(0)
  const activities = (data.activities as Record<string, unknown>[]) || []
  const act = activities[activeAct]

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500 bg-violet-50 rounded-xl p-3">{data.goal_connection as string}</div>

      {/* Activity tabs */}
      <div className="flex gap-2">
        {activities.map((a, i) => (
          <button key={i} onClick={() => setActiveAct(i)}
            className="flex-1 rounded-xl py-2 px-2 text-center transition"
            style={activeAct === i
              ? { background: a.colour as string || '#E8635A', color: '#fff' }
              : { background: '#F3F4F6', color: '#6B7280' }}>
            <div className="text-xl">{a.emoji as string}</div>
            <div className="text-[10px] font-bold mt-0.5 leading-tight">{a.title as string}</div>
          </button>
        ))}
      </div>

      {act && (
        <div className="space-y-3">
          {/* First-Then */}
          {!!act.first_then && (
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
              <div className="flex-1 bg-gray-200 rounded-xl p-2.5 text-center">
                <div className="text-[10px] font-black text-gray-500 mb-1">FIRST</div>
                <div className="text-2xl">{(act.first_then as Record<string, unknown>).first_emoji as string}</div>
                <div className="text-xs font-bold text-gray-700 mt-1">{(act.first_then as Record<string, unknown>).first as string}</div>
              </div>
              <div className="text-xl text-gray-400">→</div>
              <div className="flex-1 bg-emerald-100 rounded-xl p-2.5 text-center">
                <div className="text-[10px] font-black text-emerald-600 mb-1">THEN</div>
                <div className="text-2xl">{(act.first_then as Record<string, unknown>).then_emoji as string}</div>
                <div className="text-xs font-bold text-emerald-700 mt-1">{(act.first_then as Record<string, unknown>).then as string}</div>
              </div>
            </div>
          )}

          {/* What you need */}
          {Array.isArray(act.what_you_need) && (act.what_you_need as Record<string, unknown>[]).length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-3">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-2">You need</div>
              <div className="flex flex-wrap gap-2">
                {(act.what_you_need as Record<string, unknown>[]).map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5">
                    <span className="text-base">{item.emoji as string}</span>
                    <span className="text-xs text-gray-700 font-medium">{item.item as string}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Visual schedule */}
          {Array.isArray(act.visual_schedule) && (
            <div className="space-y-2">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Steps</div>
              {(act.visual_schedule as Record<string, unknown>[]).map((step, i) => (
                <div key={i} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0"
                    style={{ background: act.colour as string || '#E8635A', color: '#fff' }}>
                    {step.step as number}
                  </div>
                  <span className="text-xl flex-shrink-0">{step.emoji as string}</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-gray-800">{step.instruction as string}</div>
                    {!!step.tip && <div className="text-[10px] text-gray-400 mt-0.5">{step.tip as string}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Success */}
          <div className="bg-emerald-50 rounded-xl p-3 flex gap-2 border border-emerald-100">
            <span className="text-xl">{act.success_emoji as string || '🌟'}</span>
            <div>
              <div className="text-xs font-bold text-emerald-700 mb-0.5">Success looks like</div>
              <div className="text-xs text-emerald-600">{act.success_criterion as string}</div>
            </div>
          </div>

          {/* If struggling / succeeding */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-red-50 rounded-xl p-2.5">
              <div className="text-[10px] font-bold text-red-600 mb-1">😰 If struggling</div>
              <div className="text-xs text-gray-600">{act.if_struggling as string}</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-2.5">
              <div className="text-[10px] font-bold text-blue-600 mb-1">🚀 If succeeding</div>
              <div className="text-xs text-gray-600">{act.if_succeeding as string}</div>
            </div>
          </div>

          {!!act.why_it_works && (
            <div className="text-[10px] text-gray-400 italic px-1">{act.why_it_works as string}</div>
          )}
        </div>
      )}

      {!!data.data_tip && (
        <div className="bg-gray-50 rounded-xl p-3 flex gap-2">
          <span>📊</span>
          <div className="text-xs text-gray-600">{data.data_tip as string}</div>
        </div>
      )}
    </div>
  )
}

function FlashcardViewer({ data }: { data: Record<string, unknown> }) {
  const [activeCard, setActiveCard] = useState(0)
  const [showDetails, setShowDetails] = useState(false)
  const cards = (data.cards as Record<string, unknown>[]) || []
  const card = cards[activeCard]
  const colour = (data.theme_colour as string) || '#7C3AED'

  return (
    <div className="space-y-3">
      {!!data.how_to_use && (
        <div className="bg-violet-50 rounded-xl p-3 text-xs text-violet-700">{data.how_to_use as string}</div>
      )}

      {/* Big card display */}
      {card && (
        <div>
          <button onClick={() => setShowDetails(s => !s)}
            className="w-full rounded-2xl p-6 text-center transition active:scale-95"
            style={{ background: card.colour as string || colour, color: '#fff' }}>
            <div className="text-7xl mb-3">{card.big_emoji as string}</div>
            <div className="text-3xl font-black tracking-wide">{card.word as string}</div>
            {!!card.pronunciation && (
              <div className="text-sm opacity-80 mt-1">{card.pronunciation as string}</div>
            )}
            <div className="text-xs opacity-60 mt-3">Tap for prompts</div>
          </button>

          {showDetails && (
            <div className="mt-2 space-y-2">
              {!!card.model_sentence && (
                <div className="bg-white border border-gray-100 rounded-xl p-3">
                  <div className="text-[10px] font-bold text-gray-400 mb-1">SAY</div>
                  <div className="text-sm text-gray-700 italic">&ldquo;{card.model_sentence as string}&rdquo;</div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'Level 1', val: card.level_1, emoji: '🟢', color: '#16A34A' },
                  { label: 'Level 2', val: card.level_2, emoji: '🟡', color: '#D97706' },
                  { label: 'Level 3', val: card.level_3, emoji: '🔵', color: '#0891B2' },
                ].map(l => (
                  <div key={l.label} className="bg-gray-50 rounded-xl p-2 text-center">
                    <div className="text-base mb-1">{l.emoji}</div>
                    <div className="text-[9px] font-bold" style={{ color: l.color }}>{l.label}</div>
                    <div className="text-[10px] text-gray-600 mt-0.5 leading-tight">{String(l.val || '')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => { setActiveCard(c => Math.max(0, c - 1)); setShowDetails(false) }}
          disabled={activeCard === 0}
          className="px-4 py-2 bg-gray-100 rounded-xl text-sm font-bold text-gray-600 disabled:opacity-30 transition">
          ←
        </button>
        <div className="flex gap-1.5">
          {cards.map((_, i) => (
            <button key={i} onClick={() => { setActiveCard(i); setShowDetails(false) }}
              className="w-2 h-2 rounded-full transition"
              style={{ background: i === activeCard ? colour : '#E5E7EB' }} />
          ))}
        </div>
        <button onClick={() => { setActiveCard(c => Math.min(cards.length - 1, c + 1)); setShowDetails(false) }}
          disabled={activeCard === cards.length - 1}
          className="px-4 py-2 bg-gray-100 rounded-xl text-sm font-bold text-gray-600 disabled:opacity-30 transition">
          →
        </button>
      </div>

      {/* All cards grid */}
      <div className="grid grid-cols-4 gap-1.5 mt-2">
        {cards.map((c, i) => (
          <button key={i} onClick={() => { setActiveCard(i); setShowDetails(false) }}
            className="rounded-xl p-2 text-center transition"
            style={{ background: activeCard === i ? (c.colour as string || colour) : '#F3F4F6' }}>
            <div className="text-xl">{c.big_emoji as string}</div>
            <div className="text-[9px] font-bold mt-0.5 truncate"
              style={{ color: activeCard === i ? '#fff' : '#6B7280' }}>
              {c.word as string}
            </div>
          </button>
        ))}
      </div>

      {/* Games */}
      {Array.isArray(data.game_ideas) && (data.game_ideas as Record<string, unknown>[]).length > 0 && (
        <div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-2">Game ideas</div>
          {(data.game_ideas as Record<string, unknown>[]).map((g, i) => (
            <div key={i} className="flex gap-2 bg-gray-50 rounded-xl p-3 mb-1.5">
              <span className="text-lg">{g.emoji as string}</span>
              <div>
                <div className="text-xs font-bold text-gray-800">{g.name as string}</div>
                <div className="text-xs text-gray-500">{g.instructions as string}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SensoryViewer({ data }: { data: Record<string, unknown> }) {
  const toolkit = (data.toolkit as Record<string, unknown>[]) || []

  return (
    <div className="space-y-3">
      {/* Warning signs */}
      {Array.isArray(data.warning_signs) && (data.warning_signs as Record<string, unknown>[]).length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
          <div className="text-xs font-black text-red-600 mb-2">⚡ Use toolkit when you see:</div>
          {(data.warning_signs as Record<string, unknown>[]).map((s, i) => (
            <div key={i} className="flex items-start gap-2 mb-1.5">
              <span className="text-base flex-shrink-0">{s.emoji as string}</span>
              <div>
                <div className="text-xs font-semibold text-gray-800">{s.sign as string}</div>
                <div className="text-[10px] text-gray-500">{s.meaning as string}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toolkit strategies */}
      {toolkit.map((strategy, i) => {
        const typeColors: Record<string, { bg: string; border: string; text: string }> = {
          calming:    { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
          alerting:   { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626' },
          organising: { bg: '#F0FDF4', border: '#BBF7D0', text: '#16A34A' },
        }
        const colors = typeColors[strategy.type as string] || typeColors.organising

        return (
          <div key={i} className="rounded-xl border overflow-hidden" style={{ borderColor: colors.border }}>
            <div className="px-3 py-2.5 flex items-center gap-2" style={{ background: colors.bg }}>
              <span className="text-2xl">{strategy.emoji as string}</span>
              <div className="flex-1">
                <div className="font-black text-sm text-gray-900">{strategy.name as string}</div>
                <div className="text-[10px] font-bold" style={{ color: colors.text }}>{strategy.type as string} · {strategy.duration as string}</div>
              </div>
            </div>
            {Array.isArray(strategy.visual_steps) && (
              <div className="p-3 space-y-1.5">
                {(strategy.visual_steps as Record<string, unknown>[]).map((step, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black flex-shrink-0"
                      style={{ background: colors.border, color: colors.text }}>
                      {step.step as number}
                    </div>
                    <span className="text-sm">{step.emoji as string}</span>
                    <span className="text-xs text-gray-700">{step.instruction as string}</span>
                  </div>
                ))}
              </div>
            )}
            {!!strategy.when_to_use && (
              <div className="px-3 pb-3 text-[10px] text-gray-400">
                When: {strategy.when_to_use as string}
              </div>
            )}
            {!!strategy.why_it_works && (
              <div className="px-3 pb-3 text-[10px] text-gray-400 italic">{strategy.why_it_works as string}</div>
            )}
          </div>
        )
      })}

      {/* First-Then examples */}
      {Array.isArray(data.first_then_examples) && (data.first_then_examples as Record<string, unknown>[]).length > 0 && (
        <div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-2">First-Then examples</div>
          {(data.first_then_examples as Record<string, unknown>[]).map((ex, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5 mb-1.5">
              <div className="text-[10px] text-gray-500 w-16 flex-shrink-0">{ex.trigger as string}</div>
              <div className="flex-1 flex items-center gap-1.5">
                <span className="text-base">{ex.first_emoji as string}</span>
                <span className="text-xs font-medium">{ex.first as string}</span>
              </div>
              <span className="text-gray-400">→</span>
              <div className="flex-1 flex items-center gap-1.5">
                <span className="text-base">{ex.then_emoji as string}</span>
                <span className="text-xs font-medium text-emerald-700">{ex.then as string}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RolePlayViewer({ data }: { data: Record<string, unknown> }) {
  const script = (data.script as Record<string, unknown>[]) || []

  return (
    <div className="space-y-3">
      {!!data.scenario && (
        <div className="bg-amber-50 rounded-xl p-3 flex gap-2">
          <span className="text-xl">{data.scenario_emoji as string || '🎭'}</span>
          <div className="text-sm text-amber-700">{data.scenario as string}</div>
        </div>
      )}

      <div className="space-y-2">
        {script.map((line, i) => {
          const isParent = line.speaker === 'Parent'
          return (
            <div key={i} className={`rounded-xl p-3 ${isParent ? 'ml-0 mr-6' : 'ml-6 mr-0'}`}
              style={{ background: isParent ? '#F5F0FF' : '#F0FFF4', borderLeft: isParent ? '3px solid #7C3AED' : '3px solid #16A34A' }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-lg">{line.emoji as string}</span>
                <span className="text-[10px] font-black uppercase"
                  style={{ color: isParent ? '#7C3AED' : '#16A34A' }}>
                  {line.speaker as string}
                </span>
              </div>
              <div className="text-sm font-semibold text-gray-800 mb-1">
                &ldquo;{line.line as string}&rdquo;
              </div>
              {!!line.action && (
                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span>{line.action_emoji as string}</span>
                  <span className="italic">{line.action as string}</span>
                </div>
              )}
              {!!line.child_cue && (
                <div className="flex items-center gap-1 mt-1.5 bg-white rounded-lg px-2 py-1">
                  <span>{line.wait_emoji as string || '⏳'}</span>
                  <span className="text-[10px] font-bold text-emerald-700">Wait for: {line.child_cue as string}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!!data.celebration && (
        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 flex gap-2">
          <span className="text-2xl">{(data.celebration as Record<string, unknown>).emoji as string || '🎉'}</span>
          <div>
            <div className="text-xs font-bold text-yellow-700 mb-0.5">Celebrate!</div>
            <div className="text-xs text-yellow-700">{(data.celebration as Record<string, unknown>).text as string}</div>
          </div>
          <span className="text-2xl ml-auto">{(data.celebration as Record<string, unknown>).reward_emoji as string}</span>
        </div>
      )}

      {Array.isArray(data.visual_supports) && (data.visual_supports as Record<string, unknown>[]).length > 0 && (
        <div>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-2">Prepare these visuals</div>
          {(data.visual_supports as Record<string, unknown>[]).map((v, i) => (
            <div key={i} className="flex gap-2 bg-gray-50 rounded-xl p-2.5 mb-1.5">
              <span>{v.emoji as string}</span>
              <div>
                <div className="text-xs font-bold text-gray-800">{v.item as string}</div>
                <div className="text-[10px] text-gray-500">{v.purpose as string}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ContentViewer({ item, onClose, onRevise, onDelete, onPrint, revising }: {
  item: Record<string, unknown>
  onClose: () => void
  onRevise: (feedback: string) => void
  onDelete: () => void
  onPrint: () => void
  revising: boolean
}) {
  const [feedbackMode, setFeedbackMode] = useState(false)
  const [feedback, setFeedback] = useState('')
  const data = item.content_data as Record<string, unknown>
  const cfg = CONTENT_TYPES.find(t => t.id === item.content_type)
  const color = TYPE_COLORS[item.content_type as string] || '#7C3AED'

  const renderContent = () => {
    switch (item.content_type) {
      case 'social_story':   return <SocialStoryViewer data={data} />
      case 'activity_pack':  return <ActivityPackViewer data={data} />
      case 'flashcard_set':  return <FlashcardViewer data={data} />
      case 'sensory_card':   return <SensoryViewer data={data} />
      case 'role_play':      return <RolePlayViewer data={data} />
      default: return <pre className="text-xs text-gray-600 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col" style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
            style={{ background: `${color}20` }}>
            {cfg?.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-gray-900 truncate">{item.title as string}</div>
            <div className="text-[10px] font-medium" style={{ color }}>{cfg?.label}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl px-1">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {revising ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="flex gap-1.5"><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></div>
              <div className="text-sm text-violet-700 font-medium">Emma is revising the content…</div>
            </div>
          ) : (
            renderContent()
          )}
        </div>

        {/* Footer actions */}
        <div className="flex-shrink-0 border-t border-gray-100 px-4 py-3 space-y-2">
          {!feedbackMode ? (
            <div className="flex gap-2">
              <button onClick={() => setFeedbackMode(true)}
                className="flex-1 py-2.5 border border-violet-200 text-violet-600 hover:bg-violet-50 font-bold rounded-xl text-sm transition">
                💬 Revise
              </button>
              <button onClick={onPrint}
                className="py-2.5 px-4 border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold rounded-xl text-sm transition">
                🖨️ Print
              </button>
              <button onClick={onDelete}
                className="py-2.5 px-4 border border-red-100 text-red-400 hover:bg-red-50 font-bold rounded-xl text-sm transition">
                🗑️
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea value={feedback} onChange={e => setFeedback(e.target.value)}
                placeholder="e.g. Make it shorter, use dinosaurs instead, add more visual steps, change the colour..."
                rows={2} autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-violet-400 transition" />
              <div className="flex gap-2">
                <button onClick={() => setFeedbackMode(false)}
                  className="flex-1 py-2 border border-gray-200 text-gray-500 font-medium rounded-xl text-sm">
                  Cancel
                </button>
                <button
                  onClick={() => { onRevise(feedback); setFeedback(''); setFeedbackMode(false) }}
                  disabled={!feedback.trim() || revising}
                  className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm">
                  Revise →
                </button>
              </div>
            </div>
          )}
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
  const [selectedGoal, setSelectedGoal] = useState((goals[0]?.id as string) || '')
  const [selectedType, setSelectedType] = useState('activity_pack')

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="font-black text-gray-900">Generate for {child.name as string}</div>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Select a goal</label>
            <select value={selectedGoal} onChange={e => setSelectedGoal(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-violet-400">
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

          <button onClick={() => onGenerate(selectedGoal, selectedType)}
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
  const [revising, setRevising] = useState(false)
  const [viewing, setViewing] = useState<Record<string, unknown> | null>(null)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

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
    const { data: { user } } = await supabase.auth.getUser()

    const res = await fetch('/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, child, contentType, language: child.language || 'en', action: 'generate' }),
    })
    const { content } = await res.json()

    const cfg = CONTENT_TYPES.find(t => t.id === contentType)
    const { data: saved } = await supabase.from('generated_content').insert({
      child_id: childId, user_id: user!.id,
      goal_id: goalId, content_type: contentType,
      title: content.title || `${cfg?.label} — ${(goal?.label as string || '').slice(0, 40)}`,
      content_data: content, language: child.language as string || 'en',
    }).select().single()

    if (saved) {
      setContentItems(prev => [saved, ...prev])
      setViewing(saved)
    }
    setGenerating(false)
    setShowGenerate(false)
  }

  const handleRevise = async (feedback: string) => {
    if (!viewing || !child) return
    setRevising(true)

    const res = await fetch('/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: goals.find(g => g.id === viewing.goal_id),
        child,
        contentType: viewing.content_type,
        language: child.language || 'en',
        action: 'revise',
        feedback,
        currentContent: viewing.content_data,
      }),
    })
    const { content } = await res.json()

    // Update in DB
    const cfg = CONTENT_TYPES.find(t => t.id === viewing.content_type)
    const { data: updated } = await supabase.from('generated_content').update({
      content_data: content,
      title: content.title || (viewing.title as string),
    }).eq('id', viewing.id).select().single()

    if (updated) {
      setViewing(updated)
      setContentItems(prev => prev.map(item => item.id === updated.id ? updated : item))
    }
    setRevising(false)
  }

  const handleDelete = async () => {
    if (!viewing) return
    await supabase.from('generated_content').delete().eq('id', viewing.id as string)
    setContentItems(prev => prev.filter(item => item.id !== viewing.id))
    setViewing(null)
    setConfirmDelete(false)
  }

  const handlePrint = () => {
    if (!viewing) return
    // Open print view in new tab
    const printUrl = `/content/print?id=${viewing.id as string}&child=${childId}`
    window.open(printUrl, '_blank')
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
                <div className="text-[10px] text-gray-400">Emma Blackwell · SEN Teacher</div>
              </div>
            </div>
            <button onClick={() => setShowGenerate(true)}
              className="text-xs font-black px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl">
              + Generate
            </button>
          </div>
          <div className="max-w-2xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto">
            <button onClick={() => setFilterType(null)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap ${!filterType ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
              All ({contentItems.length})
            </button>
            {CONTENT_TYPES.map(ct => {
              const count = contentItems.filter(c => c.content_type === ct.id).length
              if (!count) return null
              return (
                <button key={ct.id} onClick={() => setFilterType(ct.id)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap ${filterType === ct.id ? 'text-white' : 'bg-gray-100 text-gray-500'}`}
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
              <div className="flex gap-1"><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></div>
              <div className="text-sm text-violet-700 font-medium">Emma is creating visual content for {child?.name as string}…</div>
            </div>
          )}

          {filtered.length === 0 && !generating && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <div className="text-4xl mb-3">✨</div>
              <div className="font-bold text-gray-900 mb-1">No content yet</div>
              <div className="text-sm text-gray-400 mb-4">Emma creates visual activities, stories, and flashcards personalised for each goal.</div>
              <button onClick={() => setShowGenerate(true)}
                className="px-5 py-2.5 bg-violet-600 text-white font-bold rounded-xl text-sm">
                Generate your first piece
              </button>
            </div>
          )}

          {filtered.map(item => {
            const cfg = CONTENT_TYPES.find(t => t.id === item.content_type)
            const color = TYPE_COLORS[item.content_type as string] || '#7C3AED'
            return (
              <button key={item.id as string} onClick={() => setViewing(item)}
                className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:border-violet-200 transition">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: `${color}15` }}>
                    {cfg?.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-gray-900 leading-snug">{item.title as string}</div>
                    <div className="text-xs font-medium mt-0.5" style={{ color }}>{cfg?.label}</div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      {new Date(item.generated_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <span className="text-gray-300 text-sm self-center">›</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {showGenerate && child && (
        <GenerateModal goals={goals} child={child}
          onGenerate={handleGenerate}
          onClose={() => setShowGenerate(false)}
          generating={generating} />
      )}

      {viewing && !confirmDelete && (
        <ContentViewer
          item={viewing}
          onClose={() => setViewing(null)}
          onRevise={handleRevise}
          onDelete={() => setConfirmDelete(true)}
          onPrint={handlePrint}
          revising={revising} />
      )}

      {confirmDelete && viewing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-3xl mb-3 text-center">🗑️</div>
            <div className="font-black text-gray-900 text-center mb-1">Delete this content?</div>
            <div className="text-sm text-gray-500 text-center mb-5 line-clamp-2">{viewing.title as string}</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-bold rounded-xl text-sm">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white font-black rounded-xl text-sm">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
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
