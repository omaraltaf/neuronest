import { NextRequest, NextResponse } from 'next/server'
import { CONTENT_AGENT_PROMPT } from '@/lib/agents/prompts'
import { TYPE_PROMPTS, VISUAL_INSTRUCTION } from '@/lib/agents/contentTemplates'

export async function POST(req: NextRequest) {
  const { goal, child, contentType, language, feedback, currentContent, action } = await req.json()

  let prompt: string

  if (action === 'revise' && currentContent && feedback) {
    // Feedback revision
    prompt = `You are Emma Blackwell, SEN teacher and content specialist.

You created this content for ${child.name}:
${JSON.stringify(currentContent, null, 2)}

The parent has given this feedback:
"${feedback}"

Please revise the content based on their feedback. Keep everything personalised to ${child.name}.
${VISUAL_INSTRUCTION}

Return the complete revised content in the same JSON format as the original. Return ONLY valid JSON.`
  } else {
    // Initial generation
    const typePromptFn = TYPE_PROMPTS[contentType] || TYPE_PROMPTS.activity_pack
    prompt = `${typePromptFn(goal as Record<string, unknown>, child as Record<string, unknown>)}

CHILD CONTEXT:
Name: ${(child as Record<string, unknown>).name}
Age: ${(child as Record<string, unknown>).dob ? `born ${(child as Record<string, unknown>).dob}` : 'not specified'}
Interests: ${((child as Record<string, unknown>).interests as string[] || []).join(', ') || 'not specified'}
School: ${(child as Record<string, unknown>).school_name || 'not specified'}
Language: ${language || 'en'}

${VISUAL_INSTRUCTION}

Make this genuinely personalised to ${(child as Record<string, unknown>).name} — use their name, their interests, their school, their world.
Return ONLY valid JSON — no markdown, no explanation.`
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        thinking: { type: 'disabled' },
        max_tokens: 3000,
        system: CONTENT_AGENT_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await res.json()
    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || '{}'
    try {
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      return NextResponse.json({ content: JSON.parse(clean) })
    } catch {
      return NextResponse.json({ content: { raw: text }, error: 'Parse failed' })
    }
  } catch (err) {
    console.error('Content generation error:', err)
    return NextResponse.json({ content: {}, error: 'Generation failed' }, { status: 500 })
  }
}
