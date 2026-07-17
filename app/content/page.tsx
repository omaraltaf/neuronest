'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { StoryImageClientSide } from './ImageGenerator'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import TabBar from '@/components/TabBar'
import {
  CommBoardViewer, SentenceBuilderViewer, VisualTimetableViewer,
  ComprehensionViewer, NumberCardsViewer, RewardChartViewer, WordWallViewer, MatchingGameViewer,
  useAacSymbols,
} from './aacViewers'

const CONTENT_TYPES = [
  { id: 'social_story',   icon: '📖', label: 'Social Story',     desc: 'Personalised story with emoji sentences' },
  { id: 'activity_pack',  icon: '🎯', label: 'Activity Pack',    desc: 'Visual step-by-step home activities' },
  { id: 'comm_board',     icon: '🗣️', label: 'Communication Board', desc: 'Symbol grid for pointing and choosing' },
  { id: 'sentence_builder', icon: '🧩', label: 'Sentence Builder', desc: 'Cut-out word strips to build sentences' },
  { id: 'visual_timetable', icon: '🕐', label: 'Visual Timetable', desc: 'Symbol schedule for daily routines' },
  { id: 'flashcard_set',  icon: '🃏', label: 'Flashcard Set',    desc: 'Visual vocabulary cards with prompts' },
  { id: 'comprehension',  icon: '❓', label: 'Comprehension',    desc: 'Symbol story with picture questions' },
  { id: 'number_cards',   icon: '🔢', label: 'Number Cards',     desc: 'Counting cards with repeated symbols' },
  { id: 'reward_chart',   icon: '🏆', label: 'Reward Chart',     desc: 'Token chart towards a reward' },
  { id: 'word_wall',      icon: '🧱', label: 'Word Wall',        desc: 'Themed vocabulary sheet by colour' },
  { id: 'matching_game',  icon: '🎴', label: 'Matching Game',    desc: 'Cut-out matching pairs to play' },
  { id: 'sensory_card',   icon: '🌀', label: 'Sensory Toolkit',  desc: 'Visual regulation strategies' },
  { id: 'role_play',      icon: '🎭', label: 'Role Play Script', desc: 'Visual scenario with cues' },
]

// Harmonised with the Fjord & Marigold palette (muted, warm) — distinct per type but
// one family. NOT Fitzgerald colours; those live on the AAC materials themselves.
const TYPE_COLORS: Record<string, string> = {
  social_story: '#4A6FA5', activity_pack: '#D55E38',
  flashcard_set: '#21564C', sensory_card: '#7C9885', role_play: '#B85C6E',
  comm_board: '#2C7A8C', sentence_builder: '#3D8159', visual_timetable: '#B07A22',
  comprehension: '#6B5CA5', number_cards: '#94553F', reward_chart: '#D3952B',
  word_wall: '#A64D79', matching_game: '#4E9B6F',
}

// AAC Studio types generate via /api/aac-studio (concept-keyed symbols); the rest via /api/content
const AAC_STUDIO_TYPES = ['comm_board', 'sentence_builder', 'visual_timetable', 'comprehension', 'number_cards', 'reward_chart', 'word_wall', 'matching_game']

// ── Visual Renderers ──────────────────────────────────────────────────────────

function StoryImage({ alt, contentId, childId, index }: {
  alt: string; contentId?: string; childId?: string; index?: number
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!contentId || !childId || index === undefined) { setChecked(true); return }
    const load = async () => {
      const { data } = await supabase
        .from('story_images')
        .select('storage_path')
        .eq('content_id', contentId)
        .eq('sentence_index', index)
        .maybeSingle()
      if (data?.storage_path) {
        const { data: urlData } = supabase.storage
          .from('neuronest-documents')
          .getPublicUrl(data.storage_path)
        setSrc(urlData.publicUrl)
      }
      setChecked(true)
    }
    load()
  }, [contentId, index]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!checked) return <div className="w-full bg-gray-100 animate-pulse rounded-t-2xl" style={{ height: 180 }} />
  if (!src) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} style={{ width: '100%', height: 200, objectFit: 'cover' }} className="w-full rounded-t-2xl" />
}

