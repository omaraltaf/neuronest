'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  CommBoardPrint, SentenceBuilderPrint, VisualTimetablePrint,
  ComprehensionPrint, NumberCardsPrint, RewardChartPrint, WordWallPrint, MatchingGamePrint,
  useAacSymbols, ArasaacAttribution,
} from '../aacViewers'

function PrintContent() {
  const params = useSearchParams()
  // Single material (?id=) or a batch (?ids=a,b,c) — batch prints each on its own page
  const requestedIds = (params.get('ids') || params.get('id') || '').split(',').filter(Boolean)
  const supabase = createClient()
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [landscape, setLandscape] = useState(false)

  useEffect(() => {
    if (!requestedIds.length) { setLoading(false); return }
    supabase.from('generated_content').select('*').in('id', requestedIds)
      .then(({ data }) => {
        // keep the caller's order
        const byId = new Map((data || []).map(d => [d.id as string, d]))
        setItems(requestedIds.map(i => byId.get(i)).filter(Boolean) as Record<string, unknown>[])
        setLoading(false)
      })
  }, [requestedIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>
  if (!items.length) return <div className="flex items-center justify-center h-screen text-gray-400">Not found</div>

  const renderPrintFor = (item: Record<string, unknown>) => {
    const data = item.content_data as Record<string, unknown>
    const type = item.content_type as string
    const lang = (item.language as string) || 'en'
    switch (type) {
      case 'social_story': return <SocialStoryPrint data={data} title={item.title as string} />
      case 'activity_pack': return <ActivityPackPrint data={data} title={item.title as string} />
      case 'flashcard_set': return <FlashcardPrint data={data} title={item.title as string} language={lang} />
      case 'sensory_card': return <SensoryPrint data={data} title={item.title as string} />
      case 'role_play': return <RolePlayPrint data={data} title={item.title as string} />
      case 'comm_board': return <CommBoardPrint data={data} title={item.title as string} language={lang} />
      case 'sentence_builder': return <SentenceBuilderPrint data={data} title={item.title as string} language={lang} />
      case 'visual_timetable': return <VisualTimetablePrint data={data} title={item.title as string} language={lang} />
      case 'comprehension': return <ComprehensionPrint data={data} title={item.title as string} language={lang} />
      case 'number_cards': return <NumberCardsPrint data={data} title={item.title as string} language={lang} />
      case 'reward_chart': return <RewardChartPrint data={data} title={item.title as string} language={lang} />
      case 'word_wall': return <WordWallPrint data={data} title={item.title as string} language={lang} />
      case 'matching_game': return <MatchingGamePrint data={data} title={item.title as string} language={lang} />
      default: return <div className="p-8 text-gray-600">{JSON.stringify(data, null, 2)}</div>
    }
  }

  return (
    <>
      {/* Print controls - hidden when printing */}
      <div className="no-print fixed top-0 left-0 right-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
        <button onClick={() => window.close()} className="text-sm text-gray-500 hover:text-gray-700">← Close</button>
        <div className="font-bold text-sm text-gray-900 truncate px-2">
          {items.length === 1 ? items[0].title as string : `${items.length} materials`}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLandscape(l => !l)}
            className="text-sm font-bold px-3 py-2 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50"
            title="Boards and word walls often fit better in landscape">
            {landscape ? '↕️ Portrait' : '↔️ Landscape'}
          </button>
          <button onClick={() => window.print()}
            className="text-sm font-black px-4 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700">
            🖨️ Print{items.length > 1 ? ` all ${items.length}` : ''}
          </button>
        </div>
      </div>

      <div className="mt-14 print:mt-0">
        {items.map((item, i) => (
          <div key={item.id as string} style={i < items.length - 1 ? { breakAfter: 'page' } : undefined}>
            {renderPrintFor(item)}
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .mt-14 { margin-top: 0 !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 1cm; size: A4 ${landscape ? 'landscape' : 'portrait'}; }
        }
      `}</style>
    </>
  )
}

function PrintHeader({ title, emoji, colour }: { title: string; emoji: string; colour: string }) {
  return (
    <div className="flex items-center gap-3 mb-6 pb-4 border-b-2" style={{ borderColor: colour }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
        style={{ background: colour + '20' }}>
        {emoji}
      </div>
      <div>
        <div className="font-black text-xl text-gray-900">{title}</div>
        <div className="text-xs text-gray-400 mt-0.5">NeuroNest · neuronest-nine.vercel.app</div>
      </div>
    </div>
  )
}

function SocialStoryPrint({ data, title }: { data: Record<string, unknown>; title: string }) {
  const colour = (data.cover_colour as string) || '#5B7FE8'
  const sentences = (data.sentences as Record<string, unknown>[]) || []

  return (
    <div className="max-w-2xl mx-auto px-8 py-6">
      <PrintHeader title={title} emoji={data.cover_emoji as string || '📖'} colour={colour} />

      {/* Each sentence as a full card — photo + text — print-ready */}
      <div className="space-y-6">
        {sentences.map((s, i) => (
          <div key={i} className="rounded-2xl overflow-hidden border-2"
            style={{
              borderColor: s.type === 'directive' ? '#16A34A' : colour + '60',
            }}>
            {/* Real photo - full width */}
            {!!(s.image_query) && (
              <div className="w-full overflow-hidden" style={{ height: 220 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/images?q=${encodeURIComponent((s.image_query as string) || (s.text as string))}`}
                  alt={s.text as string}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}
            {/* Text below photo */}
            <div className="flex items-start gap-4 p-4"
              style={{ background: s.type === 'directive' ? '#F0FFF4' : colour + '08' }}>
              <div className="flex-shrink-0 text-4xl">{s.emoji as string}</div>
              <div className="flex-1">
                <div className="text-lg leading-relaxed text-gray-800 font-semibold">{s.text as string}</div>
                <div className="text-xs mt-1 font-black uppercase tracking-wide"
                  style={{ color: s.type === 'directive' ? '#16A34A' : colour }}>
                  {s.type as string}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!!data.how_to_use && (
        <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
          <div className="text-xs font-black text-blue-700 mb-1">💡 HOW TO USE</div>
          <div className="text-sm text-blue-600">{data.how_to_use as string}</div>
        </div>
      )}
      {!!data.frequency && (
        <div className="mt-3 p-3 bg-gray-50 rounded-xl">
          <div className="text-xs text-gray-600">🔄 {data.frequency as string}</div>
        </div>
      )}
    </div>
  )
}

