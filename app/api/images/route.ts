import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') || 'child happy'
  const GEMINI_KEY = process.env.GEMINI_API_KEY

  if (!GEMINI_KEY || GEMINI_KEY === 'your_gemini_api_key_here') {
    return svgPlaceholder(query)
  }

  // Build a child-safe, photorealistic prompt
  const prompt = `Photorealistic illustration suitable for a children's social story book: ${query}. 
Warm, soft lighting. Child-friendly. Safe, positive scene. No text or words in the image. 
Style: gentle, realistic, like a modern children's picture book photograph.`

  try {
    // Gemini Imagen 3 via Google AI API
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '4:3',
            safetySetting: 'block_only_high',
            personGeneration: 'allow_adult',
          },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini Imagen error:', res.status, err)
      return svgPlaceholder(query)
    }

    const data = await res.json()
    const base64 = data?.predictions?.[0]?.bytesBase64Encoded

    if (!base64) {
      console.error('No image in Gemini response')
      return svgPlaceholder(query)
    }

    // Return image directly
    const buffer = Buffer.from(base64, 'base64')
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (err) {
    console.error('Image generation error:', err)
    return svgPlaceholder(query)
  }
}

function svgPlaceholder(label: string) {
  const words = label.split(' ').slice(0, 3).join(' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <rect width="600" height="400" fill="#F3F4F6" rx="16"/>
    <text x="300" y="170" text-anchor="middle" fill="#9CA3AF" font-size="72" font-family="sans-serif">🖼️</text>
    <text x="300" y="240" text-anchor="middle" fill="#D1D5DB" font-size="18" font-family="sans-serif">${words}</text>
    <text x="300" y="268" text-anchor="middle" fill="#E5E7EB" font-size="13" font-family="sans-serif">Add GEMINI_API_KEY to enable AI images</text>
  </svg>`
  return new NextResponse(svg, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' },
  })
}
