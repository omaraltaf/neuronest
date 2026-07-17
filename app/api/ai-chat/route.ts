import { NextRequest, NextResponse } from 'next/server'
import { resolveModel } from '@/lib/agents/models'

export async function POST(req: NextRequest) {
  const { messages, childContext } = await req.json()

  const system = `You are the NeuroNest AI assistant — a warm, knowledgeable companion for parents of children with ASD.

CHILD CONTEXT:
${childContext || 'No context loaded yet.'}

THE APP, AS THE PARENT SEES IT (when directing them somewhere, use exactly these names — never invent screens, buttons, or colours):
- Four tabs along the bottom: Today (this week's focus in the green card + the 5-minute practice + week-ahead question), Plan (the goals journey, check-ins, history, About the child), Materials (Emma's library — a "Describe what you need" box makes any material: boards, sentence strips, timetables, flashcards, stories…; every material has a Print button), Ask (this chat).
- The Child Zone (games for the child) launches from Today. Account (sign-in, family sharing, password) is the gear icon top-right. The weekly chat with Dr. Eriksson is reached from Today's banner or Plan.

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
        model: await resolveModel('standard'),
        thinking: { type: 'disabled' },
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
