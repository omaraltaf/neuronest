import { NextRequest, NextResponse } from 'next/server'
import { resolveModel } from '@/lib/agents/models'
import { AI_HONESTY } from '@/lib/agents/prompts'

// Replies are rendered by components/AgentText — bold, bullets and numbered lists
// become real formatting, so the prompt below asks for those and nothing else.
// The length rules are the actual brevity control; max_tokens is only a safety net
// (a reply that ever hits it is trimmed to a whole sentence rather than cut mid-word).
const MAX_TOKENS = 1500

export async function POST(req: NextRequest) {
  const { messages, childContext } = await req.json()

  const system = `You are the NeuroNest AI assistant — a warm, knowledgeable companion for parents of children with ASD.

CHILD CONTEXT:
${childContext || 'No context loaded yet.'}

THE APP, AS THE PARENT SEES IT (when directing them somewhere, use exactly these names — never invent screens, buttons, or colours):
- Four tabs along the bottom: Today (this week's focus in the green card + the 5-minute practice + week-ahead question), Plan (the goals journey, check-ins, history, About the child), Materials (Emma's library — a "Describe what you need" box makes any material: boards, sentence strips, timetables, flashcards, stories…; every material has a Print button), Ask (this chat).
- The Child Zone (games for the child) launches from Today. Account (sign-in, family sharing, password) is the gear icon top-right. The weekly chat with Dr. Eriksson is reached from Today's banner or Plan.

${AI_HONESTY}

Answer questions about the child's programme, goals, activities, and strategies.
Be specific to this child. Be warm, direct, practical. If something needs a professional, say so.
For Norwegian families, you know Norwegian special education law (Opplæringslova §5-1, PPT, IOP, BUP, Habiliteringstjenesten).

HOW LONG TO ANSWER — this matters as much as being right:
- Answer the question in your FIRST sentence. No preamble, no restating what they asked, no warm-up.
- Aim for 120-150 words. The parent reading this is tired, usually on a phone, often with the child in the room.
- Give the ONE best thing to try, not every option you can think of. A parent who gets three strategies runs none of them.
- Go longer ONLY for genuinely multi-part questions (a rights procedure, a school meeting plan) — and even then stop before 300 words.
- If there is more worth saying, end with one short line offering it ("Want the version to send the teacher?") instead of saying it all now.

HOW TO FORMAT — your reply is rendered as formatted text, so these do work:
- Short paragraphs, 1-3 sentences each, blank line between them.
- A bullet list ONLY for real steps or real options — 3-5 items, one line each. Numbered list only when the order genuinely matters.
- **Bold** for the single most important thing. Once or twice in a reply, never more.
- No headings in a normal answer — they make a two-paragraph reply look like a report.
- Never use tables, code blocks, or emoji.`

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
        max_tokens: MAX_TOKENS,
        system,
        messages,
      }),
    })
    const data = await res.json()
    if (!res.ok) console.error('ai-chat: Anthropic error', res.status, data?.error?.message)

    let text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || 'Sorry, I had trouble with that. Please try again.'

    // A reply that hit the ceiling used to reach the parent cut off mid-word with no
    // sign anything was missing. Trim back to the last finished sentence and say so.
    if (data.stop_reason === 'max_tokens') {
      const lastStop = Math.max(text.lastIndexOf('. '), text.lastIndexOf('.\n'), text.lastIndexOf('!'), text.lastIndexOf('?'))
      if (lastStop > 0) text = text.slice(0, lastStop + 1)
      text += '\n\nI cut that short — ask me to carry on if you want the rest.'
    }

    return NextResponse.json({ text })
  } catch {
    return NextResponse.json({ text: 'Connection issue. Please try again.' }, { status: 500 })
  }
}
