import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const query     = req.nextUrl.searchParams.get('q') || 'child happy'
  const styleSeed = req.nextUrl.searchParams.get('style') || ''
  const contentId = req.nextUrl.searchParams.get('cid') || ''
  const index     = req.nextUrl.searchParams.get('i') || '0'
  const childId   = req.nextUrl.searchParams.get('child') || ''
  const GEMINI_KEY = process.env.GEMINI_API_KEY

  if (!GEMINI_KEY || GEMINI_KEY === 'your_gemini_api_key_here') {
    return svgPlaceholder(query)
  }

  // ── 1. Check cache first ────────────────────────────────────────────────────
  if (contentId && childId) {
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

      // Redirect to the cached image in Supabase Storage
      return NextResponse.redirect(publicUrl, { status: 302 })
    }
  }

  // ── 2. Generate image ───────────────────────────────────────────────────────
  const safePrompt = buildPrompt(query, styleSeed)
  const OPENAI_KEY = process.env.OPENAI_API_KEY

  let base64: string | null = null

  // Try Gemini Imagen
  if (GEMINI_KEY) {
    base64 = await generateWithGemini(safePrompt, 'imagen-3.0-generate-002', GEMINI_KEY)
    if (!base64) {
      base64 = await generateWithGemini(safePrompt, 'imagen-3.0-fast-generate-001', GEMINI_KEY)
    }
  }

  // Fall back to DALL-E 3 if Gemini failed or unavailable
  if (!base64 && OPENAI_KEY && OPENAI_KEY !== 'your_openai_api_key_here') {
    base64 = await generateWithDallE(safePrompt, OPENAI_KEY)
  }

  if (!base64) {
    if (req.nextUrl.searchParams.get('debug')) {
      return NextResponse.json({
        error: 'No image generated',
        geminiKeyPresent: !!GEMINI_KEY,
        geminiKeyPrefix: GEMINI_KEY?.slice(0, 15) || 'missing',
        openaiKeyPresent: !!(OPENAI_KEY && OPENAI_KEY !== 'your_openai_api_key_here'),
        prompt: safePrompt,
      })
    }
    return svgPlaceholder(query)
  }

  // ── 3. Save to Supabase Storage so it's never regenerated ──────────────────
  if (contentId && childId) {
    try {
      const supabase = createClient()
      const buffer = Buffer.from(base64, 'base64')
      const storagePath = `story-images/${childId}/${contentId}/${index}.png`

      await supabase.storage
        .from('neuronest-documents')
        .upload(storagePath, buffer, {
          contentType: 'image/png',
          upsert: true,
        })

      await supabase.from('story_images').upsert({
        child_id: childId,
        content_id: contentId,
        sentence_index: parseInt(index),
        prompt: safePrompt,
        storage_path: storagePath,
      }, { onConflict: 'content_id,sentence_index' })
    } catch (err) {
      console.error('Failed to cache image:', err)
      // Continue — still return the image even if caching fails
    }
  }

  // ── 4. Return the generated image ──────────────────────────────────────────
  const buffer = Buffer.from(base64, 'base64')
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=2592000', // 30 days
    },
  })
}

function buildPrompt(query: string, styleSeed?: string): string {
  const cleaned = query
    .replace(/\b[A-Z][a-z]+\b/g, 'a child')
    .replace(/\bI\b/g, 'a child')
    .replace(/\bmy\b/gi, 'the')
    .slice(0, 200)

  const styleContext = styleSeed
    ? `Consistent visual style: ${styleSeed}. `
    : ''

  return `Real photograph, DSLR camera: ${styleContext}${cleaned}. NOT cartoon, NOT illustration, NOT drawing, NOT animated. Real people, photographic realism, candid moment. Child-safe positive scene. No text in image.`
}


async function generateWithGemini(
  prompt: string,
  model: string,
  apiKey: string
): Promise<string | null> {
  // Try both v1 and v1beta — key type determines which works
  const endpoints = [
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`,
    `https://generativelanguage.googleapis.com/v1/models/${model}:predict?key=${apiKey}`,
  ]

  for (const url of endpoints) {
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
            negativePrompt: 'cartoon, illustration, drawing, anime, sketch, painting, watercolor, digital art, 3d render, CGI, clipart, vector art, animated',
          },
        }),
      })

      const responseText = await res.text()

      if (!res.ok) {
        console.error(`Gemini ${model} ${url.includes('v1beta') ? 'v1beta' : 'v1'} error ${res.status}:`, responseText.slice(0, 500))
        continue // try next endpoint
      }

      const data = JSON.parse(responseText)
      const b64 = data?.predictions?.[0]?.bytesBase64Encoded
      if (b64) return b64

    } catch (err) {
      console.error(`Gemini ${model} exception:`, err)
    }
  }
  return null
}

async function generateWithDallE(prompt: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x768',
        response_format: 'b64_json',
        quality: 'standard',
        style: 'natural',  // 'natural' = more realistic, 'vivid' = more artistic
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('DALL-E error:', res.status, err.slice(0, 300))
      return null
    }

    const data = await res.json()
    return data?.data?.[0]?.b64_json || null
  } catch (err) {
    console.error('DALL-E exception:', err)
    return null
  }
}

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
