import { NextRequest, NextResponse } from 'next/server'
import { resolveModel } from '@/lib/agents/models'
import { CONTENT_AGENT_PROMPT } from '@/lib/agents/prompts'
import { TYPE_PROMPTS, VISUAL_INSTRUCTION } from '@/lib/agents/contentTemplates'
import { AAC_ROUTER_PROMPT, AAC_ROUTER_SCHEMA, AAC_TYPES, extractConcepts } from '@/lib/agents/aacTemplates'

// AAC Studio (AAC_STUDIO_PLAN.md §4) — the prompt-driven front door for materials.
// Two entry modes:
//   { prompt, child, goals }          — free text: Emma routes it to a material type first
//   { materialType, child, goal, topic } — manual picker: skip routing, generate directly
// AAC types (comm_board, sentence_builder, visual_timetable) generate with structured
// output and get their concepts fired at the resolve-symbols Edge Function from HERE
// (this route holds the shared cron secret; the browser never sees it). Classic types
// reuse the shared TYPE_PROMPTS so the result matches what /api/content produces.
// The client saves the returned content to generated_content, same as /api/content.

type RouterDecision = {
  material_type: string
  topic: string
  goal_id: string
  target_length: number
  rows: number
  cols: number
  period: string
  reason: string
}

async function callClaude(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

function textOf(response: Record<string, unknown>): string {
  const text = (response.content as { type: string; text?: string }[] | undefined)
    ?.find(b => b.type === 'text')?.text
  if (!text) throw new Error('no text block in model response')
  return text
}

function fireResolveSymbols(materialType: string, content: Record<string, unknown>, lang: string) {
  const concepts = extractConcepts(materialType, content).map(c => ({ ...c, language: lang }))
  if (!concepts.length || !process.env.WEEKLY_FOCUS_CRON_SECRET) return
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/resolve-symbols`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.WEEKLY_FOCUS_CRON_SECRET },
    body: JSON.stringify({ concepts }),
  }).catch(err => console.error('resolve-symbols trigger failed:', err))
}

export async function POST(req: NextRequest) {
  const { prompt, materialType, child, goals, goal, topic, language, action, feedback, currentContent } = await req.json()
  if (!child) return NextResponse.json({ error: 'child required' }, { status: 400 })
  const lang = language || (child.language as string) || 'en'
  const activeGoals = (goals || []) as Record<string, unknown>[]

  try {
    const model = await resolveModel('standard')

    // Revision loop for AAC materials — schema-enforced so the shape never drifts,
    // and any new concepts the revision introduces get their symbols resolved too
    if (action === 'revise' && materialType && AAC_TYPES[materialType] && currentContent && feedback) {
      const revRes = await callClaude({
        model,
        thinking: { type: 'disabled' },
        max_tokens: 8000,
        system: CONTENT_AGENT_PROMPT,
        messages: [{
          role: 'user',
          content: `You created this material for ${child.name}:
${JSON.stringify(currentContent, null, 2)}

The parent has given this feedback:
"${feedback}"

Revise the material based on their feedback. Keep everything personalised to ${child.name}, keep every concept/emoji/word_class/colour field filled per the same rules as the original (Fitzgerald Key colours by word class; concept = lowercase searchable keyword).`,
        }],
        output_config: { format: { type: 'json_schema', schema: AAC_TYPES[materialType].schema } },
      })
      const content = JSON.parse(textOf(revRes)) as Record<string, unknown>
      fireResolveSymbols(materialType, content, lang)
      return NextResponse.json({ material_type: materialType, content })
    }

    // 1) Route free text to a material type (unless the caller already picked one)
    let decision: RouterDecision
    if (materialType) {
      decision = {
        material_type: materialType,
        topic: topic || (goal?.label as string) || '',
        goal_id: (goal?.id as string) || '',
        target_length: 0, rows: 0, cols: 0, period: '', reason: 'manual selection',
      }
    } else {
      if (!prompt?.trim()) return NextResponse.json({ error: 'prompt required' }, { status: 400 })
      const routerRes = await callClaude({
        model,
        thinking: { type: 'disabled' },
        max_tokens: 1000,
        system: AAC_ROUTER_PROMPT,
        messages: [{
          role: 'user',
          content: `PARENT'S REQUEST: "${prompt.trim()}"

--- CHILD ---
${JSON.stringify({ name: child.name, interests: child.interests, language: lang })}

--- COMMUNICATION LEVEL ---
${JSON.stringify(child.communication_level || 'not specified')}

--- ACTIVE GOALS (copy goal_id exactly from these) ---
${JSON.stringify(activeGoals.map(g => ({ id: g.id, label: g.label, area: g.area, status: g.status })))}`,
        }],
        output_config: { format: { type: 'json_schema', schema: AAC_ROUTER_SCHEMA } },
      })
      decision = JSON.parse(textOf(routerRes))
    }

    const linkedGoal = activeGoals.find(g => g.id === decision.goal_id) || goal || null

    // 2) Generate the material
    let content: Record<string, unknown>
    const aacType = AAC_TYPES[decision.material_type]

    if (aacType) {
      const genRes = await callClaude({
        model,
        thinking: { type: 'disabled' },
        max_tokens: 8000,
        system: CONTENT_AGENT_PROMPT,
        messages: [{
          role: 'user',
          content: aacType.prompt({
            topic: decision.topic || (linkedGoal?.label as string) || 'communication practice',
            goal: linkedGoal,
            child,
            language: lang,
            targetLength: decision.target_length || undefined,
            rows: decision.rows || undefined,
            cols: decision.cols || undefined,
            period: decision.period || undefined,
          }),
        }],
        output_config: { format: { type: 'json_schema', schema: aacType.schema } },
      })
      content = JSON.parse(textOf(genRes))

      // 3) Fire the symbol engine — concept-keyed, ACKs instantly, resolves in the
      // background on Supabase (ARASAAC → Imagen). Emoji renders until symbols land.
      fireResolveSymbols(decision.material_type, content, lang)
    } else {
      // Classic type routed from the free-text box — same generation as /api/content
      const typePromptFn = TYPE_PROMPTS[decision.material_type] || TYPE_PROMPTS.activity_pack
      const goalish = linkedGoal || { label: decision.topic }
      const genRes = await callClaude({
        model,
        thinking: { type: 'disabled' },
        max_tokens: 3000,
        system: CONTENT_AGENT_PROMPT,
        messages: [{
          role: 'user',
          content: `${typePromptFn(goalish as Record<string, unknown>, child)}

CHILD CONTEXT:
Name: ${child.name}
Interests: ${((child.interests as string[]) || []).join(', ') || 'not specified'}
Language: ${lang}
${decision.topic ? `TOPIC (from the parent's own request): ${decision.topic}` : ''}

${VISUAL_INSTRUCTION}

Make this genuinely personalised to ${child.name}.
Return ONLY valid JSON — no markdown, no explanation.`,
        }],
      })
      const raw = textOf(genRes).replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      content = JSON.parse(raw)
    }

    return NextResponse.json({
      material_type: decision.material_type,
      goal_id: decision.goal_id || null,
      reason: decision.reason,
      content,
    })
  } catch (err) {
    console.error('aac-studio error:', err)
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
  }
}

export const maxDuration = 120
