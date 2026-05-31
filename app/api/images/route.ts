import { NextRequest, NextResponse } from 'next/server'

// Curated Unsplash photo IDs for common social story topics
// These are real photo IDs that work reliably
const TOPIC_IMAGES: Record<string, string[]> = {
  // School
  school:        ['3TLl_97HNJo', 'y02jEX_B0O0', 'XkKCUI44iM0', 'fd2Tl37ztAY'],
  classroom:     ['3TLl_97HNJo', 'f77Bh3inUpE', 'XkKCUI44iM0'],
  teacher:       ['y02jEX_B0O0', 'f77Bh3inUpE', 'SLx6LcQVlIM'],
  desk:          ['XkKCUI44iM0', 'hpjSkU2UYSU'],
  // Emotions / feelings
  happy:         ['1_CMoFsPfso', 'xCCmMBQhNkk', 'ITvAUnDa6Wg'],
  sad:           ['nGrfKmtwv24', 'dJpEzMFwxTI'],
  calm:          ['ue-c5M6yt0A', 'KG51jXMHX9w', 'aOC7TSLb1o8'],
  worried:       ['nGrfKmtwv24', 'SJvDxS0ZhwI'],
  angry:         ['dJpEzMFwxTI'],
  // Actions
  breathe:       ['ue-c5M6yt0A', 'KG51jXMHX9w'],
  walk:          ['pVoEPpLw818', 'UTebOCMiMnY'],
  sit:           ['XkKCUI44iM0', 'Q1p7bh3SHj8'],
  eat:           ['08bOYnH_r_E', 'eeqbbemH9-c'],
  play:          ['Zqy-x7K5Qcg', 'rN_RMqSXRKw', 'ITvAUnDa6Wg'],
  // Social
  friend:        ['Zqy-x7K5Qcg', 'rN_RMqSXRKw', '1_CMoFsPfso'],
  share:         ['rN_RMqSXRKw', 'Zqy-x7K5Qcg'],
  talk:          ['d2MSDujJl2g', '8e0EHPUx3Mo'],
  wave:          ['tQPgM1k6EbQ'],
  // Home
  home:          ['3wylDrjxH-E', 'RFAHj4tI37Y'],
  bed:           ['M_HgC2tBDpo', 'vbxyFxlgpjM'],
  breakfast:     ['08bOYnH_r_E', 'eeqbbemH9-c'],
  // Sensory / calm
  nature:        ['aOC7TSLb1o8', 'q10VITrVnFE', 'lS21bPdgHqw'],
  outside:       ['pVoEPpLw818', 'q10VITrVnFE'],
  // General child
  child:         ['Zqy-x7K5Qcg', '1_CMoFsPfso', 'ITvAUnDa6Wg', 'rN_RMqSXRKw'],
  children:      ['Zqy-x7K5Qcg', 'rN_RMqSXRKw', 'ITvAUnDa6Wg'],
  // Objects
  book:          ['Oaqk7qqNh_c', '9BoqXzEeQqM'],
  toy:           ['Zqy-x7K5Qcg', 'rN_RMqSXRKw'],
}

function findBestImage(query: string): string {
  const q = query.toLowerCase()
  const words = q.split(/\s+/)

  // Try to match topic keywords in order of specificity
  for (const word of words) {
    for (const [topic, ids] of Object.entries(TOPIC_IMAGES)) {
      if (word.includes(topic) || topic.includes(word)) {
        const id = ids[Math.floor(Math.random() * ids.length)]
        return `https://images.unsplash.com/photo-${id}?w=600&h=400&fit=crop&auto=format`
      }
    }
  }

  // Fallback: child image
  const fallbacks = TOPIC_IMAGES.child
  const id = fallbacks[Math.floor(Math.random() * fallbacks.length)]
  return `https://images.unsplash.com/photo-${id}?w=600&h=400&fit=crop&auto=format`
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') || 'child'
  const imageUrl = findBestImage(query)

  // Proxy the image through our server so it works regardless of network config
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'NeuroNest/1.0' },
    })

    if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`)

    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') || 'image/jpeg'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    // Return a simple coloured SVG placeholder if image fetch fails
    const colour = '#' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <rect width="600" height="400" fill="${colour}20"/>
      <text x="300" y="200" text-anchor="middle" dominant-baseline="middle" fill="${colour}" font-size="80" font-family="sans-serif">🖼️</text>
    </svg>`

    return new NextResponse(svg, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
    })
  }
}
