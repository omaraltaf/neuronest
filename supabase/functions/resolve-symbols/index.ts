// Supabase Edge Function: resolve-symbols
// The AAC symbol engine (AAC_STUDIO_PLAN.md §2) — resolves concepts to real AAC symbol
// images, once per concept, reused across every material forever.
//
// Resolution order per concept: neuronest.aac_symbols cache → ARASAAC pictogram search
// (the open-license clinical standard, ~13k professionally drawn symbols, CC BY-NC-SA —
// attribution required on every print/export footer) → Imagen + vision-QA generation
// (same pipeline as generate-card-images) for concepts ARASAAC lacks, above all
// personalized ones ("Arya's classroom"). Downloaded/generated images are stored in the
// neuronest-documents bucket under aac-symbols/ and recorded in aac_symbols.
//
// ARASAAC must be fetched from HERE, not Vercel — Vercel's network sandbox blocks all
// external domains except api.anthropic.com (CLAUDE.md §6).
//
// Input: { concepts: [{ concept, language?, symbol_description? }] }
//   concept: the normalized keyword the materials reference (e.g. 'apple', 'wash hands')
//   symbol_description: optional scene description for the Imagen fallback (required for
//     personalized concepts ARASAAC can't know about)
// ACKs immediately and resolves via EdgeRuntime.waitUntil — callers render an emoji
// fallback until symbols land, so nothing ever blocks on this.
//
// Same conventions as the other functions: NOT auto-deployed from git (redeploy manually
// via Supabase MCP deploy_edge_function or `supabase functions deploy resolve-symbols`,
// verify_jwt: false), x-cron-secret auth (shared WEEKLY_FOCUS_CRON_SECRET), secrets from
// env or Vault via the service-role-locked neuronest.get_secret RPC.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { db: { schema: 'neuronest' } }
)

