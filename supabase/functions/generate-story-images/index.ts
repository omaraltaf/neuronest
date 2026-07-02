// Supabase Edge Function: generate-story-images
// Deployed via: Supabase Dashboard / MCP (not auto-deployed from this repo yet —
// if you change this file, redeploy manually via `supabase functions deploy generate-story-images`
// or the Supabase MCP deploy_edge_function tool)
//
// Purpose: generates AAC/communication-card-style illustrations for social story
// sentences using Gemini Imagen 4, called from Supabase's servers (unrestricted
// network — see CLAUDE.md §6 for why this can't run from Vercel).
//
// Trigger: called directly from the client (fetch to /functions/v1/generate-story-images)
// with { record: <generated_content row> }. Could also be wired to a DB webhook on
// INSERT into generated_content where content_type = 'social_story'.
//
// Secrets required (set via Supabase Dashboard > Edge Functions > Secrets):
//   GEMINI_API_KEY — must belong to a GCP project with POSTPAY billing linked.
//   Prepay AI Studio credits do NOT unlock Imagen 4 (confirmed the hard way).

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const record = payload.record || payload
    const contentId = record.id
    const childId = record.child_id
    const contentType = record.content_type

    if (contentType !== 'social_story') {
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Always fetch fresh from DB — the client payload may not include the full
    // content_data object (e.g. right after insert, before local state settles)
    const { data: dbContent } = await supabase
      .schema('neuronest')
      .from('generated_content')
      .select('content_data')
      .eq('id', contentId)
      .single()

    const contentData = typeof dbContent?.content_data === 'string'
      ? JSON.parse(dbContent.content_data)
      : dbContent?.content_data

    const sentences = contentData?.sentences || []
    const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') || ''

    console.log(`Processing ${sentences.length} sentences for story ${contentId}`)
    const results = []

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i]
      const text = sentence.text || ''
      const prompt = buildPrompt(text)
      console.log(`Image ${i}: ${prompt}`)

      // Skip if already generated (permanent cache — never regenerate unless
      // explicitly told to via the "Regenerate" button, which deletes the row first)
      const { data: cached } = await supabase
        .schema('neuronest')
        .from('story_images')
        .select('storage_path')
        .eq('content_id', contentId)
        .eq('sentence_index', i)
        .maybeSingle()

      if (cached?.storage_path) {
        console.log(`Image ${i}: cached`)
        results.push({ index: i, cached: true })
        continue
      }

      // Retry up to 3x — Imagen occasionally returns transient 503s
      let b64: string | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt))
        b64 = await tryImagen(prompt, GEMINI_KEY)
        if (b64) break
      }

      if (!b64) {
        console.log(`Image ${i}: failed`)
        results.push({ index: i, error: 'failed' })
        continue
      }

      const storagePath = `story-images/${childId}/${contentId}/${i}.png`
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))

      const { error: uploadError } = await supabase.storage
        .from('neuronest-documents')
        .upload(storagePath, bytes, { contentType: 'image/png', upsert: true })

      if (uploadError) {
        console.error(`Upload ${i}:`, uploadError.message)
        results.push({ index: i, error: uploadError.message })
        continue
      }

      await supabase.schema('neuronest').from('story_images').upsert({
        child_id: childId, content_id: contentId,
        sentence_index: i, prompt, storage_path: storagePath,
      }, { onConflict: 'content_id,sentence_index' })

      console.log(`Image ${i}: saved`)
      results.push({ index: i, path: storagePath })
    }

    return new Response(JSON.stringify({ ok: true, contentId, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// AAC/Widgit/Boardmaker-style prompt. DO NOT switch to photorealistic prompts
// mentioning "child" — Imagen's safety filter silently returns 200 with an empty
// body ({}) rather than an error, which is very hard to debug if you don't know
// to expect it. This style is also clinically appropriate: it matches the visual
// conventions ASD kids already recognise from AAC communication cards (see
// CLAUDE.md §2).
function buildPrompt(sentence: string): string {
  const lower = sentence.toLowerCase()
  let action = ''

  if (lower.includes('home') || lower.includes('family') || lower.includes('house')) {
    action = 'a cartoon figure sitting happily inside a simple house with family members nearby'
  } else if (lower.includes('question') || lower.includes('ask')) {
    action = 'a cartoon figure with a question mark speech bubble, looking curious and attentive'
  } else if (lower.includes('answer') || lower.includes('respond') || lower.includes('speak') || lower.includes('say')) {
    action = 'a cartoon figure with an open speech bubble, speaking and communicating clearly'
  } else if (lower.includes('listen') || lower.includes('hear')) {
    action = 'a cartoon figure with hand cupped to ear, listening carefully with a calm expression'
  } else if (lower.includes('think') || lower.includes('understand') || lower.includes('mean')) {
    action = 'a cartoon figure with a thought bubble above their head, looking thoughtful and calm'
  } else if (lower.includes('happy') || lower.includes('smile') || lower.includes('proud') || lower.includes('good')) {
    action = 'a cartoon figure smiling broadly with arms raised in celebration, stars around them'
  } else if (lower.includes('wait') || lower.includes('turn')) {
    action = 'a cartoon figure sitting patiently with hands folded, calm and waiting'
  } else if (lower.includes('friend') || lower.includes('together') || lower.includes('play')) {
    action = 'two cartoon figures playing together side by side, both smiling and happy'
  } else if (lower.includes('school') || lower.includes('class')) {
    action = 'a cartoon figure sitting at a school desk with books, raising hand to answer'
  } else if (lower.includes('feel') || lower.includes('calm') || lower.includes('breath')) {
    action = 'a cartoon figure with a calm peaceful expression, hands on chest, breathing steadily'
  } else {
    action = 'a cartoon figure in a warm home setting, calm and happy expression'
  }

  return `Simple flat cartoon illustration in the style of AAC communication symbols and Widgit literacy symbols: ${action}. Clean white or very light background, bold simple outlines, flat bright colours, clear and simple design, no shading complexity, suitable for autism communication cards, no text or words, single clear scene`
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
              aspectRatio: '4:3',
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
