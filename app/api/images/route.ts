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

  if (isDebug) {
    const results = await runTests(query, GEMINI_KEY || '')
    return NextResponse.json({ query, keyPrefix: GEMINI_KEY?.slice(0, 12), results })
  }

  if (!GEMINI_KEY) return svg(query)

  const prompt = buildPrompt(query, styleSeed)
  const b64 = await generateImage(prompt, GEMINI_KEY)
  if (!b64) return svg(query)

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
    } catch {}
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
  return `${s}${cleaned}, real photograph, natural light, photorealistic, child-safe, no text`
}

async function generateImage(prompt: string, key: string): Promise<string | null> {
  // Try gemini-2.5-flash-image — available on this key, uses generateContent with IMAGE modality
  const models = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image']
  
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{ text: `Create an image: ${prompt}` }]
            }],
            generationConfig: {
              responseModalities: ['IMAGE'],
            }
          }),
        }
      )
      if (!res.ok) {
        console.error(`${model} ${res.status}:`, (await res.text()).slice(0, 200))
        continue
      }
      const data = await res.json()
      const parts = data?.candidates?.[0]?.content?.parts || []
      for (const part of parts) {
        if (part?.inlineData?.data) return part.inlineData.data
      }
    } catch (e) {
      console.error(`${model} error:`, e)
    }
  }
  return null
}

async function runTests(query: string, key: string) {
  const prompt = buildPrompt(query, '')
  const results = []

  // Test 1: gemini-2.5-flash-image with IMAGE modality
  for (const model of ['gemini-2.5-flash-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image']) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `Create an image: ${prompt}` }] }],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
        }
      )
      const text = await res.text()
      const hasImage = text.includes('inlineData')
      results.push({ model, status: res.status, hasImage, snippet: text.slice(0, 300) })
      if (hasImage) break
    } catch (e) {
      results.push({ model, error: String(e) })
    }
  }

  // Test 2: Imagen 4 (may work now with billing)
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${key}`,
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
    results.push({ model: 'imagen-4.0-generate-001', status: res.status, hasImage: text.includes('bytesBase64Encoded'), snippet: text.slice(0, 300) })
  } catch (e) {
    results.push({ model: 'imagen-4.0-generate-001', error: String(e) })
  }

  return results
}

function svg(label: string) {
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
