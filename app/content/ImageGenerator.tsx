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
      return await new Promise(resolve => {
        const reader = new FileReader()
        reader.onloadend = () => resolve((reader.result as string).split(',')[1])
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

  if (status === 'loading') {
    return (
      <div className="w-full bg-gray-100 flex items-center justify-center" style={{ height: 200 }}>
        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-1">
            <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
          </div>
          <div className="text-xs text-gray-400">Generating image…</div>
        </div>
      </div>
    )
  }

  if (status === 'error' || !src) {
    return (
      <div className="w-full bg-gray-50 flex items-center justify-center" style={{ height: 200 }}>
        <div className="text-center">
          <div className="text-4xl text-gray-300">🖼️</div>
          <div className="text-xs text-gray-400 mt-1">{alt}</div>
        </div>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} style={{ width: '100%', height: 200, objectFit: 'cover' }} />
  )
}