function ActivityPackPrint({ data, title }: { data: Record<string, unknown>; title: string }) {
  const activities = (data.activities as Record<string, unknown>[]) || []

  return (
    <div className="max-w-2xl mx-auto px-8 py-6">
      <PrintHeader title={title} emoji={data.pack_emoji as string || '🎯'} colour="#E8635A" />

      {!!data.goal_connection && (
        <div className="mb-6 p-3 bg-violet-50 rounded-xl text-sm text-violet-700">{data.goal_connection as string}</div>
      )}

      {activities.map((act, i) => (
        <div key={i} className="mb-8 pb-8 border-b border-gray-100 last:border-0">
          {/* Activity header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ background: (act.colour as string || '#E8635A') + '20' }}>
              {act.emoji as string}
            </div>
            <div>
              <div className="font-black text-lg text-gray-900">Activity {i + 1}: {act.title as string}</div>
              <div className="text-xs text-gray-400">{act.duration as string} · {act.difficulty as string}</div>
            </div>
          </div>

          {/* First-Then board */}
          {!!act.first_then && (
            <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl">
              <div className="flex-1 text-center bg-gray-200 rounded-xl p-3">
                <div className="text-[10px] font-black text-gray-500 mb-1">FIRST</div>
                <div className="text-3xl">{(act.first_then as Record<string, unknown>).first_emoji as string}</div>
                <div className="text-xs font-bold text-gray-700 mt-1">{(act.first_then as Record<string, unknown>).first as string}</div>
              </div>
              <div className="text-2xl text-gray-400">→</div>
              <div className="flex-1 text-center bg-emerald-100 rounded-xl p-3">
                <div className="text-[10px] font-black text-emerald-600 mb-1">THEN</div>
                <div className="text-3xl">{(act.first_then as Record<string, unknown>).then_emoji as string}</div>
                <div className="text-xs font-bold text-emerald-700 mt-1">{(act.first_then as Record<string, unknown>).then as string}</div>
              </div>
            </div>
          )}

          {/* Visual steps */}
          {Array.isArray(act.visual_schedule) && (
            <div className="space-y-2">
              {(act.visual_schedule as Record<string, unknown>[]).map((step, j) => (
                <div key={j} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 text-white"
                    style={{ background: act.colour as string || '#E8635A' }}>
                    {step.step as number}
                  </div>
                  <div className="text-2xl flex-shrink-0">{step.emoji as string}</div>
                  <div className="font-semibold text-sm text-gray-800">{step.instruction as string}</div>
                </div>
              ))}
            </div>
          )}

          {/* Success */}
          {!!act.success_criterion && (
            <div className="mt-3 p-3 bg-emerald-50 rounded-xl flex gap-2">
              <span className="text-xl">{act.success_emoji as string || '🌟'}</span>
              <div className="text-sm text-emerald-700">{act.success_criterion as string}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function FlashcardPrint({ data, title, language = 'en' }: { data: Record<string, unknown>; title: string; language?: string }) {
  const cards = (data.cards as Record<string, unknown>[]) || []
  const colour = (data.theme_colour as string) || '#21564C'
  // Real AAC symbols from the shared concept library; emoji for pre-upgrade sets
  const symbols = useAacSymbols(cards.map(c => (c.concept as string) || ''), language)

  return (
    <div className="px-8 py-6">
      <PrintHeader title={title} emoji={data.theme_emoji as string || '🃏'} colour={colour} />

      {!!data.how_to_use && (
        <div className="mb-6 p-3 bg-violet-50 rounded-xl text-sm text-violet-700">{data.how_to_use as string}</div>
      )}

      {/* Print cards in a 2x4 grid - cut-out ready */}
      <div className="grid grid-cols-2 gap-4">
        {cards.map((card, i) => {
          const symbol = symbols[((card.concept as string) || '').toLowerCase()]
          return (
          <div key={i} className="rounded-2xl overflow-hidden border-4 border-gray-200"
            style={{ borderColor: card.colour as string || colour }}>
            {/* Symbol (white panel, real AAC card convention) or big emoji */}
            {symbol ? (
              <div className="flex items-center justify-center py-4 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={symbol.url} alt={card.word as string}
                  style={{ width: 110, height: 110, objectFit: 'contain' }} />
              </div>
            ) : (
              <div className="flex items-center justify-center py-6"
                style={{ background: card.colour as string || colour }}>
                <span style={{ fontSize: '80px', lineHeight: 1 }}>{card.big_emoji as string}</span>
              </div>
            )}
            {/* Word */}
            <div className="bg-white py-3 px-4 text-center">
              <div className="font-black text-2xl text-gray-900">{card.word as string}</div>
              {!!card.pronunciation && (
                <div className="text-xs text-gray-400 mt-0.5">{card.pronunciation as string}</div>
              )}
              {!!card.model_sentence && (
                <div className="text-xs text-gray-500 mt-1 italic">&ldquo;{card.model_sentence as string}&rdquo;</div>
              )}
            </div>
          </div>
          )
        })}
      </div>

      <ArasaacAttribution symbols={symbols} />
      <div className="mt-4 text-xs text-gray-400 text-center no-print">
        Tip: Print on card stock and laminate for durability
      </div>
    </div>
  )
}

function SensoryPrint({ data, title }: { data: Record<string, unknown>; title: string }) {
  const toolkit = (data.toolkit as Record<string, unknown>[]) || []
  const typeColors: Record<string, { bg: string; border: string; text: string }> = {
    calming:    { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
    alerting:   { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626' },
    organising: { bg: '#F0FDF4', border: '#BBF7D0', text: '#16A34A' },
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-6">
      <PrintHeader title={title} emoji={data.purpose_emoji as string || '🌊'} colour="#16A34A" />

      {/* Warning signs */}
      {Array.isArray(data.warning_signs) && (
        <div className="mb-6 p-4 bg-red-50 rounded-xl border border-red-200">
          <div className="text-sm font-black text-red-600 mb-2">⚡ USE THIS TOOLKIT WHEN YOU SEE:</div>
          <div className="grid grid-cols-2 gap-2">
            {(data.warning_signs as Record<string, unknown>[]).map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xl">{s.emoji as string}</span>
                <span className="text-sm text-gray-700">{s.sign as string}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {toolkit.map((strategy, i) => {
        const colors = typeColors[strategy.type as string] || typeColors.organising
        return (
          <div key={i} className="mb-5 rounded-xl border-2 overflow-hidden" style={{ borderColor: colors.border }}>
            <div className="px-4 py-3 flex items-center gap-3" style={{ background: colors.bg }}>
              <span className="text-3xl">{strategy.emoji as string}</span>
              <div>
                <div className="font-black text-base text-gray-900">{strategy.name as string}</div>
                <div className="text-xs font-bold" style={{ color: colors.text }}>
                  {strategy.type as string} · {strategy.duration as string}
                </div>
              </div>
            </div>
            {Array.isArray(strategy.visual_steps) && (
              <div className="p-4 space-y-2">
                {(strategy.visual_steps as Record<string, unknown>[]).map((step, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                      style={{ background: colors.text }}>
                      {step.step as number}
                    </div>
                    <span className="text-2xl">{step.emoji as string}</span>
                    <span className="text-sm text-gray-700">{step.instruction as string}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RolePlayPrint({ data, title }: { data: Record<string, unknown>; title: string }) {
  const script = (data.script as Record<string, unknown>[]) || []

  return (
    <div className="max-w-2xl mx-auto px-8 py-6">
      <PrintHeader title={title} emoji={data.scenario_emoji as string || '🎭'} colour="#D97706" />

      {!!data.scenario && (
        <div className="mb-5 p-3 bg-amber-50 rounded-xl text-sm text-amber-700">{data.scenario as string}</div>
      )}

      <div className="space-y-3">
        {script.map((line, i) => {
          const isParent = line.speaker === 'Parent'
          return (
            <div key={i} className="flex items-start gap-3">
              <div className="flex-shrink-0 text-center w-16">
                <div className="text-3xl">{line.emoji as string}</div>
                <div className="text-[10px] font-black mt-0.5" style={{ color: isParent ? '#21564C' : '#3D8159' }}>
                  {line.speaker as string}
                </div>
              </div>
              <div className={`flex-1 rounded-xl p-3 ${isParent ? 'bg-violet-50 border-l-4 border-violet-400' : 'bg-emerald-50 border-l-4 border-emerald-400'}`}>
                <div className="font-semibold text-base text-gray-800">&ldquo;{line.line as string}&rdquo;</div>
                {!!line.action && <div className="text-xs text-gray-400 mt-1 italic">{line.action as string}</div>}
                {!!line.child_cue && (
                  <div className="text-xs font-bold text-emerald-700 mt-1.5 bg-white rounded px-2 py-1">
                    ⏳ Wait for: {line.child_cue as string}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!!data.celebration && (
        <div className="mt-5 p-4 bg-yellow-50 rounded-xl flex items-center gap-3">
          <span className="text-3xl">{(data.celebration as Record<string, unknown>).emoji as string || '🎉'}</span>
          <div className="text-sm text-yellow-700 font-semibold">{(data.celebration as Record<string, unknown>).text as string}</div>
          <span className="text-3xl ml-auto">{(data.celebration as Record<string, unknown>).reward_emoji as string}</span>
        </div>
      )}
    </div>
  )
}

export default function ContentPrintPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400">Loading…</div>}>
      <PrintContent />
    </Suspense>
  )
}
