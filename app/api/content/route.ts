import { NextRequest, NextResponse } from 'next/server'
import { CONTENT_AGENT_PROMPT } from '@/lib/agents/prompts'

export async function POST(req: NextRequest) {
  const { goal, child, contentType, language } = await req.json()

  const typeInstructions: Record<string, string> = {
    social_story: `Create a personalised Social Story (Carol Gray method) for ${child.name}.
The story should address: ${goal.label}
Root cause: ${goal.root_cause_addressed || 'social understanding'}
Use ${child.name}'s real name throughout. First person, present tense, positive framing.
4-8 sentences. 2:1 descriptive/perspective to directive ratio.

Return JSON:
{
  "title": "story title",
  "sentences": ["sentence 1", "sentence 2", ...],
  "illustration_prompts": ["what to draw for each sentence"],
  "how_to_use": "instructions for the parent",
  "frequency": "how often to read it"
}`,

    activity_pack: `Create a detailed activity pack for ${child.name} targeting: ${goal.label}
Approach: ${goal.approach || 'ABA-based naturalistic teaching'}
Baseline: ${goal.baseline || 'emerging skill'}
Include 3 specific activities, each parent-executable at home with no special equipment.

Return JSON:
{
  "title": "activity pack title",
  "goal_connection": "how this directly targets the goal",
  "activities": [
    {
      "title": "activity name",
      "duration": "5-10 minutes",
      "what_you_need": ["item 1", "item 2"],
      "setup": "how to prepare",
      "script": "exact words to say",
      "steps": ["step 1", "step 2", "step 3"],
      "success_looks_like": "observable criterion",
      "if_struggling": "what to do",
      "if_succeeding": "how to make it harder",
      "why_it_works": "one sentence clinical rationale"
    }
  ],
  "generalisation_tips": ["tip 1", "tip 2"],
  "data_collection": "how to track progress simply"
}`,

    flashcard_set: `Create a personalised flashcard set for ${child.name} targeting: ${goal.label}
Language level: ${child.language_level || 'emerging single words'}
Embed ${child.name}'s known interests where possible.
Create 8 flashcards.

Return JSON:
{
  "title": "flashcard set name",
  "theme": "connecting theme",
  "cards": [
    {
      "word": "target word",
      "emoji": "representative emoji",
      "image_description": "what image to show",
      "pronunciation": "how to say it",
      "model_sentence": "use this in a sentence: ...",
      "prompt": "how to elicit this word"
    }
  ],
  "how_to_use": "parent instructions",
  "progression": "how to advance difficulty"
}`,

    sensory_card: `Create a sensory regulation card for ${child.name}.
Sensory profile: ${goal.rationale || 'mixed sensory profile'}
Target: ${goal.label}

Return JSON:
{
  "title": "card title",
  "purpose": "what this helps with",
  "activities": [
    {
      "name": "activity name",
      "type": "alerting|calming|organising",
      "duration": "X minutes",
      "how_to": "step by step",
      "what_you_need": ["materials"],
      "when_to_use": "triggers or times",
      "why_it_works": "neurological explanation in plain language"
    }
  ],
  "warning_signs": ["signs child needs this NOW"],
  "parent_tips": ["practical tips"]
}`,

    role_play: `Create a role-play script for ${child.name} targeting: ${goal.label}
Duration: 2-3 minutes, highly repetitive, child always wins.

Return JSON:
{
  "title": "role play name",
  "scenario": "brief scenario description",
  "characters": ["Parent", "${child.name}", "Optional third character"],
  "script": [
    {
      "speaker": "Parent",
      "line": "exact words",
      "action": "what to do while saying this",
      "child_cue": "what you want child to say/do"
    }
  ],
  "celebration": "how to celebrate when child responds",
  "variations": ["how to vary it to maintain interest"],
  "generalisation": "how to extend to real situations"
}`
  }

  const prompt = `${typeInstructions[contentType] || typeInstructions.activity_pack}

CHILD CONTEXT:
Name: ${child.name}
Age: ${child.age || 'unknown'}
Interests: ${child.interests?.join(', ') || 'not specified'}
School: ${child.school_name || 'not specified'}
Language: ${language || 'en'}

GOAL DETAILS:
${JSON.stringify(goal, null, 2)}

Return ONLY valid JSON — no markdown, no explanation.
Make this genuinely personalised to ${child.name} — embed their name, their school, their interests throughout.`

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
        max_tokens: 2500,
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