// Derive image query from sentence — use image_query if present, else use full sentence text
function getImageQuery(s: Record<string, unknown>): string {
  if (s.image_query) return s.image_query as string
  // Use the sentence text directly — Gemini handles natural language well
  const text = (s.text as string || '').trim()
  return text.length > 0 ? text : 'child happy safe'
}

function SocialStoryViewer({ data, contentId, childId }: {
  data: Record<string, unknown>
  contentId?: string
  childId?: string
}) {
  const styleSeed = (data.style_seed as string) || ''
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
                alt={s.text as string}
                contentId={contentId}
                childId={childId}
                index={i}
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

function FlashcardViewer({ data, language = 'en' }: { data: Record<string, unknown>; language?: string }) {
  const [activeCard, setActiveCard] = useState(0)
  const [showDetails, setShowDetails] = useState(false)
  const cards = (data.cards as Record<string, unknown>[]) || []
  const card = cards[activeCard]
  const colour = (data.theme_colour as string) || '#21564C'
  // Real AAC symbols from the shared concept library (sets generated before the
  // concept upgrade have no concept field and simply keep their emoji)
  const symbols = useAacSymbols(cards.map(c => (c.concept as string) || ''), language)
  const cardSymbol = card ? symbols[((card.concept as string) || '').toLowerCase()] : undefined

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
            {cardSymbol ? (
              <div className="flex justify-center mb-3">
                <div className="bg-white rounded-2xl p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cardSymbol.url} alt={card.word as string}
                    style={{ width: 120, height: 120, objectFit: 'contain' }} />
                </div>
              </div>
            ) : (
              <div className="text-7xl mb-3">{card.big_emoji as string}</div>
            )}
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
              style={{ background: isParent ? '#EDF4F0' : '#F1F7E9', borderLeft: isParent ? '3px solid #21564C' : '3px solid #3D8159' }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-lg">{line.emoji as string}</span>
                <span className="text-[10px] font-black uppercase"
                  style={{ color: isParent ? '#21564C' : '#3D8159' }}>
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

function ContentViewer({ item, onClose, onRevise, onDelete, onPrint, onGenerateImages, onRegenerateImages, onEditRequest, revising }: {
  item: Record<string, unknown>
  onClose: () => void
  onRevise: (feedback: string) => void
  onDelete: () => void
  onPrint: () => void
  onGenerateImages: () => void
  onRegenerateImages: () => void
  onEditRequest?: () => void
  revising: boolean
}) {
  const [feedbackMode, setFeedbackMode] = useState(false)
  const [feedback, setFeedback] = useState('')
  const data = item.content_data as Record<string, unknown>
  const cfg = CONTENT_TYPES.find(t => t.id === item.content_type)
  const color = TYPE_COLORS[item.content_type as string] || '#21564C'

  const renderContent = () => {
    const lang = (item.language as string) || 'en'
    switch (item.content_type) {
      case 'social_story':   return <SocialStoryViewer data={data} contentId={item.id as string} childId={(item as Record<string, unknown>).child_id as string} />
      case 'activity_pack':  return <ActivityPackViewer data={data} />
      case 'flashcard_set':  return <FlashcardViewer data={data} language={lang} />
      case 'sensory_card':   return <SensoryViewer data={data} />
      case 'role_play':      return <RolePlayViewer data={data} />
      case 'comm_board':     return <CommBoardViewer data={data} language={lang} />
      case 'sentence_builder': return <SentenceBuilderViewer data={data} language={lang} />
      case 'visual_timetable': return <VisualTimetableViewer data={data} language={lang} />
      case 'comprehension':  return <ComprehensionViewer data={data} language={lang} />
      case 'number_cards':   return <NumberCardsViewer data={data} language={lang} />
      case 'reward_chart':   return <RewardChartViewer data={data} language={lang} />
      case 'word_wall':      return <WordWallViewer data={data} language={lang} />
      case 'matching_game':  return <MatchingGameViewer data={data} language={lang} />
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
          {item.content_type === 'social_story' && (
            <div className="flex gap-2">
              <button onClick={onGenerateImages}
                className="flex-1 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold rounded-xl text-sm transition">
                🖼️ Generate images
              </button>
              <button onClick={onRegenerateImages}
                className="flex-1 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-bold rounded-xl text-sm transition">
                🔄 Regenerate
              </button>
            </div>
          )}
          {!feedbackMode ? (
            <div className="flex gap-2">
              {!!(data as Record<string, unknown>)?.parent_request && onEditRequest && (
                <button onClick={onEditRequest}
                  className="flex-1 py-2.5 border border-violet-200 text-violet-600 hover:bg-violet-50 font-bold rounded-xl text-sm transition">
                  ✏️ Edit request
                </button>
              )}
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
  // Activity pack + story are the two types every parent understands; the clinical
  // trio (flashcards/sensory/role-play) waits behind "More types" (Round 2)
  const [showAllTypes, setShowAllTypes] = useState(false)
  const PRIMARY_TYPE_IDS = ['activity_pack', 'social_story']
  const visibleTypes = showAllTypes
    ? CONTENT_TYPES
    : CONTENT_TYPES.filter(ct => PRIMARY_TYPE_IDS.includes(ct.id))

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="font-black text-gray-900">Make something for {child.name as string}</div>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 -mr-2 flex items-center justify-center text-gray-400 text-xl">✕</button>
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
              {visibleTypes.map(ct => (
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
              {!showAllTypes && (
                <button onClick={() => setShowAllTypes(true)}
                  className="w-full py-2.5 text-sm font-semibold text-violet-600 hover:text-violet-700 transition">
                  More types ▾
                </button>
              )}
            </div>
          </div>

          <button onClick={() => onGenerate(selectedGoal, selectedType)}
            disabled={generating || !selectedGoal}
            className="w-full py-3 bg-marigold-400 hover:bg-marigold-500 disabled:opacity-60 text-marigold-ink font-black rounded-xl text-sm transition">
            {generating ? 'Emma is creating…' : 'Make it →'}
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
  // Deep link from a goal card on the Plan tab (Round 2): show only that goal's materials
  const [goalFilter, setGoalFilter] = useState<string | null>(params.get('goal'))

  const [child, setChild] = useState<Record<string, unknown> | null>(null)
  const [goals, setGoals] = useState<Record<string, unknown>[]>([])
  const [contentItems, setContentItems] = useState<Record<string, unknown>[]>([])
  const [focusGoalIds, setFocusGoalIds] = useState<string[]>([])
  const [showGenerate, setShowGenerate] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [promptText, setPromptText] = useState('')
  // Emma's one clarifying question before making the material (null = none pending)
  const [clarify, setClarify] = useState<string | null>(null)
  const [clarifyAnswer, setClarifyAnswer] = useState('')
  const [revising, setRevising] = useState(false)
  const [viewing, setViewing] = useState<Record<string, unknown> | null>(null)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Batch printing: select several materials, print them as one job (one per page)
  const [printSelect, setPrintSelect] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    if (!childId) return
    const load = async () => {
      const [{ data: c }, { data: g }, { data: content }, { data: focus }] = await Promise.all([
        supabase.from('children').select('*').eq('id', childId).single(),
        supabase.from('goals').select('*').eq('child_id', childId).neq('status', 'achieved'),
        supabase.from('generated_content').select('*').eq('child_id', childId)
          .neq('content_type', 'child_zone_cards') // internal Child Zone cache, not library content
          .order('generated_at', { ascending: false }),
        supabase.from('weekly_focus').select('focus_data').eq('child_id', childId)
          .order('week_start', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (c) setChild(c)
      setGoals(g || [])
      setContentItems(content || [])
      setFocusGoalIds(((focus?.focus_data as { primary_goal_ids?: string[] })?.primary_goal_ids) || [])
    }
    load()
  }, [childId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save a generated piece and open it — shared by both generation paths
  const saveAndOpen = async (contentType: string, content: Record<string, unknown>, goalId: string | null, fallbackTitle: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: saved } = await supabase.from('generated_content').insert({
      child_id: childId, user_id: user!.id,
      goal_id: goalId, content_type: contentType,
      title: (content.title as string) || fallbackTitle,
      content_data: content, language: child?.language as string || 'en',
    }).select().single()

    if (saved) {
      setContentItems(prev => [saved, ...prev])
      setViewing(saved)
      // Trigger Supabase Edge Function to generate images in background
      if (saved.content_type === 'social_story') {
        fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-story-images`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ record: saved }),
          }
        ).catch(e => console.error('Edge fn error:', e))
      }
    }
    return saved
  }

  const handleGenerate = async (goalId: string, contentType: string) => {
    if (!child) return
    setGenerating(true)
    const goal = goals.find(g => g.id === goalId)

    // AAC Studio types (symbol-based) generate on their own route, which also fires
    // the resolve-symbols Edge Function server-side; classic types use /api/content
    const isAac = AAC_STUDIO_TYPES.includes(contentType)
    const res = await fetch(isAac ? '/api/aac-studio' : '/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isAac
        ? { materialType: contentType, goal, child, goals, language: child.language || 'en' }
        : { goal, child, contentType, language: child.language || 'en', action: 'generate' }),
    })
    const { content } = await res.json()

    if (content) {
      const cfg = CONTENT_TYPES.find(t => t.id === contentType)
      await saveAndOpen(contentType, content, goalId,
        `${cfg?.label} — ${(goal?.label as string || '').slice(0, 40)}`)
    }
    setGenerating(false)
    setShowGenerate(false)
  }

  // The AAC Studio front door: parent describes what they need in one sentence,
  // Emma routes it to the right material type and generates it. Emma may hand back one
  // clarifying question first; the answer goes with the (still editable) original ask.
  // The prompt stays in the box after generation so the parent can tweak and re-make.
  const handlePromptGenerate = async (answers?: { question: string; answer: string }[]) => {
    if (!child || !promptText.trim()) return
    setGenerating(true)
    try {
      const res = await fetch('/api/aac-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText.trim(), child, goals,
          language: child.language || 'en',
          clarificationAnswers: answers || [],
        }),
      })
      const json = await res.json()
      if (json.clarify) {
        setClarify(json.clarify)
        setClarifyAnswer('')
      } else if (json.content && json.material_type) {
        const cfg = CONTENT_TYPES.find(t => t.id === json.material_type)
        await saveAndOpen(json.material_type, json.content, json.goal_id || null,
          cfg?.label || 'Material')
        setClarify(null)
        setClarifyAnswer('')
      }
    } catch (e) {
      console.error('prompt generation failed:', e)
    }
    setGenerating(false)
  }

  const handleGenerateImages = async (regenerate = false) => {
    if (!viewing || !child) return
    try {
      // If regenerating, delete existing cached images first
      if (regenerate) {
        await supabase
          .from('story_images')
          .delete()
          .eq('content_id', viewing.id as string)
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-story-images`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ record: viewing }),
        }
      )
      const data = await res.json()
      console.log('Image generation triggered:', data)
      alert(`Images are ${regenerate ? 'regenerating' : 'being generated'} in the background. Close and reopen the story in 30 seconds to see them.`)
    } catch (e) {
      console.error('Error triggering image generation:', e)
    }
  }

  const handleRevise = async (feedback: string) => {
    if (!viewing || !child) return
    setRevising(true)

    const isAac = AAC_STUDIO_TYPES.includes(viewing.content_type as string)
    const res = await fetch(isAac ? '/api/aac-studio' : '/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal: goals.find(g => g.id === viewing.goal_id),
        child,
        ...(isAac ? { materialType: viewing.content_type } : { contentType: viewing.content_type }),
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

  const filtered = contentItems.filter(c =>
    (!filterType || c.content_type === filterType) &&
    (!goalFilter || c.goal_id === goalFilter)
  )

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-black text-sm text-gray-900">Materials</div>
              <div className="text-xs text-gray-400">Emma — makes your materials</div>
            </div>
            <div className="flex items-center gap-2">
              {contentItems.length > 1 && (
                <button onClick={() => { setPrintSelect(p => !p); setSelectedIds([]) }}
                  aria-label="Print several materials"
                  className={`text-lg px-3 py-2.5 rounded-xl min-h-[44px] border transition ${
                    printSelect ? 'bg-violet-600 border-violet-600' : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                  🖨️
                </button>
              )}
              <button onClick={() => setShowGenerate(true)}
                className="text-sm font-black px-4 py-2.5 bg-marigold-400 hover:bg-marigold-500 text-marigold-ink rounded-xl min-h-[44px]">
                + Make something
              </button>
            </div>
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

        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 pb-28">
          {goalFilter && (
            <div className="bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3 flex items-center gap-2">
              <span className="flex-1 text-sm text-violet-800">
                Showing materials for <span className="font-bold">
                  &ldquo;{(goals.find(g => g.id === goalFilter)?.label as string) || 'this goal'}&rdquo;
                </span>
              </span>
              <button onClick={() => setGoalFilter(null)}
                className="text-sm font-bold text-violet-600 px-3 py-2 min-h-[44px]">
                Show all ✕
              </button>
            </div>
          )}

          {generating && (
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 flex items-center gap-3">
              <div className="flex gap-1"><div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/></div>
              <div className="text-sm text-violet-700 font-medium">Emma is creating visual content for {child?.name as string}…</div>
            </div>
          )}

          {/* AAC Studio front door — one sentence in, the right material out.
              Emma picks the type; the parent never chooses from 8 template names. */}
          {!generating && child && (
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="text-sm font-black text-gray-900">Describe what you need</div>
              <div className="text-xs text-gray-400 mb-3">
                e.g. &ldquo;a choice board for snack time&rdquo; · &ldquo;a 3-word sentence builder about mealtimes&rdquo; · &ldquo;a morning timetable for school days&rdquo;
              </div>
              <div className="flex gap-2 items-end">
                <textarea value={promptText} rows={2}
                  onChange={e => { setPromptText(e.target.value); if (clarify) { setClarify(null); setClarifyAnswer('') } }}
                  onKeyDown={e => {
                    // Enter submits, Shift+Enter makes a new line
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePromptGenerate() }
                  }}
                  placeholder={`What does ${child.name as string} need?`}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-violet-400 transition min-h-[44px]" />
                <button onClick={() => handlePromptGenerate()}
                  disabled={!promptText.trim()}
                  className="px-4 py-2.5 bg-marigold-400 hover:bg-marigold-500 disabled:opacity-40 text-marigold-ink font-black rounded-xl text-sm transition min-h-[44px] flex-shrink-0">
                  Make it →
                </button>
              </div>

              {/* Emma asked one question back — the original request above stays editable
                  (editing it withdraws the question) */}
              {clarify && (
                <div className="mt-3 bg-violet-50 border border-violet-100 rounded-xl p-3">
                  <div className="text-xs font-bold text-violet-700 mb-2">💬 Emma asks: {clarify}</div>
                  <div className="flex gap-2">
                    <input value={clarifyAnswer} onChange={e => setClarifyAnswer(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && clarifyAnswer.trim()) handlePromptGenerate([{ question: clarify, answer: clarifyAnswer.trim() }]) }}
                      placeholder="One sentence is enough…" autoFocus
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-violet-200 bg-white text-sm focus:outline-none focus:border-violet-400 transition min-h-[44px]" />
                    <button onClick={() => handlePromptGenerate([{ question: clarify, answer: clarifyAnswer.trim() }])}
                      disabled={!clarifyAnswer.trim()}
                      className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-black rounded-xl text-sm transition min-h-[44px] flex-shrink-0">
                      Answer →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recommended for this week — no blank canvas (field feedback 2026-07-06):
              one-tap suggestions tied to the goals being worked on right now */}
          {!generating && !filterType && (() => {
            const workingGoals = goals.filter(g => ['in_progress', 'emerging'].includes(g.status as string))
            const ordered = [
              ...workingGoals.filter(g => focusGoalIds.includes(g.id as string)),
              ...workingGoals.filter(g => !focusGoalIds.includes(g.id as string)),
            ]
            const hasType = (goalId: string, type: string) =>
              contentItems.some(c => c.goal_id === goalId && c.content_type === type)
            // Per goal: one area-matched AAC material first (the clinically obvious
            // one), then the generic pack/flashcards — max 3 chips total
            const areaType = (area: string): { type: string; icon: string; label: string } | null => {
              if (area === 'communication') return { type: 'sentence_builder', icon: '🧩', label: 'Sentence strips' }
              if (area === 'social') return { type: 'comm_board', icon: '🗣️', label: 'Communication board' }
              if (area === 'adaptive') return { type: 'visual_timetable', icon: '🕐', label: 'Visual timetable' }
              if (area === 'sensory' || area === 'behaviour') return { type: 'reward_chart', icon: '🏆', label: 'Reward chart' }
              return null
            }
            const recs: { goal: Record<string, unknown>; type: string; icon: string; label: string }[] = []
            for (const g of ordered) {
              if (recs.length >= 3) break
              const aac = areaType(g.area as string)
              if (aac && !hasType(g.id as string, aac.type)) recs.push({ goal: g, ...aac })
              if (recs.length >= 3) break
              if (!hasType(g.id as string, 'activity_pack'))
                recs.push({ goal: g, type: 'activity_pack', icon: '🎯', label: 'Activity pack' })
              if (recs.length >= 3) break
              if (!hasType(g.id as string, 'flashcard_set'))
                recs.push({ goal: g, type: 'flashcard_set', icon: '🃏', label: 'Flashcards' })
            }
            if (recs.length === 0) return null
            return (
              <div className="bg-white rounded-2xl border border-violet-100 p-4 shadow-sm">
                <div className="text-sm font-black text-gray-900">Recommended for this week</div>
                <div className="text-xs text-gray-400 mb-3">Emma — makes your materials — suggests these for the goals you&apos;re working on</div>
                <div className="space-y-2">
                  {recs.map((r, i) => (
                    <button key={i} onClick={() => handleGenerate(r.goal.id as string, r.type)}
                      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl bg-violet-50 hover:bg-violet-100 border border-violet-100 text-left transition min-h-[52px]">
                      <span className="text-xl">{r.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-violet-900">{r.label}</div>
                        <div className="text-xs text-violet-500 truncate">for &ldquo;{r.goal.label as string}&rdquo;</div>
                      </div>
                      <span className="text-xs font-black text-violet-600 bg-white px-3 py-2 rounded-full flex-shrink-0">Make it →</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

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
            const color = TYPE_COLORS[item.content_type as string] || '#21564C'
            const selected = selectedIds.includes(item.id as string)
            return (
              <button key={item.id as string}
                onClick={() => printSelect
                  ? setSelectedIds(ids => selected ? ids.filter(i => i !== item.id) : [...ids, item.id as string])
                  : setViewing(item)}
                className={`w-full bg-white rounded-2xl border shadow-sm p-4 text-left transition ${
                  selected ? 'border-violet-400 bg-violet-50' : 'border-gray-100 hover:border-violet-200'
                }`}>
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
                  {printSelect ? (
                    <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-black self-center flex-shrink-0 ${
                      selected ? 'bg-violet-600 border-violet-600 text-white' : 'border-gray-300 text-transparent'
                    }`}>✓</span>
                  ) : (
                    <span className="text-gray-300 text-sm self-center">›</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Batch print action bar */}
        {printSelect && (
          <div className="fixed bottom-20 left-0 right-0 z-20 px-4">
            <div className="max-w-2xl mx-auto bg-white border border-violet-200 rounded-2xl shadow-lg p-3 flex items-center gap-2">
              <div className="flex-1 text-sm font-bold text-gray-700 px-2">
                {selectedIds.length ? `${selectedIds.length} selected` : 'Tap materials to select'}
              </div>
              <button onClick={() => { setPrintSelect(false); setSelectedIds([]) }}
                className="px-4 py-2.5 border border-gray-200 text-gray-500 font-bold rounded-xl text-sm min-h-[44px]">
                Cancel
              </button>
              <button
                onClick={() => {
                  window.open(`/content/print?ids=${selectedIds.join(',')}&child=${childId}`, '_blank')
                  setPrintSelect(false); setSelectedIds([])
                }}
                disabled={!selectedIds.length}
                className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-black rounded-xl text-sm min-h-[44px]">
                🖨️ Print {selectedIds.length || ''} →
              </button>
            </div>
          </div>
        )}

        <TabBar childId={childId} />
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
          onGenerateImages={() => handleGenerateImages(false)}
          onRegenerateImages={() => handleGenerateImages(true)}
          onEditRequest={() => {
            // Put the original ask back in the front-door box for editing; making it
            // again creates a new material (the parent can delete the old one)
            const request = (viewing.content_data as Record<string, unknown>)?.parent_request as string
            if (request) {
              setPromptText(request)
              setViewing(null)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }
          }}
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
