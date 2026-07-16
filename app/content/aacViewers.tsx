'use client'
// AAC Studio material renderers (AAC_STUDIO_PLAN.md §3) — viewers + print layouts for
// comm_board, sentence_builder, visual_timetable. Lives in its own file so edits never
// risk the large page.tsx (which has been corrupted twice — CLAUDE.md §6).
//
// Symbols are concept-keyed: each cell names a `concept`, resolved to a real AAC
// pictogram by the resolve-symbols Edge Function into neuronest.aac_symbols. The hook
// below looks those up (polling briefly while a fresh material's symbols still
// generate); emoji is always the fallback so nothing ever renders empty. ARASAAC
// symbols require attribution on every print (CC BY-NC-SA).

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'

type SymbolInfo = { url: string; source: string }
type SymbolMap = Record<string, SymbolInfo>

// Look up resolved symbol images for a set of concepts. Fresh materials resolve in the
// background on Supabase, so while any concept is missing we re-check a few times.
export function useAacSymbols(concepts: string[], language: string): SymbolMap {
  const [symbols, setSymbols] = useState<SymbolMap>({})
  const key = useMemo(() => [...new Set(concepts.map(c => c.trim().toLowerCase()).filter(Boolean))].sort().join('|'), [concepts])

  useEffect(() => {
    if (!key) return
    const supabase = createClient()
    const wanted = key.split('|')
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const load = async () => {
      const { data } = await supabase
        .from('aac_symbols')
        .select('concept, storage_path, source')
        .eq('language', language)
        .in('concept', wanted)
      if (cancelled) return
      const map: SymbolMap = {}
      for (const row of data || []) {
        const { data: urlData } = supabase.storage.from('neuronest-documents').getPublicUrl(row.storage_path)
        map[row.concept] = { url: urlData.publicUrl, source: row.source }
      }
      setSymbols(map)
      attempts += 1
      // Some symbols still resolving (ARASAAC/Imagen in background) — check again soon
      if (Object.keys(map).length < wanted.length && attempts < 6) {
        timer = setTimeout(load, 10000)
      }
    }
    load()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [key, language])

  return symbols
}

function anyArasaac(symbols: SymbolMap): boolean {
  return Object.values(symbols).some(s => s.source === 'arasaac')
}

// One symbol+word cell — image when resolved, emoji until then. Fitzgerald colour on
// the border and word bar (colour follows word class, never decorative).
function SymbolCell({ word, emoji, colour, symbol, size = 'md' }: {
  word: string; emoji: string; colour: string; symbol?: SymbolInfo; size?: 'md' | 'lg'
}) {
  const img = size === 'lg' ? 96 : 64
  return (
    <div className="rounded-xl overflow-hidden bg-white flex flex-col"
      style={{ border: `3px solid ${colour}` }}>
      <div className="flex-1 flex items-center justify-center p-2 bg-white" style={{ minHeight: img + 12 }}>
        {symbol ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={symbol.url} alt={word} style={{ width: img, height: img, objectFit: 'contain' }} />
        ) : (
          <span style={{ fontSize: img * 0.7, lineHeight: 1 }}>{emoji}</span>
        )}
      </div>
      <div className="text-center py-1.5 px-1 font-black leading-tight"
        style={{ background: colour, color: '#fff', fontSize: size === 'lg' ? 16 : 13 }}>
        {word}
      </div>
    </div>
  )
}

export function ArasaacAttribution({ symbols }: { symbols: SymbolMap }) {
  if (!anyArasaac(symbols)) return null
  return (
    <div className="mt-6 pt-3 border-t border-gray-200 text-[9px] text-gray-400 text-center">
      Pictograms: ARASAAC (arasaac.org) — CC BY-NC-SA, Gov. of Aragón, author Sergio Palao
    </div>
  )
}

// The parent's original ask, kept with the material (route attaches it as parent_request)
function ParentRequest({ text }: { text?: unknown }) {
  if (!text) return null
  return (
    <div className="text-[10px] text-gray-400 italic mt-1">
      You asked: &ldquo;{text as string}&rdquo;
    </div>
  )
}

