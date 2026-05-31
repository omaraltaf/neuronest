import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const query     = req.nextUrl.searchParams.get('q') || 'child happy'
  const styleSeed = req.nextUrl.searchParams.get('style') || ''
  const contentId = req.nextUrl.searchParams.get('cid') || ''
  const index     = req.nextUrl.searchParams.get('i') || '0'
  const childId   = req.nextUrl.searchParams.get('child') || ''
  const isDebug   = !!req.nextUrl.searchParams.get('debug')
  const GEMINI_KEY = process.env.GEMINI_API_KEY

  if (isDebug) {
    return NextResponse.json({
      status: 'reached',
      query,
      geminiKeyPresent: !!GEMINI_KEY,
      geminiKeyPrefix: GEMINI_KEY?.slice(0, 15) || 'NOT SET',
      geminiKeyLength: GEMINI_KEY?.length || 0,
      env: process.env.NODE_ENV,
    })
  }

  if (!GEMINI_KEY) return svgPlaceholder(query)

  // ── 1. Check cache ──────────────────────────────────────────────────────────
  if (contentId && childId) {
    try {
      const supabase = createClient()
      const { data: cached } = await supabase
        .from('story_images')
        .select('storage_path')
        .eq('content_id', contentId)
        .eq('sentence_index', parseInt(index))
        .maybeSingle()

      if (cached?.storage_path) {
        const { data: { publicUrl } } = supabase.storage
          .from('neuronest-documents')
          .getPublicUrl(cached.storage_path)
        return NextResponse.redirect(publicUrl, { status: 302 })
      }
    } catch (e) {
      console.error('Cache check error:', e)
    }
  }

  // ── 2. Generate ─────────────────────────────────────────────────────────────
  const prompt = buildPrompt(query, styleSeed)
  let base64: string | null = null

  base64 = await tryGemini(prompt, 'imagen-3.0-generate-002', GEMINI_KEY)
  if (!base64) base64 = await tryGemini(prompt, 'imagen-3.0-fast-generate-001', GEMINI_KEY)

  if (!base64) return svgPlaceholder(query)

  // ── 3. Cache ────────────────────────────────────────────────────────────────
  if (contentId && childId) {
    try {
      const supabase = createClient()
      const buffer = Buffer.from(base64, 'base64')
      const storagePath = `story-images/${childId}/${contentId}/${index}.png`
      await supabase.storage.from('neuronest-documents').upload(storagePath, buffer, {
        contentType: 'image/png', upsert: true,
      })
      await supabase.from('story_images').upsert({
        child_id: childId, content_id: contentId,
        sentence_index: parseInt(index), prompt, storage_path: storagePath,
      }, { onConflict: 'content_id,sentence_index' })
    } catch (e) {
      console.error('Cache save error:', e)
    }
  }

  return new NextResponse(Buffer.from(base64, 'base64'), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=2592000' },
  })
}

function buildPrompt(query: string, styleSeed?: string): string {
  const cleaned = query
    .replace(/\b[A-Z][a-z]+\b/g, 'a child')
    .replace(/\bI\b/g, 'a child')
    .replace(/\bmy\b/gi, 'the')
    .slice(0, 200)

  const style = styleSeed ? `Consistent visual style: ${styleSeed}. ` : ''
  return `Real photograph, DSLR camera, natural daylight: ${style}${cleaned}. NOT cartoon, NOT illustration, NOT drawing, NOT animated. Real people, photographic realism. Child-safe positive scene. No text in image.`
}

async function tryGemini(prompt: string, model: string, apiKey: string): Promise<string | null> {
  const urls = [
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1/models/${model}:predict?key=${apiKey}`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '4:3',
            safetySetting: 'block_only_high',
            personGeneration: 'allow_all',
            negativePrompt: 'cartoon, illustration, drawing, anime, sketch, painting, watercolor, digital art, 3d render, CGI, animated',
          },
        }),
      })
      const text = await res.text()
      if (!res.ok) {
        console.error(`Gemini ${model} ${res.status}:`, text.slice(0, 400))
        continue
      }
      const data = JSON.parse(text)
      const b64 = data?.predictions?.[0]?.bytesBase64Encoded
      if (b64) return b64
    } catch (e) {
      console.error(`Gemini ${model} exception:`, e)
    }
  }
  return null
}

async function generateWithDallE(prompt: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'dall-e-3', prompt, n: 1, size: '1024x768',
        response_format: 'b64_json', quality: 'standard', style: 'natural',
      }),
    })
    if (!res.ok) { console.error('DALL-E error:', res.status); return null }
    const data = await res.json()
    return data?.data?.[0]?.b64_json || null
  } catch (e) {
    console.error('DALL-E exception:', e)
    return null
  }
}

// Keep reference so TypeScript doesn't complain about unused function
void generateWithDallE

function svgPlaceholder(label: string) {
  const words = label.replace(/\b[A-Z][a-z]+\b/g, '').trim().split(' ').slice(0, 4).join(' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <rect width="600" height="400" fill="#F9FAFB" rx="16"/>
    <text x="300" y="180" text-anchor="middle" fill="#D1D5DB" font-size="72" font-family="sans-serif">🖼️</text>
    <text x="300" y="250" text-anchor="middle" fill="#D1D5DB" font-size="16" font-family="sans-serif">${words}</text>
  </svg>`
  return new NextResponse(svg, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=60' },
  })
}
