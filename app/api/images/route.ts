import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const query     = req.nextUrl.searchParams.get('q') || 'child happy'
  const styleSeed = req.nextUrl.searchParams.get('style') || ''
  const contentId = req.nextUrl.searchParams.get('cid') || ''
  const childId   = req.nextUrl.searchParams.get('child') || ''
  const index     = req.nextUrl.searchParams.get('i') || '0'
  const isDebug   = !!req.nextUrl.searchParams.get('debug')

  const GEMINI_KEY = process.env.GEMINI_API_KEY
  const HF_KEY     = process.env.HF_API_KEY

  if (isDebug) {
    const result = await testAll(query, GEMINI_KEY, HF_KEY)
    return NextResponse.json({ query, geminiKey: GEMINI_KEY?.slice(0, 12), hfKey: !!HF_KEY, result })
  }

  const prompt = buildPrompt(query, styleSeed)
  let b64: string | null = null

  // Try Gemini Imagen 4 first
  if (GEMINI_KEY) b64 = await tryImagen(prompt, GEMINI_KEY)

  // Fall back to Hugging Face Stable Diffusion
  if (!b64 && HF_KEY) b64 = await tryHuggingFace(prompt, HF_KEY)

  if (!b64) return svgPlaceholder(query)

  // Cache in Supabase
  if (contentId && childId) {
    try {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = createClient()
      const buf = Buffer.from(b64, 'base64')
      const path = `story-images/${childId}/${contentId}/${index}.png`
      await supabase.storage.from('neuronest-documents').upload(path, buf, { contentType: 'image/png', upsert: true })
      await supabase.from('story_images').upsert({
        child_id: childId, content_id: contentId,
        sentence_index: parseInt(index), prompt, storage_path: path,
      }, { onConflict: 'content_id,sentence_index' })
    } catch (e) { console.error('Cache error:', e) }
  }

  return new NextResponse(Buffer.from(b64, 'base64'), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=2592000' },
  })
}

function buildPrompt(query: string, style: string): string {
  const cleaned = query
    .replace(/\b[A-Z][a-z]+\b/g, 'a child')
    .replace(/\bI\b/g, 'a child')
    .replace(/\bmy\b/gi, 'the')
    .slice(0, 200)
  const s = style ? `${style}, ` : ''
  return `${s}${cleaned}, real photograph, DSLR, natural light, photorealistic, child-safe, no text`
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
            parameters: { sampleCount: 1, aspectRatio: '4:3', safetySetting: 'block_low_and_above', personGeneration: 'allow_all' },
          }),
        }
      )
      if (!res.ok) { console.error(`Imagen ${model} ${res.status}:`, (await res.text()).slice(0, 200)); continue }
      const data = await res.json()
      const b64 = data?.predictions?.[0]?.bytesBase64Encoded
      if (b64) return b64
    } catch (e) { console.error(`Imagen ${model}:`, e) }
  }
  return null
}

async function tryHuggingFace(prompt: string, key: string): Promise<string | null> {
  // Use FLUX.1-schnell — fast, high quality, free tier
  const models = [
    'black-forest-labs/FLUX.1-schnell',
    'stabilityai/stable-diffusion-xl-base-1.0',
  ]
  for (const model of models) {
    try {
      const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: prompt, parameters: { width: 800, height: 600 } }),
      })
      if (!res.ok) { console.error(`HF ${model} ${res.status}:`, (await res.text()).slice(0, 200)); continue }
      const buf = await res.arrayBuffer()
      return Buffer.from(buf).toString('base64')
    } catch (e) { console.error(`HF ${model}:`, e) }
  }
  return null
}

async function testAll(query: string, geminiKey?: string, hfKey?: string) {
  const results: Record<string, unknown>[] = []
  const prompt = buildPrompt(query, '')

  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: '4:3', safetySetting: 'block_low_and_above', personGeneration: 'allow_all' },
          }),
        }
      )
      const text = await res.text()
      results.push({ service: 'Imagen 4', status: res.status, hasImage: text.includes('bytesBase64Encoded'), response: text.slice(0, 300) })
    } catch (e) { results.push({ service: 'Imagen 4', error: String(e) }) }
  }

  if (hfKey) {
    try {
      const res = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: prompt }),
      })
      results.push({ service: 'HuggingFace FLUX', status: res.status, hasImage: res.ok, response: res.ok ? 'image returned' : (await res.text()).slice(0, 200) })
    } catch (e) { results.push({ service: 'HuggingFace FLUX', error: String(e) }) }
  }

  return results
}

function svgPlaceholder(label: string) {
  const w = label.replace(/\b[A-Z][a-z]+\b/g, '').trim().split(' ').slice(0, 3).join(' ')
  return new NextResponse(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <rect width="600" height="400" fill="#F9FAFB" rx="16"/>
      <text x="300" y="190" text-anchor="middle" fill="#D1D5DB" font-size="64" font-family="sans-serif">🖼️</text>
      <text x="300" y="250" text-anchor="middle" fill="#D1D5DB" font-size="16" font-family="sans-serif">${w}</text>
    </svg>`,
    { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' } }
  )
}
