// Supabase Edge Function: generate-card-images
// AAC symbol images for flashcards (Child Zone "My Words" + library flashcard sets).
//
// Generates proper AAC-style symbols (Widgit/Boardmaker/PCS conventions: flat colour,
// bold outline, ONE concept, white background, no text, no depicted child) for each card
// in a generated_content row, using the same Gemini Imagen pipeline and story_images
// cache as generate-story-images (keyed content_id + index).
//
// Called fire-and-forget from /api/child-zone-cards after a new set is generated.
// ACKs immediately and does the work via EdgeRuntime.waitUntil — emoji remains the
// fallback in the UI until images land, so nothing ever blocks the child.
//
// Same conventions as the other functions: NOT auto-deployed from git (redeploy manually
// via Supabase MCP deploy_edge_function or `supabase functions deploy generate-card-images`,
// verify_jwt: false), x-cron-secret auth, GEMINI_API_KEY from env or Vault via the
// service-role-locked neuronest.get_secret RPC.

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
    const contentId: string | null = body.content_id || null
    if (!contentId) return json({ error: 'content_id required' }, 400)

    const { data: row, error } = await supabase.from('generated_content')
      .select('id, child_id, content_type, content_data')
      .eq('id', contentId).single()
    if (error || !row) return json({ error: 'content not found' }, 404)

    const contentData = typeof row.content_data === 'string'
      ? JSON.parse(row.content_data) : row.content_data
    const cards = (contentData?.cards || []) as Record<string, string>[]
    if (!cards.length) return json({ skipped: 'no cards' })

    // ACK now, generate in the background — the caller must never wait for Imagen
    // deno-lint-ignore no-explicit-any
    ;(globalThis as any).EdgeRuntime?.waitUntil?.(processCards(row.id, row.child_id, cards))
      ?? processCards(row.id, row.child_id, cards) // fallback if waitUntil unavailable

    return json({ ok: true, content_id: contentId, cards: cards.length, status: 'generating in background' })
  } catch (err) {
    console.error('generate-card-images error:', err)
    return json({ error: String(err) }, 500)
  }
})

async function processCards(contentId: string, childId: string, cards: Record<string, string>[]) {
  const GEMINI_KEY = await getSecret('GEMINI_API_KEY')
  if (!GEMINI_KEY) { console.error('GEMINI_API_KEY not available'); return }

  for (let i = 0; i < cards.length; i++) {
    try {
      const { data: cached } = await supabase.from('story_images')
        .select('storage_path').eq('content_id', contentId).eq('sentence_index', i).maybeSingle()
      if (cached?.storage_path) { console.log(`card ${i}: cached`); continue }

      const prompt = buildAacPrompt(cards[i])
      console.log(`card ${i}: ${prompt}`)

      let b64: string | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt))
        b64 = await tryImagen(prompt, GEMINI_KEY)
        if (b64) break
      }
      if (!b64) { console.error(`card ${i}: failed`); continue }

      const storagePath = `card-images/${childId}/${contentId}/${i}.png`
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      const { error: uploadError } = await supabase.storage
        .from('neuronest-documents')
        .upload(storagePath, bytes, { contentType: 'image/png', upsert: true })
      if (uploadError) { console.error(`card ${i} upload:`, uploadError.message); continue }

      await supabase.from('story_images').upsert({
        child_id: childId, content_id: contentId,
        sentence_index: i, prompt, storage_path: storagePath,
      }, { onConflict: 'content_id,sentence_index' })
      console.log(`card ${i}: saved`)
    } catch (err) {
      console.error(`card ${i}:`, err)
    }
  }
  console.log(`generate-card-images done for ${contentId}`)
}

// AAC symbol conventions (Widgit/Boardmaker/PCS): ONE concept, flat colour, bold outline,
// white background, no text. Same safety reality as stories (CLAUDE.md §6): never depict
// a specific child — symbols show generic simple figures or objects only.
// IMPORTANT: keep this prompt as natural scene-first language. Attribute-list phrasing
// ("One concept only, centred, flat solid colours, ...") made Imagen occasionally render
// a garbled DESIGN SPEC SHEET instead of the symbol — discovered 2026-07-05 on the
// "my turn" card. Describe the picture, don't enumerate requirements.
function buildAacPrompt(card: Record<string, string>): string {
  const scene = card.symbol_description || `${card.word}`
  return `A very simple flat cartoon pictogram for a children's picture communication card, showing ${scene}. The drawing has thick black outlines and solid bright colours on a pure white background, drawn in the plain minimal style of Widgit and Boardmaker pictograms. The image contains only this one centred drawing and nothing else — no words, no labels, no borders.`
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