function HowToUse({ text }: { text?: unknown }) {
  if (!text) return null
  return (
    <div className="bg-blue-50 rounded-xl p-3 flex gap-2">
      <span className="text-lg flex-shrink-0">💡</span>
      <div>
        <div className="text-xs font-bold text-blue-700 mb-0.5">How to use</div>
        <div className="text-xs text-blue-600">{text as string}</div>
      </div>
    </div>
  )
}

// ── Communication board ───────────────────────────────────────────────────────

type Cell = Record<string, unknown>

export function CommBoardViewer({ data, language = 'en' }: { data: Record<string, unknown>; language?: string }) {
  const cells = (data.cells as Cell[]) || []
  const cols = Math.max(1, (data.cols as number) || 4)
  const symbols = useAacSymbols(cells.map(c => c.concept as string), language)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 text-center bg-violet-50 border border-violet-100">
        <div className="text-4xl mb-1">{data.board_emoji as string || '🗣️'}</div>
        <div className="font-black text-gray-900">{data.title as string}</div>
        <ParentRequest text={data.parent_request} />
      </div>
      <HowToUse text={data.how_to_use} />
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {cells.map((c, i) => (
          <SymbolCell key={i}
            word={c.word as string} emoji={c.emoji as string}
            colour={c.colour as string || '#7C3AED'}
            symbol={symbols[(c.concept as string || '').toLowerCase()]} />
        ))}
      </div>
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

export function CommBoardPrint({ data, title, language = 'en' }: { data: Record<string, unknown>; title: string; language?: string }) {
  const cells = (data.cells as Cell[]) || []
  const cols = Math.max(1, (data.cols as number) || 4)
  const symbols = useAacSymbols(cells.map(c => c.concept as string), language)

  return (
    <div className="max-w-2xl mx-auto px-8 py-6">
      <div className="flex items-center gap-3 mb-5 pb-3 border-b-2 border-violet-300">
        <span className="text-3xl">{data.board_emoji as string || '🗣️'}</span>
        <div>
          <div className="font-black text-xl text-gray-900">{title}</div>
          <div className="text-xs text-gray-400">NeuroNest · neuronest-nine.vercel.app</div>
        </div>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {cells.map((c, i) => (
          <SymbolCell key={i} size="lg"
            word={c.word as string} emoji={c.emoji as string}
            colour={c.colour as string || '#7C3AED'}
            symbol={symbols[(c.concept as string || '').toLowerCase()]} />
        ))}
      </div>
      {!!data.how_to_use && (
        <div className="mt-5 p-3 bg-blue-50 rounded-xl text-sm text-blue-700 no-print">💡 {data.how_to_use as string}</div>
      )}
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

// ── Sentence builder ──────────────────────────────────────────────────────────

type Sentence = { words?: Cell[] }

export function SentenceBuilderViewer({ data, language = 'en' }: { data: Record<string, unknown>; language?: string }) {
  const sentences = (data.sentences as Sentence[]) || []
  const allWords = sentences.flatMap(s => s.words || [])
  const symbols = useAacSymbols(allWords.map(w => w.concept as string), language)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 text-center bg-emerald-50 border border-emerald-100">
        <div className="text-4xl mb-1">{data.theme_emoji as string || '🧩'}</div>
        <div className="font-black text-gray-900">{data.title as string}</div>
        <div className="text-xs text-gray-500 mt-1">{data.target_length as number}-word sentences</div>
        <ParentRequest text={data.parent_request} />
      </div>
      <HowToUse text={data.how_to_use} />
      {Array.isArray(data.frames) && (data.frames as string[]).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(data.frames as string[]).map((f, i) => (
            <span key={i} className="text-xs font-bold bg-gray-100 text-gray-600 rounded-full px-3 py-1">{f}</span>
          ))}
        </div>
      )}
      <div className="space-y-3">
        {sentences.map((s, i) => (
          <div key={i} className="bg-gray-50 rounded-xl p-2.5">
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${(s.words || []).length}, minmax(0, 1fr))` }}>
              {(s.words || []).map((w, j) => (
                <SymbolCell key={j}
                  word={w.word as string} emoji={w.emoji as string}
                  colour={w.colour as string || '#7C3AED'}
                  symbol={symbols[(w.concept as string || '').toLowerCase()]} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {!!data.extension_tip && (
        <div className="bg-violet-50 rounded-xl p-3 flex gap-2">
          <span className="text-lg">🚀</span>
          <div className="text-xs text-violet-700">{data.extension_tip as string}</div>
        </div>
      )}
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

export function SentenceBuilderPrint({ data, title, language = 'en' }: { data: Record<string, unknown>; title: string; language?: string }) {
  const sentences = (data.sentences as Sentence[]) || []
  const allWords = sentences.flatMap(s => s.words || [])
  const symbols = useAacSymbols(allWords.map(w => w.concept as string), language)

  return (
    <div className="max-w-2xl mx-auto px-8 py-6">
      <div className="flex items-center gap-3 mb-2 pb-3 border-b-2 border-emerald-300">
        <span className="text-3xl">{data.theme_emoji as string || '🧩'}</span>
        <div>
          <div className="font-black text-xl text-gray-900">{title}</div>
          <div className="text-xs text-gray-400">NeuroNest · neuronest-nine.vercel.app</div>
        </div>
      </div>
      <div className="text-xs text-gray-500 mb-5">✂️ Cut along the dashed lines. Mix the cards up, then build each sentence left to right — the colours show the word order.</div>

      <div className="space-y-5">
        {sentences.map((s, i) => (
          <div key={i} className="border-2 border-dashed border-gray-300 rounded-xl p-3">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${(s.words || []).length}, minmax(0, 1fr))` }}>
              {(s.words || []).map((w, j) => (
                <div key={j} className="border-2 border-dashed border-gray-300 rounded-xl p-1.5">
                  <SymbolCell size="lg"
                    word={w.word as string} emoji={w.emoji as string}
                    colour={w.colour as string || '#7C3AED'}
                    symbol={symbols[(w.concept as string || '').toLowerCase()]} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

// ── Visual timetable ──────────────────────────────────────────────────────────

export function VisualTimetableViewer({ data, language = 'en' }: { data: Record<string, unknown>; language?: string }) {
  const entries = (data.entries as Cell[]) || []
  const symbols = useAacSymbols(entries.map(e => e.concept as string), language)
  const [done, setDone] = useState<Record<number, boolean>>({})

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 text-center bg-amber-50 border border-amber-100">
        <div className="text-4xl mb-1">{data.theme_emoji as string || '🕐'}</div>
        <div className="font-black text-gray-900">{data.title as string}</div>
        <div className="text-xs text-gray-500 mt-1">{data.period as string}</div>
        <ParentRequest text={data.parent_request} />
      </div>
      <HowToUse text={data.how_to_use} />
      <div className="space-y-2">
        {entries.map((e, i) => {
          const sym = symbols[(e.concept as string || '').toLowerCase()]
          const isDone = !!done[i]
          return (
            <button key={i} onClick={() => setDone(d => ({ ...d, [i]: !d[i] }))}
              className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition min-h-[60px] ${
                isDone ? 'bg-emerald-50 border-emerald-200 opacity-70' : 'bg-white border-gray-100'
              }`}>
              <div className="text-[10px] font-black text-gray-400 w-14 flex-shrink-0">{e.time_label as string}</div>
              <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                {sym ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sym.url} alt={e.activity as string} style={{ width: 44, height: 44, objectFit: 'contain' }} />
                ) : (
                  <span className="text-3xl">{e.emoji as string}</span>
                )}
              </div>
              <div className={`flex-1 font-bold text-sm ${isDone ? 'text-emerald-700 line-through' : 'text-gray-800'}`}>
                {e.activity as string}
              </div>
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-200'
              }`}>
                {isDone ? '✓' : ''}
              </div>
            </button>
          )
        })}
      </div>
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

export function VisualTimetablePrint({ data, title, language = 'en' }: { data: Record<string, unknown>; title: string; language?: string }) {
  const entries = (data.entries as Cell[]) || []
  const symbols = useAacSymbols(entries.map(e => e.concept as string), language)

  return (
    <div className="max-w-md mx-auto px-8 py-6">
      <div className="flex items-center gap-3 mb-5 pb-3 border-b-2 border-amber-300">
        <span className="text-3xl">{data.theme_emoji as string || '🕐'}</span>
        <div>
          <div className="font-black text-xl text-gray-900">{title}</div>
          <div className="text-xs text-gray-400">{data.period as string} · NeuroNest</div>
        </div>
      </div>
      <div className="space-y-3">
        {entries.map((e, i) => {
          const sym = symbols[(e.concept as string || '').toLowerCase()]
          return (
            <div key={i} className="flex items-center gap-4 rounded-xl border-2 border-gray-200 p-3">
              <div className="text-xs font-black text-gray-400 w-16 flex-shrink-0">{e.time_label as string}</div>
              <div className="w-16 h-16 flex items-center justify-center flex-shrink-0">
                {sym ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sym.url} alt={e.activity as string} style={{ width: 60, height: 60, objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: 44, lineHeight: 1 }}>{e.emoji as string}</span>
                )}
              </div>
              <div className="flex-1 font-black text-lg text-gray-800">{e.activity as string}</div>
              <div className="w-8 h-8 rounded-full border-2 border-gray-300 flex-shrink-0" />
            </div>
          )
        })}
      </div>
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

// ── Comprehension sheet ───────────────────────────────────────────────────────

type Question = { question?: string; choices?: Cell[]; answer_idx?: number }

export function ComprehensionViewer({ data, language = 'en' }: { data: Record<string, unknown>; language?: string }) {
  const story = (data.story as Cell[]) || []
  const questions = (data.questions as Question[]) || []
  const allConcepts = [
    ...story.map(s => s.concept as string),
    ...questions.flatMap(q => (q.choices || []).map(c => c.concept as string)),
  ]
  const symbols = useAacSymbols(allConcepts, language)
  // picked[questionIdx] = chosen choice index
  const [picked, setPicked] = useState<Record<number, number>>({})

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 text-center bg-blue-50 border border-blue-100">
        <div className="text-4xl mb-1">{data.theme_emoji as string || '📖'}</div>
        <div className="font-black text-gray-900">{data.title as string}</div>
        <ParentRequest text={data.parent_request} />
      </div>
      <HowToUse text={data.how_to_use} />

      {/* Story — read together, pointing at each symbol */}
      <div className="space-y-2">
        {story.map((s, i) => {
          const sym = symbols[(s.concept as string || '').toLowerCase()]
          return (
            <div key={i} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-3">
              <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                {sym ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sym.url} alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />
                ) : (
                  <span className="text-3xl">{s.emoji as string}</span>
                )}
              </div>
              <div className="text-sm font-semibold text-gray-800">{s.text as string}</div>
            </div>
          )
        })}
      </div>

      {/* Questions — tap a picture; correct answer celebrates, wrong gently shows */}
      {questions.map((q, qi) => (
        <div key={qi} className="bg-gray-50 rounded-xl p-3">
          <div className="text-sm font-bold text-gray-800 mb-2">{q.question}</div>
          <div className="grid grid-cols-3 gap-2">
            {(q.choices || []).map((c, ci) => {
              const chosen = picked[qi] === ci
              const isCorrect = ci === q.answer_idx
              return (
                <button key={ci} onClick={() => setPicked(p => ({ ...p, [qi]: ci }))}
                  className="rounded-xl transition active:scale-95"
                  style={{
                    outline: chosen ? `3px solid ${isCorrect ? '#16A34A' : '#F59E0B'}` : 'none',
                    outlineOffset: 2,
                  }}>
                  <SymbolCell
                    word={c.word as string} emoji={c.emoji as string}
                    colour={c.colour as string || '#7C3AED'}
                    symbol={symbols[(c.concept as string || '').toLowerCase()]} />
                </button>
              )
            })}
          </div>
          {picked[qi] !== undefined && (
            <div className={`text-xs font-bold mt-2 ${picked[qi] === q.answer_idx ? 'text-emerald-600' : 'text-amber-600'}`}>
              {picked[qi] === q.answer_idx ? '⭐ Yes!' : '💛 Look back at the story together — where was it?'}
            </div>
          )}
        </div>
      ))}
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

export function ComprehensionPrint({ data, title, language = 'en' }: { data: Record<string, unknown>; title: string; language?: string }) {
  const story = (data.story as Cell[]) || []
  const questions = (data.questions as Question[]) || []
  const symbols = useAacSymbols([
    ...story.map(s => s.concept as string),
    ...questions.flatMap(q => (q.choices || []).map(c => c.concept as string)),
  ], language)

  return (
    <div className="max-w-2xl mx-auto px-8 py-6">
      <div className="flex items-center gap-3 mb-5 pb-3 border-b-2 border-blue-300">
        <span className="text-3xl">{data.theme_emoji as string || '📖'}</span>
        <div>
          <div className="font-black text-xl text-gray-900">{title}</div>
          <div className="text-xs text-gray-400">NeuroNest · neuronest-nine.vercel.app</div>
        </div>
      </div>
      <div className="space-y-3 mb-6">
        {story.map((s, i) => {
          const sym = symbols[(s.concept as string || '').toLowerCase()]
          return (
            <div key={i} className="flex items-center gap-4 border-2 border-gray-200 rounded-xl p-3">
              <div className="w-16 h-16 flex items-center justify-center flex-shrink-0">
                {sym ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sym.url} alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: 40, lineHeight: 1 }}>{s.emoji as string}</span>
                )}
              </div>
              <div className="text-lg font-semibold text-gray-800">{s.text as string}</div>
            </div>
          )
        })}
      </div>
      {questions.map((q, qi) => (
        <div key={qi} className="mb-5">
          <div className="text-base font-black text-gray-800 mb-2">{qi + 1}. {q.question}</div>
          <div className="grid grid-cols-3 gap-3">
            {(q.choices || []).map((c, ci) => (
              <SymbolCell key={ci} size="lg"
                word={c.word as string} emoji={c.emoji as string}
                colour={c.colour as string || '#7C3AED'}
                symbol={symbols[(c.concept as string || '').toLowerCase()]} />
            ))}
          </div>
        </div>
      ))}
      <div className="mt-4 text-[10px] text-gray-400">
        Answers: {questions.map((q, qi) => `${qi + 1} → ${(q.choices || [])[q.answer_idx || 0]?.word || '?'}`).join('  ·  ')}
      </div>
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

// ── Number cards ──────────────────────────────────────────────────────────────

function CountSymbols({ count, symbol, emoji, size }: { count: number; symbol?: SymbolInfo; emoji: string; size: number }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {Array.from({ length: count }).map((_, i) =>
        symbol ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={symbol.url} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />
        ) : (
          <span key={i} style={{ fontSize: size * 0.8, lineHeight: 1 }}>{emoji}</span>
        )
      )}
    </div>
  )
}

