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
  const HF_KEY    = process.env.HF_API_KEY

  if (isDebug) {
    const result = await testHF(query, HF_KEY || '')
    return NextResponse.json({ query, hfKeyPresent: !!HF_KEY, result })
  }

  if (!HF_KEY) return svgPlaceholder(query)

  const prompt = buildPrompt(query, styleSeed)
  const b64 = await generateWithHF(prompt, HF_KEY)
  if (!b64) return svgPlaceholder(query)

  if (contentId && childId) {
    try {
      const { createClient } = await import('@/lib/supabase/server')
      const sb = createClient()
      const buf = Buffer.from(b64, 'base64')
      const path = `story-images/${childId}/${contentId}/${index}.png`
      await sb.storage.from('neuronest-documents').upload(path, buf, { contentType: 'image/png', upsert: true })
      await sb.from('story_images').upsert({
        child_id: childId, content_id: contentId,
        sentence_index: parseInt(index), prompt, storage_path: path,
      }, { onConflict: 'content_id,sentence_index' })
    } catch (e) { console.error('Cache error:', e) }
  }

  return new NextResponse(Buffer.from(b64, 'base64'), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=2592000' },
  })
}

function buildPrompt(query: string, style: string): string {
  const cleaned = query
    .replace(/\b[A-Z][a-z]+\b/g, 'a child')
    .replace(/\bI\b/g, 'a child')
    .replace(/\bmy\b/gi, 'the')
    .slice(0, 200)
  const s = style ? `${style}, ` : ''
  return `${s}${cleaned}, real photograph, DSLR, natural light, photorealistic, child-safe, positive, no text, no watermark`
}

async function generateWithHF(prompt: string, key: string): Promise<string | null> {
  // FLUX.1-schnell — fast, high quality, free tier
  const models = [
    'black-forest-labs/FLUX.1-schnell',
    'stabilityai/stable-diffusion-xl-base-1.0',
  ]

  for (const model of models) {
    try {
      const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'x-wait-for-model': 'true',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { width: 800, height: 600, num_inference_steps: 4 },
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        console.error(`HF ${model} ${res.status}:`, err.slice(0, 200))
        continue
      }

      const buf = await res.arrayBuffer()
      if (buf.byteLength < 1000) continue // empty response
      return Buffer.from(buf).toString('base64')
    } catch (e) {
      console.error(`HF ${model} error:`, e)
    }
  }
  return null
}

async function testHF(query: string, key: string) {
  const prompt = buildPrompt(query, '')
  const results = []

  for (const model of ['black-forest-labs/FLUX.1-schnell', 'stabilityai/stable-diffusion-xl-base-1.0']) {
    try {
      const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'x-wait-for-model': 'true',
        },
        body: JSON.stringify({ inputs: prompt, parameters: { width: 512, height: 384, num_inference_steps: 4 } }),
      })
      const contentType = res.headers.get('content-type') || ''
      const isImage = contentType.includes('image') || res.ok
      let snippet = ''
      if (!res.ok) snippet = (await res.text()).slice(0, 300)
      const size = res.ok ? res.headers.get('content-length') || 'unknown' : '0'
      results.push({ model, status: res.status, isImage, contentType, size, error: snippet })
      if (isImage && res.ok) break
    } catch (e) {
      results.push({ model, error: String(e) })
    }
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
