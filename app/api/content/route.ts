import { NextRequest, NextResponse } from 'next/server'
import { CONTENT_AGENT_PROMPT } from '@/lib/agents/prompts'

const VISUAL_INSTRUCTION = `
VISUAL DESIGN REQUIREMENTS (critical — these children are visual learners):
- Every activity step must start with a relevant emoji that visually represents the action
- Every card must have a dominant emoji (large, obvious)
- Use colour categories: 🔴 Stop/No, 🟢 Go/Yes, 🔵 Information, 🌟 Success, ⚡ Action, 🎯 Target
- Social stories: each sentence gets an emoji at the start
- Flashcards: large central emoji + word (no walls of text)
- Activity steps: numbered with emoji prefix, max 10 words per step
- Sensory cards: colour-coded by type (🔵 calming, 🔴 alerting, 🟢 organising)
- First-Then boards: ⬛ FIRST [emoji + word] → ⬜ THEN [emoji + word]
- Visual schedules: each item is emoji + max 3 words
- Keep all text at the child's language level — simple, concrete, positive
- Never use abstract concepts without a visual anchor`

const TYPE_PROMPTS: Record<string, (goal: Record<string, unknown>, child: Record<string, unknown>) => string> = {
  social_story: (goal, child) => `Create a Social Story (Carol Gray method) for ${child.name}.
Topic: ${goal.label}
Root cause: ${goal.root_cause_addressed || 'social understanding'}

Rules:
- Use ${child.name}'s real name throughout
- First person, present tense, positive framing (what TO do, never what NOT to do)
- 4-8 sentences only
- 2:1 ratio: descriptive/perspective sentences to directive sentences
- Every sentence starts with a relevant emoji

Return JSON:
{
  "title": "story title",
  "sentences": [
    { "emoji": "🏫", "text": "sentence here", "type": "descriptive|perspective|directive" }
  ],
  "cover_emoji": "🌟",
  "cover_colour": "#hex colour for the story theme",
  "how_to_use": "short parent instruction",
  "frequency": "e.g. Read together every morning before school",
  "print_tip": "e.g. Print each sentence on a separate card with the emoji large on top"
}`,

  activity_pack: (goal, child) => `Create a visual activity pack for ${child.name} targeting: ${goal.label}
Approach: ${goal.approach || 'naturalistic ABA'}
Interests: ${(child.interests as string[] || []).join(', ') || 'not specified'}

Include 3 activities. Each must be:
- Parent-executable at home, no special equipment
- Highly visual — emoji for every step
- Max 8 words per instruction step

Return JSON:
{
  "title": "pack title",
  "pack_emoji": "🎯",
  "goal_connection": "one sentence linking to goal",
  "activities": [
    {
      "title": "activity name",
      "emoji": "🎮",
      "colour": "#hex",
      "duration": "5-10 min",
      "difficulty": "easy|medium|hard",
      "what_you_need": [{ "emoji": "📦", "item": "name" }],
      "visual_schedule": [
        { "step": 1, "emoji": "👋", "instruction": "max 8 words", "tip": "optional parent note" }
      ],
      "first_then": { "first_emoji": "🎯", "first": "activity name", "then_emoji": "🌟", "then": "reward" },
      "success_emoji": "🌟",
      "success_criterion": "observable in one sentence",
      "if_struggling": "one sentence — simpler version",
      "if_succeeding": "one sentence — harder version",
      "why_it_works": "one sentence clinical rationale"
    }
  ],
  "data_tip": "simple tracking method for parents"
}`,

  flashcard_set: (goal, child) => `Create a visual flashcard set for ${child.name}.
Goal: ${goal.label}
Language level: ${(child as Record<string, unknown>).language_level || 'single words emerging'}
Interests: ${(child.interests as string[] || []).join(', ') || 'general'}

Create 8 flashcards. Make them visually engaging and embed ${child.name}'s interests where possible.

Return JSON:
{
  "title": "set title",
  "theme_emoji": "🎨",
  "theme_colour": "#hex",
  "how_to_use": "parent instruction",
  "cards": [
    {
      "word": "TARGET WORD",
      "big_emoji": "🐶",
      "category_emoji": "🐾",
      "colour": "#hex",
      "pronunciation": "how to say it",
      "model_sentence": "short sentence using the word",
      "prompt_gesture": "physical prompt to pair with word",
      "level_1": "simplest prompt to elicit",
      "level_2": "medium prompt",
      "level_3": "independent target"
    }
  ],
  "game_ideas": [
    { "emoji": "🎮", "name": "game name", "instructions": "2 sentence description" }
  ]
}`,

  sensory_card: (goal, child) => `Create a sensory regulation toolkit card for ${child.name}.
Sensory profile: ${goal.rationale || 'mixed profile'}
Goal: ${goal.label}

Return JSON:
{
  "title": "toolkit title",
  "child_name": "${child.name}",
  "purpose_emoji": "🌊",
  "warning_signs": [
    { "emoji": "⚡", "sign": "observable behaviour", "meaning": "what this means sensory-wise" }
  ],
  "toolkit": [
    {
      "name": "strategy name",
      "emoji": "🎯",
      "type": "calming|alerting|organising",
      "colour": "#hex (blue=calming, red=alerting, green=organising)",
      "duration": "X minutes",
      "visual_steps": [
        { "step": 1, "emoji": "🙌", "instruction": "max 6 words" }
      ],
      "when_to_use": "specific trigger situation",
      "why_it_works": "plain language neuroscience, one sentence"
    }
  ],
  "first_then_examples": [
    { "trigger": "situation", "first_emoji": "🌊", "first": "strategy", "then_emoji": "✅", "then": "outcome" }
  ]
}`,

  role_play: (goal, child) => `Create a visual role-play script for ${child.name}.
Goal: ${goal.label}
Duration: 2-3 minutes. Child always wins. Highly repetitive.

Return JSON:
{
  "title": "role play title",
  "scenario_emoji": "🎭",
  "scenario": "brief setup in one sentence",
  "characters": ["Parent", "${child.name}"],
  "script": [
    {
      "speaker": "Parent",
      "emoji": "👨",
      "colour": "#7C3AED",
      "line": "exact words to say",
      "action_emoji": "👐",
      "action": "what to do while saying this",
      "wait_emoji": "⏳",
      "child_cue": "what you want child to say/do next"
    }
  ],
  "celebration": { "emoji": "🎉", "text": "exactly how to celebrate", "reward_emoji": "⭐" },
  "visual_supports": [
    { "emoji": "🖼️", "item": "visual support to prepare", "purpose": "why it helps" }
  ],
  "variations": [{ "emoji": "🔄", "variation": "how to vary it" }]
}`
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
        model: 'claude-sonnet-4-20250514',
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