type ConceptRequest = { concept: string; language?: string; symbol_description?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const expected = await getSecret('WEEKLY_FOCUS_CRON_SECRET')
    const provided = req.headers.get('x-cron-secret')
    if (!expected || provided !== expected) {
      return json({ error: 'unauthorized' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const requested = (body.concepts || []) as ConceptRequest[]
    if (!Array.isArray(requested) || !requested.length) {
      return json({ error: 'concepts required' }, 400)
    }

    // Normalize + de-dupe up front so the cache key is stable no matter how callers spell it
    const seen = new Set<string>()
    const concepts: { concept: string; language: string; symbol_description?: string }[] = []
    for (const r of requested) {
      const concept = String(r.concept || '').trim().toLowerCase()
      const language = String(r.language || 'en').trim().toLowerCase()
      if (!concept) continue
      const key = `${language}:${concept}`
      if (seen.has(key)) continue
      seen.add(key)
      concepts.push({ concept, language, symbol_description: r.symbol_description })
    }
    if (!concepts.length) return json({ error: 'no valid concepts' }, 400)

    // Everything already cached needs no work — report it in the ACK so callers can
    // render those symbols immediately
    const { data: cachedRows } = await supabase.from('aac_symbols')
      .select('concept, language')
      .in('concept', concepts.map(c => c.concept))
    const cachedKeys = new Set((cachedRows || []).map(r => `${r.language}:${r.concept}`))
    const pending = concepts.filter(c => !cachedKeys.has(`${c.language}:${c.concept}`))
    const cachedCount = concepts.length - pending.length

    if (pending.length) {
      // ACK now, resolve in the background — the caller must never wait for ARASAAC/Imagen
      // deno-lint-ignore no-explicit-any
      ;(globalThis as any).EdgeRuntime?.waitUntil?.(resolveAll(pending))
        ?? resolveAll(pending)
    }

    return json({
      ok: true,
      cached: cachedCount,
      resolving: pending.length,
      status: pending.length ? 'resolving in background' : 'all cached',
    })
  } catch (err) {
    console.error('resolve-symbols error:', err)
    return json({ error: String(err) }, 500)
  }
})

async function resolveAll(concepts: { concept: string; language: string; symbol_description?: string }[]) {
  for (const c of concepts) {
    try {
      await resolveOne(c.concept, c.language, c.symbol_description)
    } catch (err) {
      console.error(`resolve '${c.concept}' (${c.language}):`, err)
    }
  }
  console.log(`resolve-symbols done: ${concepts.length} concepts`)
}

async function resolveOne(concept: string, language: string, symbolDescription?: string) {
  // Re-check the cache inside the background task — concurrent invocations may race
  const { data: cached } = await supabase.from('aac_symbols')
    .select('id').eq('concept', concept).eq('language', language).maybeSingle()
  if (cached) { console.log(`'${concept}': cached`); return }

  // 1) ARASAAC — real, professionally drawn AAC pictograms; always preferred.
  // Candidates are vision-QA'd for SEMANTIC match before being cached: keyword search
  // can land on the wrong sense entirely (found 2026-07-16: "wash hands" → a car wash
  // pictogram), and a wrong symbol cached per-concept would poison every material.
  const candidates = await arasaacCandidates(concept, language)
  for (const candidate of candidates) {
    const png = await fetchArasaacImage(candidate.id)
    if (!png) continue
    const verdict = await qaSymbol(toBase64(png), concept, 'arasaac')
    if (!verdict.pass) {
      console.error(`'${concept}': ARASAAC #${candidate.id} QA rejected — ${verdict.reason}`)
      continue
    }
    const storagePath = await uploadSymbol(concept, language, png)
    if (storagePath) {
      await saveSymbol({
        concept, language, source: 'arasaac', arasaac_id: candidate.id,
        storage_path: storagePath, symbol_description: symbolDescription || null, qa_passed: true,
      })
      console.log(`'${concept}': ARASAAC #${candidate.id}`)
      return
    }
  }

  // 2) Imagen + vision QA fallback — for personalized/missing concepts
  const generated = await tryGenerate(concept, symbolDescription)
  if (generated) {
    const storagePath = await uploadSymbol(concept, language, generated)
    if (storagePath) {
      await saveSymbol({
        concept, language, source: 'generated', arasaac_id: null,
        storage_path: storagePath, symbol_description: symbolDescription || null, qa_passed: true,
      })
      console.log(`'${concept}': generated`)
      return
    }
  }

  console.error(`'${concept}': unresolved (no ARASAAC match, generation failed) — emoji fallback stays`)
}

// ─── ARASAAC ────────────────────────────────────────────────────────────────
// Search API: GET https://api.arasaac.org/v1/pictograms/{lang}/search/{keyword}
// Returns [{ _id, keywords: [{ keyword, ... }], ... }]. Rank candidates: exact keyword
// match first, then keywords containing every word of the concept ("wash hands" →
// "wash the hands"), then search order. Top 3 get vision-QA'd by the caller.
// Image: https://static.arasaac.org/pictograms/{id}/{id}_300.png
async function arasaacCandidates(concept: string, language: string): Promise<{ id: number }[]> {
  try {
    // App language keys ≠ ARASAAC locale codes: our 'no' (Norwegian) is ARASAAC's 'nb'
    // (bokmål) — plain 'no' gets a 400 (found live 2026-07-17, symbols silently fell
    // through to Imagen generation)
    const arasaacLang = language === 'no' ? 'nb' : language
    const res = await fetch(
      `https://api.arasaac.org/v1/pictograms/${arasaacLang}/search/${encodeURIComponent(concept)}`,
      { headers: { Accept: 'application/json' } }
    )
    if (!res.ok) {
      if (res.status !== 404) console.error(`ARASAAC search '${concept}' ${res.status}`)
      return []
    }
    const results = await res.json() as { _id: number; keywords?: { keyword?: string }[] }[]
    if (!Array.isArray(results) || !results.length) return []

    const tokens = concept.split(/\s+/)
    const score = (r: { keywords?: { keyword?: string }[] }): number => {
      const kws = (r.keywords || []).map(k => (k.keyword || '').trim().toLowerCase())
      if (kws.includes(concept)) return 0
      if (kws.some(kw => tokens.every(t => kw.split(/\s+/).includes(t)))) return 1
      return 2
    }
    return results
      .filter(r => r._id)
      .map((r, i) => ({ id: r._id, rank: score(r) * 1000 + i }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 3)
  } catch (e) {
    console.error(`ARASAAC '${concept}':`, e)
    return []
  }
}

// Chunked — a plain btoa(String.fromCharCode(...bytes)) overflows the stack on real images
function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(s)
}

async function fetchArasaacImage(id: number): Promise<Uint8Array | null> {
  try {
    const imgRes = await fetch(`https://static.arasaac.org/pictograms/${id}/${id}_300.png`)
    if (!imgRes.ok) {
      console.error(`ARASAAC image #${id} ${imgRes.status}`)
      return null
    }
    return new Uint8Array(await imgRes.arrayBuffer())
  } catch (e) {
    console.error(`ARASAAC image #${id}:`, e)
    return null
  }
}

// ─── Imagen fallback (same pipeline as generate-card-images) ────────────────
async function tryGenerate(concept: string, symbolDescription?: string): Promise<Uint8Array | null> {
  const GEMINI_KEY = await getSecret('GEMINI_API_KEY')
  if (!GEMINI_KEY) { console.error('GEMINI_API_KEY not available'); return null }

  const prompt = buildAacPrompt(concept, symbolDescription)
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1500))
    const b64 = await tryImagen(prompt, GEMINI_KEY)
    if (!b64) continue
    const verdict = await qaSymbol(b64, concept)
    if (verdict.pass) return Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))
    console.error(`'${concept}' attempt ${attempt + 1}: QA rejected — ${verdict.reason}`)
  }
  return null
}

