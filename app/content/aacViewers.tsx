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
