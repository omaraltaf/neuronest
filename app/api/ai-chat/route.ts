import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { messages, childContext } = await req.json()

  const system = `You are the NeuroNest AI assistant — a warm, knowledgeable companion for parents of children with ASD.

CHILD CONTEXT:
${childContext || 'No context loaded yet.'}

Answer questions about the child's programme, goals, activities, and strategies.
Be specific to this child. Be warm, direct, practical. If something needs a professional, say so.
For Norwegian families, you know Norwegian special education law (Opplæringslova §5-1, PPT, IOP, BUP, Habiliteringstjenesten).`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system,
        messages,
      }),
    })
    const data = await res.json()
    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || 'Sorry, I had trouble with that. Please try again.'
    return NextResponse.json({ text })
  } catch {
    return NextResponse.json({ text: 'Connection issue. Please try again.' }, { status: 500 })
  }
}