export function NumberCardsViewer({ data, language = 'en' }: { data: Record<string, unknown>; language?: string }) {
  const cards = (data.cards as Cell[]) || []
  const symbols = useAacSymbols([data.concept as string], language)
  const symbol = symbols[(data.concept as string || '').toLowerCase()]

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 text-center bg-orange-50 border border-orange-100">
        <div className="text-4xl mb-1">{data.theme_emoji as string || '🔢'}</div>
        <div className="font-black text-gray-900">{data.title as string}</div>
        <div className="text-xs text-gray-500 mt-1">Counting {data.thing_word as string}s</div>
        <ParentRequest text={data.parent_request} />
      </div>
      <HowToUse text={data.how_to_use} />
      <div className="space-y-2">
        {cards.map((c, i) => (
          <div key={i} className="flex items-center gap-4 bg-white border border-gray-100 rounded-xl p-3">
            <div className="w-14 text-center font-black text-4xl text-gray-800 flex-shrink-0">{c.numeral as number}</div>
            <div className="flex-1">
              <CountSymbols count={(c.numeral as number) || 0} symbol={symbol} emoji={data.emoji as string} size={34} />
            </div>
            <div className="text-xs font-bold text-gray-400 w-14 text-right flex-shrink-0">{c.number_word as string}</div>
          </div>
        ))}
      </div>
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

export function NumberCardsPrint({ data, title, language = 'en' }: { data: Record<string, unknown>; title: string; language?: string }) {
  const cards = (data.cards as Cell[]) || []
  const symbols = useAacSymbols([data.concept as string], language)
  const symbol = symbols[(data.concept as string || '').toLowerCase()]

  return (
    <div className="max-w-2xl mx-auto px-8 py-6">
      <div className="flex items-center gap-3 mb-5 pb-3 border-b-2 border-orange-300">
        <span className="text-3xl">{data.theme_emoji as string || '🔢'}</span>
        <div>
          <div className="font-black text-xl text-gray-900">{title}</div>
          <div className="text-xs text-gray-400">NeuroNest · neuronest-nine.vercel.app</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {cards.map((c, i) => (
          <div key={i} className="border-4 border-orange-300 rounded-2xl p-4 text-center border-dashed">
            <div className="font-black text-5xl text-gray-800 mb-2">{c.numeral as number}</div>
            <CountSymbols count={(c.numeral as number) || 0} symbol={symbol} emoji={data.emoji as string} size={44} />
            <div className="text-sm font-bold text-gray-500 mt-2">{c.number_word as string}</div>
          </div>
        ))}
      </div>
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

// ── Reward chart ──────────────────────────────────────────────────────────────

export function RewardChartViewer({ data, language = 'en' }: { data: Record<string, unknown>; language?: string }) {
  const token = (data.token as Cell) || {}
  const reward = (data.reward as Cell) || {}
  const steps = (data.steps as number) || 5
  const symbols = useAacSymbols([token.concept as string, reward.concept as string], language)
  const tokenSym = symbols[(token.concept as string || '').toLowerCase()]
  const rewardSym = symbols[(reward.concept as string || '').toLowerCase()]
  const [earned, setEarned] = useState(0)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 text-center bg-yellow-50 border border-yellow-100">
        <div className="text-4xl mb-1">{data.theme_emoji as string || '🏆'}</div>
        <div className="font-black text-gray-900">{data.title as string}</div>
        <div className="text-sm text-gray-600 mt-1">{data.goal_text as string}</div>
        <ParentRequest text={data.parent_request} />
      </div>
      <HowToUse text={data.how_to_use} />

      {/* Token row — tap to earn (on screen); the printed chart is the real one */}
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {Array.from({ length: steps }).map((_, i) => (
            <button key={i} onClick={() => setEarned(e => (i < e ? i : i + 1))}
              className="w-14 h-14 rounded-full border-2 flex items-center justify-center transition active:scale-90"
              style={{
                borderColor: i < earned ? '#F59E0B' : '#E5E7EB',
                borderStyle: i < earned ? 'solid' : 'dashed',
                background: i < earned ? '#FEF3C7' : '#fff',
              }}>
              {i < earned && (tokenSym ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tokenSym.url} alt={token.word as string} style={{ width: 40, height: 40, objectFit: 'contain' }} />
              ) : (
                <span className="text-2xl">{token.emoji as string}</span>
              ))}
            </button>
          ))}
          <div className="text-2xl text-gray-300 mx-1">→</div>
          <div className="w-20 h-20 rounded-2xl border-2 border-emerald-300 bg-emerald-50 flex flex-col items-center justify-center">
            {rewardSym ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={rewardSym.url} alt={reward.word as string} style={{ width: 48, height: 48, objectFit: 'contain' }} />
            ) : (
              <span className="text-3xl">{reward.emoji as string}</span>
            )}
            <div className="text-[9px] font-black text-emerald-700 mt-0.5">{reward.word as string}</div>
          </div>
        </div>
        {earned >= steps && (
          <div className="text-center text-sm font-black text-emerald-600 mt-3">🎉 {data.celebration_text as string}</div>
        )}
      </div>
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

export function RewardChartPrint({ data, title, language = 'en' }: { data: Record<string, unknown>; title: string; language?: string }) {
  const token = (data.token as Cell) || {}
  const reward = (data.reward as Cell) || {}
  const steps = (data.steps as number) || 5
  const symbols = useAacSymbols([token.concept as string, reward.concept as string], language)
  const rewardSym = symbols[(reward.concept as string || '').toLowerCase()]
  const tokenSym = symbols[(token.concept as string || '').toLowerCase()]

  return (
    <div className="max-w-2xl mx-auto px-8 py-6">
      <div className="flex items-center gap-3 mb-3 pb-3 border-b-2 border-yellow-400">
        <span className="text-3xl">{data.theme_emoji as string || '🏆'}</span>
        <div>
          <div className="font-black text-xl text-gray-900">{title}</div>
          <div className="text-sm text-gray-600">{data.goal_text as string}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4 my-10">
        {Array.from({ length: steps }).map((_, i) => (
          <div key={i} className="w-24 h-24 rounded-full border-4 border-dashed border-gray-300 flex items-center justify-center text-gray-300 font-black text-xl">
            {i + 1}
          </div>
        ))}
        <div className="text-4xl text-gray-300 mx-2">→</div>
        <div className="w-32 h-32 rounded-3xl border-4 border-emerald-400 bg-emerald-50 flex flex-col items-center justify-center">
          {rewardSym ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rewardSym.url} alt={reward.word as string} style={{ width: 80, height: 80, objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: 56, lineHeight: 1 }}>{reward.emoji as string}</span>
          )}
          <div className="text-xs font-black text-emerald-700 mt-1">{reward.word as string}</div>
        </div>
      </div>
      {/* Token cut-outs — one per circle */}
      <div className="text-xs font-bold text-gray-400 mb-2">✂️ Cut out the tokens — stick one on each circle when it's earned:</div>
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: steps }).map((_, i) => (
          <div key={i} className="w-24 h-24 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center bg-white">
            {tokenSym ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tokenSym.url} alt={token.word as string} style={{ width: 64, height: 64, objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: 44, lineHeight: 1 }}>{token.emoji as string}</span>
            )}
          </div>
        ))}
      </div>
      {!!data.how_to_use && (
        <div className="mt-6 p-3 bg-blue-50 rounded-xl text-sm text-blue-700">💡 {data.how_to_use as string}</div>
      )}
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