// AAC symbol conventions (Widgit/Boardmaker/PCS): ONE concept, flat colour, bold outline,
// white background, no text, never a depicted child. Natural scene-first phrasing —
// attribute-list prompts make Imagen render garbled spec sheets (CLAUDE.md §6).
function buildAacPrompt(concept: string, symbolDescription?: string): string {
  const scene = symbolDescription || concept
  return `A very simple flat cartoon pictogram for a children's picture communication card, showing ${scene}. The drawing has thick black outlines and solid bright colours on a pure white background, drawn in the plain minimal style of Widgit and Boardmaker pictograms. The image contains only this one centred drawing and nothing else — no words, no labels, no borders.`
}

// Vision QA: fails open on QA-infrastructure errors, fails closed on actual rejection —
// same policy as generate-card-images. Two modes: 'generated' checks style AND meaning
// (Imagen output is untrusted); 'arasaac' checks only that the keyword search landed on
// the right MEANING — style is guaranteed, and conventional/abstract AAC representations
// (grammar words like "is") must not be rejected for being abstract.
const QA_MODELS = ['claude-haiku-4-5', 'claude-sonnet-5']
async function qaSymbol(b64: string, word: string, mode: 'generated' | 'arasaac' = 'generated'): Promise<{ pass: boolean; reason: string }> {
  const key = await getSecret('ANTHROPIC_API_KEY')
  if (!key) return { pass: true, reason: 'QA unavailable (no key) — accepted' }
  const question = mode === 'arasaac'
    ? `This image is a professionally drawn AAC pictogram retrieved by keyword search for the concept "${word}" — the search may have landed on the WRONG symbol (a different sense of the word, or an unrelated concept). The keyword may be in any language (e.g. Norwegian) — judge against the concept's MEANING. pass=true if the image plausibly depicts "${word}" as an AAC symbol (conventional or abstract representations of grammar words are fine). pass=false only if it clearly depicts something OTHER than "${word}".`
    : `This image is meant to be a flat cartoon pictogram for a young child's AAC communication card meaning "${word}" (the word may be in any language — judge the meaning). Judge it. pass=true ONLY if ALL hold: it is a simple flat cartoon/pictogram (NOT a photograph, NOT photorealistic); it shows one clear concept a young child could read as "${word}"; the background is plain white or near-white; there is NO visible text, letters, numbers, labels, dimension lines, or diagram elements anywhere.`
  for (const model of QA_MODELS) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
              { type: 'text', text: question },
            ],
          }],
          output_config: {
            format: {
              type: 'json_schema',
              schema: {
                type: 'object', additionalProperties: false, required: ['pass', 'reason'],
                properties: { pass: { type: 'boolean' }, reason: { type: 'string' } },
              },
            },
          },
        }),
      })
      if (res.status === 404) { console.error(`QA model ${model} not found — trying next`); continue }
      if (!res.ok) { console.error(`QA ${model} ${res.status}: ${(await res.text()).slice(0, 150)}`); continue }
      const data = await res.json()
      if (data.stop_reason === 'refusal') return { pass: true, reason: 'QA refusal — accepted' }
      const text = data.content?.find((b: { type: string }) => b.type === 'text')?.text
      if (!text) continue
      return JSON.parse(text)
    } catch (e) { console.error(`QA ${model}:`, e) }
  }
  return { pass: true, reason: 'QA infrastructure failed — accepted' }
}

async function tryImagen(prompt: string, key: string): Promise<string | null> {
  const models = ['imagen-4.0-generate-001', 'imagen-4.0-fast-generate-001']
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: '1:1',
              safetySetting: 'block_low_and_above',
            },
          }),
        }
      )
      const text = await res.text()
      if (!res.ok) {
        console.error(`${model} ${res.status}: ${text.slice(0, 200)}`)
        continue
      }
      const data = JSON.parse(text)
      const b64 = data?.predictions?.[0]?.bytesBase64Encoded
      if (b64) { console.log(`${model}: success`); return b64 }
      console.error(`${model}: empty response (safety filter likely triggered)`)
    } catch (e) { console.error(`${model}:`, e) }
  }
  return null
}

// ─── Storage + table ────────────────────────────────────────────────────────
async function uploadSymbol(concept: string, language: string, png: Uint8Array): Promise<string | null> {
  const slug = concept.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'symbol'
  const storagePath = `aac-symbols/${language}/${slug}.png`
  const { error } = await supabase.storage
    .from('neuronest-documents')
    .upload(storagePath, png, { contentType: 'image/png', upsert: true })
  if (error) { console.error(`upload '${concept}':`, error.message); return null }
  return storagePath
}

async function saveSymbol(row: Record<string, unknown>) {
  const { error } = await supabase.from('aac_symbols')
    .upsert(row, { onConflict: 'concept,language' })
  if (error) console.error(`save '${row.concept}':`, error.message)
}

const secretCache: Record<string, string> = {}
async function getSecret(name: string): Promise<string | null> {
  const fromEnv = Deno.env.get(name)
  if (fromEnv) return fromEnv
  if (secretCache[name]) return secretCache[name]
  const { data, error } = await supabase.rpc('get_secret', { secret_name: name })
  if (error) { console.error(`get_secret(${name}):`, error.message); return null }
  if (data) secretCache[name] = data as string
  return (data as string) || null
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
