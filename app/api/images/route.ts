import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') || 'test'
  const isDebug = !!req.nextUrl.searchParams.get('debug')
  const GEMINI_KEY = process.env.GEMINI_API_KEY

  // Debug endpoint — no dependencies, just env check
  if (isDebug) {
    // Test Gemini directly and return full response
    const prompt = buildPrompt(query, '')
    const testResult = await testGemini(prompt, GEMINI_KEY || '')
    return NextResponse.json({
      ok: true,
      query,
      geminiKeyPresent: !!GEMINI_KEY,
      geminiKeyPrefix: GEMINI_KEY?.slice(0, 12) || 'NOT SET',
      geminiKeyLength: GEMINI_KEY?.length || 0,
      prompt,
      geminiResult: testResult,
    })
  }

  if (!GEMINI_KEY) {
    return new NextResponse(placeholder(query), {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }

  // Generate image
  const prompt = buildPrompt(query, req.nextUrl.searchParams.get('style') || '')
  const b64 = await tryGemini(prompt, GEMINI_KEY)

  if (!b64) {
    return new NextResponse(placeholder(query), {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }

  // Cache in Supabase Storage (lazy import to avoid startup crash)
  const contentId = req.nextUrl.searchParams.get('cid') || ''
  const childId   = req.nextUrl.searchParams.get('child') || ''
  const index     = req.nextUrl.searchParams.get('i') || '0'

  if (contentId && childId) {
    try {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = createClient()
      const buf = Buffer.from(b64, 'base64')
      const path = `story-images/${childId}/${contentId}/${index}.png`
      await supabase.storage.from('neuronest-documents').upload(path, buf, {
        contentType: 'image/png', upsert: true,
      })
      await supabase.from('story_images').upsert({
        child_id: childId, content_id: contentId,
        sentence_index: parseInt(index), prompt, storage_path: path,
      }, { onConflict: 'content_id,sentence_index' })
    } catch (e) {
      console.error('Cache error:', e)
    }
  }

  return new NextResponse(Buffer.from(b64, 'base64'), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=2592000',
    },
  })
}

async function testGemini(prompt: string, key: string) {
  // First: list available models to see what this key can access
  let availableModels: string[] = []
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=100`)
    const listData = await listRes.json()
    availableModels = (listData.models || [])
      .map((m: Record<string, string>) => m.name)
      .filter((n: string) => n.includes('imagen') || n.includes('image'))
  } catch {}

  // Try each model
  const models = [
    'imagen-4.0-fast-generate-001',
    'imagen-4.0-generate-001',
    'imagen-4.0-ultra-generate-001',
  ]
  const results: Record<string, unknown>[] = [{ availableImageModels: availableModels }]
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${key}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: '4:3', safetySetting: 'block_low_and_above', personGeneration: 'allow_all' },
        }),
      })
      const text = await res.text()
      const hasImage = text.includes('bytesBase64Encoded')
      results.push({ model, status: res.status, hasImage, response: text.slice(0, 400) })
      if (hasImage) return results
    } catch (e) {
      results.push({ model, error: String(e) })
    }
  }
  return results
}

function buildPrompt(query: string, style: string): string {
  const cleaned = query
    .replace(/\b[A-Z][a-z]+\b/g, 'a child')
    .replace(/\bI\b/g, 'a child')
    .replace(/\bmy\b/gi, 'the')
    .slice(0, 200)
  const s = style ? `Consistent visual style: ${style}. ` : ''
  return `Real photograph, DSLR camera: ${s}${cleaned}. NOT cartoon, NOT illustration, NOT drawing. Real people, photographic realism. Child-safe scene. No text in image.`
}

async function tryGemini(prompt: string, key: string): Promise<string | null> {
  const models = ['imagen-4.0-fast-generate-001', 'imagen-4.0-generate-001']
  const versions = ['v1beta', 'v1']
  for (const model of models) {
    for (const v of versions) {
      try {
        const url = `https://generativelanguage.googleapis.com/${v}/models/${model}:predict?key=${key}`
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: {
              sampleCount: 1,
              aspectRatio: '4:3',
              safetySetting: 'block_low_and_above',
              personGeneration: 'allow_all',
              negativePrompt: 'cartoon, illustration, drawing, anime, animated, digital art',
            },
          }),
        })
        const text = await res.text()
        if (!res.ok) {
          console.error(`Gemini ${model}/${v} ${res.status}:`, text.slice(0, 300))
          continue
        }
        const data = JSON.parse(text)
        const b64 = data?.predictions?.[0]?.bytesBase64Encoded
        if (b64) return b64
      } catch (e) {
        console.error(`Gemini ${model}/${v} exception:`, e)
      }
    }
  }
  return null
}

function placeholder(label: string) {
  const w = label.replace(/\b[A-Z][a-z]+\b/g, '').trim().split(' ').slice(0, 3).join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <rect width="600" height="400" fill="#F9FAFB" rx="16"/>
    <text x="300" y="190" text-anchor="middle" fill="#D1D5DB" font-size="64" font-family="sans-serif">🖼️</text>
    <text x="300" y="250" text-anchor="middle" fill="#D1D5DB" font-size="16" font-family="sans-serif">${w}</text>
  </svg>`
}
