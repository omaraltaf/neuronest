import { NextRequest, NextResponse } from 'next/server'
import { resolveModel } from '@/lib/agents/models'
import { CONTENT_AGENT_PROMPT } from '@/lib/agents/prompts'
import { TYPE_PROMPTS, VISUAL_INSTRUCTION } from '@/lib/agents/contentTemplates'
import { extractConcepts } from '@/lib/agents/aacTemplates'

// Concept-carrying types get their AAC symbols resolved in the shared per-concept
// library (resolve-symbols Edge Function) — fired from here because the browser must
// never see the cron secret. Fire-and-forget; emoji is the UI fallback until they land.
function fireResolveSymbols(contentType: string, content: Record<string, unknown>, lang: string) {
  const concepts = extractConcepts(contentType, content).map(c => ({ ...c, language: lang }))
  if (!concepts.length || !process.env.WEEKLY_FOCUS_CRON_SECRET) return
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/resolve-symbols`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.WEEKLY_FOCUS_CRON_SECRET },
    body: JSON.stringify({ concepts }),
  }).catch(err => console.error('resolve-symbols trigger failed:', err))
}

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
        model: await resolveModel('standard'),
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
      const parsed = JSON.parse(clean)
      fireResolveSymbols(contentType, parsed, language || 'en')
      return NextResponse.json({ content: parsed })
    } catch {
      return NextResponse.json({ content: { raw: text }, error: 'Parse failed' })
    }
  } catch (err) {
    console.error('Content generation error:', err)
    return NextResponse.json({ content: {}, error: 'Generation failed' }, { status: 500 })
  }
}
