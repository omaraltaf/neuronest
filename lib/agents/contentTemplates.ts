// Emma Blackwell's content generation templates — shared between the parent-initiated
// generation route (/api/content) and proactive anticipation (§5.3, /api/weekly-focus PATCH).
// The JSON shapes here are what app/content/page.tsx renders — keep them in sync.

export const VISUAL_INSTRUCTION = `
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

export const TYPE_PROMPTS: Record<string, (goal: Record<string, unknown>, child: Record<string, unknown>) => string> = {
  social_story: (goal, child) => `Create a Social Story (Carol Gray method) for ${child.name}.
Topic: ${goal.label}
Root cause: ${goal.root_cause_addressed || 'social understanding'}

Rules:
- Use ${child.name}'s real name throughout
- First person, present tense, positive framing (what TO do, never what NOT to do)
- 4-8 sentences only
- 2:1 ratio: descriptive/perspective sentences to directive sentences
- Every sentence starts with a relevant emoji

CRITICAL — VISUAL CONSISTENCY:
The story needs a STYLE SEED that defines the visual world of this story.
Choose ONE consistent setting, ONE consistent lighting style, and ONE colour palette.
Every image_query must reference the same visual style so all photos look like they belong together.

Example style seeds:
- "bright indoor classroom, natural window light, warm tones"
- "sunny outdoor playground, golden hour light, soft focus"  
- "cozy home living room, soft lamp light, earth tones"

For each sentence, write an image_query that:
1. Describes the specific action/scene in the sentence
2. ENDS WITH the style seed (so all images share the same visual world)
3. Uses photographic language: "candid photo of...", "natural light...", "shallow depth of field"

Return JSON:
{
  "title": "story title",
  "style_seed": "the consistent visual style for all images in this story",
  "sentences": [
    {
      "emoji": "🏫",
      "text": "sentence here",
      "type": "descriptive|perspective|directive",
      "image_query": "specific photographic description + style seed"
    }
  ],
  "cover_emoji": "🌟",
  "cover_colour": "#hex colour for the story theme",
  "how_to_use": "short parent instruction",
  "frequency": "e.g. Read together every morning before school",
  "print_tip": "e.g. Print each sentence on a separate card with the photo above the text"
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

AAC STANDARDS (non-negotiable — these children often already use AAC/ASK symbols at school):
- One concept per card, zero visual clutter.
- Card "colour" follows the modified Fitzgerald Key by word class — never decorative:
  people #F59E0B (yellow) · actions/verbs #16A34A (green) · describing words #5B7FE8 (blue) · things/nouns #F97316 (orange) · social words #DB2777 (pink) · question words #7C3AED (purple)

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