// ── Word wall ─────────────────────────────────────────────────────────────────

const CLASS_LABELS: Record<string, string> = {
  person: 'People', action: 'Actions', describing: 'Describing',
  thing: 'Things', social: 'Social', question: 'Questions',
}

function groupByClass(words: Cell[]): { word_class: string; colour: string; words: Cell[] }[] {
  const order = ['person', 'action', 'describing', 'thing', 'social', 'question']
  return order
    .map(wc => ({
      word_class: wc,
      colour: (words.find(w => w.word_class === wc)?.colour as string) || '#7C3AED',
      words: words.filter(w => w.word_class === wc),
    }))
    .filter(g => g.words.length > 0)
}

export function WordWallViewer({ data, language = 'en' }: { data: Record<string, unknown>; language?: string }) {
  const words = (data.words as Cell[]) || []
  const symbols = useAacSymbols(words.map(w => w.concept as string), language)
  const groups = groupByClass(words)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 text-center bg-pink-50 border border-pink-100">
        <div className="text-4xl mb-1">{data.theme_emoji as string || '🧱'}</div>
        <div className="font-black text-gray-900">{data.title as string}</div>
        <div className="text-xs text-gray-500 mt-1">{data.theme as string}</div>
        <ParentRequest text={data.parent_request} />
      </div>
      <HowToUse text={data.how_to_use} />
      {groups.map(g => (
        <div key={g.word_class}>
          <div className="text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: g.colour }}>
            {CLASS_LABELS[g.word_class] || g.word_class}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {g.words.map((w, i) => (
              <SymbolCell key={i}
                word={w.word as string} emoji={w.emoji as string}
                colour={w.colour as string || g.colour}
                symbol={symbols[(w.concept as string || '').toLowerCase()]} />
            ))}
          </div>
        </div>
      ))}
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

export function WordWallPrint({ data, title, language = 'en' }: { data: Record<string, unknown>; title: string; language?: string }) {
  const words = (data.words as Cell[]) || []
  const symbols = useAacSymbols(words.map(w => w.concept as string), language)
  const groups = groupByClass(words)

  return (
    <div className="max-w-2xl mx-auto px-8 py-6">
      <div className="flex items-center gap-3 mb-5 pb-3 border-b-2 border-pink-300">
        <span className="text-3xl">{data.theme_emoji as string || '🧱'}</span>
        <div>
          <div className="font-black text-xl text-gray-900">{title}</div>
          <div className="text-xs text-gray-400">{data.theme as string} · NeuroNest</div>
        </div>
      </div>
      {groups.map(g => (
        <div key={g.word_class} className="mb-5">
          <div className="text-xs font-black uppercase tracking-wide mb-2 px-2 py-1 rounded inline-block"
            style={{ background: g.colour, color: '#fff' }}>
            {CLASS_LABELS[g.word_class] || g.word_class}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {g.words.map((w, i) => (
              <SymbolCell key={i} size="lg"
                word={w.word as string} emoji={w.emoji as string}
                colour={w.colour as string || g.colour}
                symbol={symbols[(w.concept as string || '').toLowerCase()]} />
            ))}
          </div>
        </div>
      ))}
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

// ── Matching game ─────────────────────────────────────────────────────────────

export function MatchingGameViewer({ data, language = 'en' }: { data: Record<string, unknown>; language?: string }) {
  const pairs = (data.pairs as Cell[]) || []
  const symbols = useAacSymbols(pairs.map(p => p.concept as string), language)
  const pictureWord = data.mode === 'picture_word'

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4 text-center bg-emerald-50 border border-emerald-100">
        <div className="text-4xl mb-1">{data.theme_emoji as string || '🎴'}</div>
        <div className="font-black text-gray-900">{data.title as string}</div>
        <div className="text-xs text-gray-500 mt-1">
          {pictureWord ? 'Match picture to word' : 'Match picture to picture'} · {pairs.length} pairs
        </div>
        <ParentRequest text={data.parent_request} />
      </div>
      <HowToUse text={data.how_to_use} />
      <div className="text-[10px] font-black text-gray-400 uppercase tracking-wide">The pairs (print to play)</div>
      <div className="grid grid-cols-3 gap-2">
        {pairs.map((p, i) => (
          <SymbolCell key={i}
            word={p.word as string} emoji={p.emoji as string}
            colour={p.colour as string || '#7C3AED'}
            symbol={symbols[(p.concept as string || '').toLowerCase()]} />
        ))}
      </div>
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}

export function MatchingGamePrint({ data, title, language = 'en' }: { data: Record<string, unknown>; title: string; language?: string }) {
  const pairs = (data.pairs as Cell[]) || []
  const symbols = useAacSymbols(pairs.map(p => p.concept as string), language)
  const pictureWord = data.mode === 'picture_word'
  // Second set in a different order so cut cards don't come out pre-matched
  const shuffled = [...pairs].reverse()

  return (
    <div className="max-w-2xl mx-auto px-8 py-6">
      <div className="flex items-center gap-3 mb-2 pb-3 border-b-2 border-emerald-300">
        <span className="text-3xl">{data.theme_emoji as string || '🎴'}</span>
        <div>
          <div className="font-black text-xl text-gray-900">{title}</div>
          <div className="text-xs text-gray-400">NeuroNest · neuronest-nine.vercel.app</div>
        </div>
      </div>
      <div className="text-xs text-gray-500 mb-5">✂️ Cut out all the cards. {pictureWord ? 'Match each picture to its word.' : 'Find the two pictures that are the same.'}</div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {pairs.map((p, i) => (
          <div key={i} className="border-2 border-dashed border-gray-300 rounded-xl p-1.5">
            <SymbolCell size="lg"
              word={p.word as string} emoji={p.emoji as string}
              colour={p.colour as string || '#7C3AED'}
              symbol={symbols[(p.concept as string || '').toLowerCase()]} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3">
        {shuffled.map((p, i) => (
          <div key={i} className="border-2 border-dashed border-gray-300 rounded-xl p-1.5">
            {pictureWord ? (
              <div className="rounded-xl flex items-center justify-center font-black text-xl text-white py-8 px-2 text-center"
                style={{ background: p.colour as string || '#7C3AED' }}>
                {p.word as string}
              </div>
            ) : (
              <SymbolCell size="lg"
                word={p.word as string} emoji={p.emoji as string}
                colour={p.colour as string || '#7C3AED'}
                symbol={symbols[(p.concept as string || '').toLowerCase()]} />
            )}
          </div>
        ))}
      </div>
      <ArasaacAttribution symbols={symbols} />
    </div>
  )
}
