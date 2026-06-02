'use client'
import { useState, useEffect } from 'react'

// Called from the BROWSER — bypasses Vercel's server network restrictions
async function generateImageClientSide(prompt: string, hfKey: string): Promise<string | null> {
  const models = [
    'black-forest-labs/FLUX.1-schnell',
    'stabilityai/stable-diffusion-xl-base-1.0',
  ]
  for (const model of models) {
    try {
      const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hfKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { width: 800, height: 600, num_inference_steps: 4 },
        }),
      })
      if (!res.ok) { console.error(`HF ${model} ${res.status}`); continue }
      const blob = await res.blob()
      if (blob.size < 1000) continue
      return await new Promise<string | null>(resolve => {
        const reader = new FileReader()
        reader.onloadend = () => { const r = reader.result as string | null; resolve(r ? r.split(',')[1] : null) }
        reader.readAsDataURL(blob)
      })
    } catch (e) { console.error(`HF ${model}:`, e) }
  }
  return null
}

export function StoryImageClientSide({ query, alt, styleSeed, contentId, childId, index }: {
  query: string
  alt: string
  styleSeed?: string
  contentId?: string
  childId?: string
  index?: number
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')

  useEffect(() => {
    const hfKey = process.env.NEXT_PUBLIC_HF_API_KEY
    if (!hfKey) { setStatus('error'); return }

    const style = styleSeed ? `${styleSeed}, ` : ''
    const cleaned = query
      .replace(/\b[A-Z][a-z]+\b/g, 'a child')
      .replace(/\bI\b/g, 'a child')
      .replace(/\bmy\b/gi, 'the')
      .slice(0, 200)
    const prompt = `${style}${cleaned}, real photograph, DSLR, natural light, photorealistic, child-safe, no text`

    generateImageClientSide(prompt, hfKey).then(b64 => {
      if (b64) {
        const imgSrc = `data:image/jpeg;base64,${b64}`
        setSrc(imgSrc)
        setStatus('loaded')

        // Save to Supabase via our API for caching
        if (contentId && childId && index !== undefined) {
          fetch('/api/images/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ b64, contentId, childId, index, prompt }),
          }).catch(() => {})
        }
      } else {
        setStatus('error')
      }
    })
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'error' || (!src && status !== 'loading')) {
    return null // Don't show broken image — story reads fine without it
  }

  if (status === 'loading') {
    return (
      <div className="w-full bg-gradient-to-r from-gray-100 to-gray-50 animate-pulse" style={{ height: 180 }} />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src ?? undefined} alt={alt} style={{ width: '100%', height: 200, objectFit: 'cover' }} />
  )
}
// rebuild 1780402620
