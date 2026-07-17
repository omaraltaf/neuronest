// AAC Studio material templates (AAC_STUDIO_PLAN.md §3-4) — the prompt router and the
// concept-keyed material generators. Phase A types: comm_board, sentence_builder,
// visual_timetable. Every cell/word carries a `concept` (normalized keyword) that the
// resolve-symbols Edge Function turns into a real AAC pictogram (ARASAAC first, Imagen
// fallback), cached per-concept in neuronest.aac_symbols and reused across materials.
// The UI renders the resolved symbol with the word beneath; emoji is the fallback until
// the symbol lands. JSON shapes here are what app/content/aacViewers.tsx renders —
// keep them in sync.

// Modified Fitzgerald Key — the AAC colour convention children learn at kindergarten.
// Never decorative: colour always follows word class.
export const FITZGERALD = `word_class + colour follow the modified FITZGERALD KEY exactly:
  · person (people, pronouns, names) → #F59E0B (yellow)
  · action (verbs: want, help, go, eat) → #16A34A (green)
  · describing (adjectives/adverbs/feelings: big, more, hot) → #5B7FE8 (blue)
  · thing (nouns: water, apple, ball) → #F97316 (orange)
  · social (greetings, please/thanks, turn phrases: hello, my turn) → #DB2777 (pink)
  · question (what, where, who) → #7C3AED (purple)`

const CONCEPT_RULES = `CONCEPT RULES (every word/cell needs one — this drives the real AAC symbol image):
- concept: the word's plain dictionary-form meaning as a searchable keyword (1-2 words, lowercase), e.g. word "wants" → concept "want"; word "Mummy" → concept "mother". Use the material's language.
- symbol_description: one-line AAC symbol scene (Widgit/Boardmaker style — flat colour, bold outline, ONE clear concept, no clutter, never a depicted child). Required for personalised concepts a symbol library can't know (a specific toy, "Arya's classroom"); for common words a short scene is still useful as fallback.
- emoji: exactly ONE widely-supported emoji instantly readable as the word — the on-screen fallback until the symbol image resolves.`

// ──────────────────────────────────────────────────────────────
// The prompt router — the "Describe what you need" front door. Emma maps the parent's
// free text to a material type + parameters; the parent never picks from template names.
// ──────────────────────────────────────────────────────────────

export const AAC_ROUTER_PROMPT = `You are Emma Blackwell, specialist SEN teacher. A parent typed one sentence describing a material they need for their child. Decide which material type fits best and extract its parameters. You know these types:

AAC STUDIO TYPES (symbol-based, printable):
- comm_board: a grid of symbol cells the child points at to communicate — choice boards ("choose a snack"), core word boards, topic boards. Pick when the parent wants the child to SELECT or REQUEST between options.
- sentence_builder: colour-coded word strips the child cuts out and assembles into sentences ("I want juice"). THE progressive sentence-construction type. Pick when the parent mentions sentences, phrases, word combinations, or building/expanding language.
- visual_timetable: a vertical sequence of activities with times — morning routines, school days, bedtime routines. Pick when the parent wants a schedule, routine, or "what happens next" support.
- comprehension: a short symbol-supported story with picture-choice questions. Pick when the parent wants to check or build UNDERSTANDING — story questions, "did she understand", listening comprehension.
- number_cards: counting cards — a numeral plus that many repeated symbols. Pick for numbers, counting, early maths readiness.
- reward_chart: a token chart toward a reward the child earns. Pick for sticker/star charts, motivation systems, working-towards boards.
- word_wall: a themed vocabulary sheet grouped by Fitzgerald colour. Pick for vocabulary displays, word posters, topic word collections.
- matching_game: cut-out matching pairs (picture↔picture first, picture↔word harder). Pick for matching, memory, or pairing games.

CLASSIC TYPES:
- social_story: first-person story preparing the child for an event or situation (dentist, haircut, new sibling).
- activity_pack: step-by-step home practice activities for a goal.
- flashcard_set: vocabulary cards with prompts.
- sensory_card: regulation strategies toolkit.
- role_play: scripted practice scenario.

RULES:
- THE PARENT'S NAMED TYPE IS BINDING. If the request names a material — "flashcards"/"word cards" → flashcard_set, "story" → social_story, "board" → comm_board, "sentence strips/builder" → sentence_builder, "timetable/schedule" → visual_timetable, "reward/sticker chart" → reward_chart, "word wall" → word_wall, "matching/memory game" → matching_game, "counting/number cards" → number_cards, "activities" → activity_pack — material_type MUST be that type. NEVER substitute the type you think would serve better ("flashcards to prepare for X" = flashcards about X, not a social story). If you genuinely believe a different type would serve the child much better, make the named type anyway and say so in reason — or, if the named type truly cannot express the request, ask ONE clarifying question offering both options. Only when NO type is named do you choose freely.
- topic: rephrase what the material is about as the child's experience, short ("Choosing snack", "Morning routine on school days").
- goal_id: copy the UUID of the active goal this most naturally supports, or "" if none fits — never force a match.
- target_length (sentence_builder only, else 0): words per sentence. If the parent named a length use it; otherwise infer from the child's communication level — currently single words → 2 or 3, phrases emerging → 3 or 4. Never more than 2 above their current level.
- rows/cols (comm_board only, else 0): grid size from 2x2 (early choices) to 5x4 (topic board). Fewer, larger cells for earlier communicators — BUT the grid MUST have enough cells for every mentioned_item PLUS 1-2 core/request words. Named items are promises; size the grid up before ever dropping one.
- period (visual_timetable only, else ""): e.g. "morning", "school day", "bedtime".
- If the request is ambiguous between two types, pick the one that gives the child the most active communication role.
- mentioned_items: list EVERY specific word, item, activity, person, or example the parent explicitly named ("with juice, milk and water" → ["juice","milk","water"]; "wake up, breakfast, bus" → those three). Empty array if none. These are promises to the parent — the generator must include all of them.
- card_count (flashcard_set only, else 0): the number of cards. If the parent named a number, use it. If not, this is a REQUIRED clarification: ask "How many cards should I make — 8, 12, or 16?" (needs_clarification=true). Never guess the count for flashcards.
- language: "no" when the request asks for Norwegian ("in Norwegian", "på norsk", "for school in Norwegian") OR is itself written in Norwegian; "en" when it explicitly asks for English; "" otherwise (the child's default applies). Materials for a Norwegian school/kindergarten are usually wanted in Norwegian — but only set "no" when the request actually signals it.

CLARIFYING QUESTION:
- Set needs_clarification=true with ONE short, warm question whenever the request lacks the CONCRETE ANCHOR the material needs. The most common gap is the SITUATION: a skill or goal named without a situation ("telling others what she needs", "asking for help", "communication practice") is NOT enough to generate from — ask which everyday situation to build it around, offering 2-3 examples ("snack time, getting dressed, or play?"). Other gaps: "a timetable" → which part of the day; "a board" → choosing between what.
- A generic material wastes the parent's print, laminating, and trust. When torn between guessing and asking, ASK.
- Never ask about things you decide yourself (grid size, colours, formatting, material type) or that the child's profile, goals, or the request already answer. The ONE exception is the flashcard card count above — that is always asked when not given. One question maximum, answerable in one sentence; if both the situation and the card count are missing, ask them together in one question.
- If the message includes CLARIFICATION ANSWERS (a previous question you asked, now answered), never ask again — decide with what you have.
- When needs_clarification=true, still fill every other field with your best guess.

Respond with a single JSON object matching the required schema.`

export const AAC_ROUTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['material_type', 'topic', 'goal_id', 'target_length', 'rows', 'cols', 'period', 'card_count', 'language', 'mentioned_items', 'needs_clarification', 'clarifying_question', 'reason'],
  properties: {
    material_type: {
      type: 'string',
      enum: ['comm_board', 'sentence_builder', 'visual_timetable', 'comprehension', 'number_cards', 'reward_chart', 'word_wall', 'matching_game', 'social_story', 'activity_pack', 'flashcard_set', 'sensory_card', 'role_play'],
    },
    topic: { type: 'string', description: "What the material is about, as the child's experience" },
    goal_id: { type: 'string', description: 'UUID of the best-matching active goal, or empty string' },
    target_length: { type: 'integer', description: 'sentence_builder: words per sentence; otherwise 0' },
    rows: { type: 'integer', description: 'comm_board: grid rows; otherwise 0' },
    cols: { type: 'integer', description: 'comm_board: grid columns; otherwise 0' },
    period: { type: 'string', description: 'visual_timetable: e.g. morning, school day; otherwise empty string' },
    card_count: { type: 'integer', description: 'flashcard_set: number of cards (8/12/16), from the parent or their clarification answer; otherwise 0' },
    language: { type: 'string', enum: ['no', 'en', ''], description: 'Requested output language, or empty for the child default' },
    mentioned_items: { type: 'array', items: { type: 'string' }, description: 'Every specific word/item/example the parent explicitly named; empty if none' },
    needs_clarification: { type: 'boolean', description: 'true only when one answer would materially change the material and no sensible default exists' },
    clarifying_question: { type: 'string', description: 'The one warm question to ask the parent, or empty string' },
    reason: { type: 'string', description: 'One sentence: why this type for this request' },
  },
}

// ──────────────────────────────────────────────────────────────
// Material generators — prompt builder + structured-output schema per type
// ──────────────────────────────────────────────────────────────

type Ctx = {
  topic: string
  goal: Record<string, unknown> | null
  child: Record<string, unknown>
  language: string
  targetLength?: number
  rows?: number
  cols?: number
  period?: string
  parentRequest?: string
  mentionedItems?: string[]
}

const childBlock = (c: Ctx) => `
CHILD CONTEXT:
Name: ${c.child.name}
Interests: ${((c.child.interests as string[]) || []).join(', ') || 'not specified'}
Language: ${c.language}${c.language === 'no' ? `

OUTPUT LANGUAGE — NORWEGIAN (BOKMÅL): every word on every card, every title, how_to_use, and tip is written in natural Norwegian at the child's level. concept keywords are also Norwegian ("eple", not "apple") — they search the Norwegian pictogram library.` : ''}
${c.goal ? `GOAL THIS SUPPORTS: ${JSON.stringify({ label: c.goal.label, area: c.goal.area, approach: c.goal.approach, target_criterion: c.goal.target_criterion })}` : 'GOAL: none linked — build from the topic and the child\'s world.'}
${c.parentRequest ? `
THE PARENT'S OWN REQUEST (verbatim — their specifics override your generic choices):
${c.parentRequest}
${c.mentionedItems?.length ? `HARD RULE: the parent explicitly named ${c.mentionedItems.map(i => `"${i}"`).join(', ')}. EVERY one of these MUST appear in the material — they are promises to the parent. Then add naturally related items to complete it well.` : ''}` : ''}
${CONCEPT_RULES}

${FITZGERALD}

Personalise genuinely — ${c.child.name}'s words, interests, world. Match their language level exactly (err one level DOWN).`

const WORD_CELL = {
  type: 'object',
  additionalProperties: false,
  required: ['word', 'concept', 'emoji', 'word_class', 'colour', 'symbol_description'],
  properties: {
    word: { type: 'string', description: "The word as shown on the card, in the child's language" },
    concept: { type: 'string', description: 'Lowercase dictionary-form searchable keyword' },
    emoji: { type: 'string', description: 'Exactly one widely-supported emoji' },
    word_class: { type: 'string', enum: ['person', 'action', 'describing', 'thing', 'social', 'question'] },
    colour: { type: 'string', description: 'Hex matching the Fitzgerald Key class exactly' },
    symbol_description: { type: 'string', description: 'One-line AAC symbol scene, or empty string' },
  },
}

export const AAC_TYPES: Record<string, { prompt: (c: Ctx) => string; schema: Record<string, unknown> }> = {
  comm_board: {
    prompt: (c) => `Create a communication board for ${c.child.name}: ${c.topic}.
Grid: ${c.rows || 3} rows × ${c.cols || 4} columns (${(c.rows || 3) * (c.cols || 4)} cells — fill exactly that many).

A communication board is a grid the child points at (or hands over) to communicate. Rules:
- Every cell earns its place: real choices the child would actually make, core words with high functional payoff (want, more, help, stop, finished), and the topic's key vocabulary. Motivation is the engine (PRT) — the child's genuine favourites go in.
- Items the parent explicitly named ALWAYS get a cell each — drop a core word before dropping a named item.
- Order cells for scanning: core/request words first (top-left), then choices, social words last.
- how_to_use: 2-3 sentences for the parent — where to put the board, how to model pointing (point yourself as you say the word — aided language stimulation), and to honour EVERY point immediately even if the child changes their mind.
${childBlock(c)}`,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'board_emoji', 'how_to_use', 'rows', 'cols', 'cells'],
      properties: {
        title: { type: 'string' },
        board_emoji: { type: 'string', description: 'One emoji for the board theme' },
        how_to_use: { type: 'string' },
        rows: { type: 'integer' },
        cols: { type: 'integer' },
        cells: { type: 'array', description: 'Exactly rows × cols cells, scan order', items: WORD_CELL },
      },
    },
  },

  sentence_builder: {
    prompt: (c) => `Create a progressive sentence builder for ${c.child.name}: ${c.topic}.
Sentence length: exactly ${c.targetLength || 3} words per sentence.

A sentence builder is a set of colour-coded word strips the parent prints and cuts apart; the child assembles them left-to-right into sentences. This is how children move from single words to phrases. Rules:
- 4-6 sentences, ALL exactly ${c.targetLength || 3} words, all reusing a small set of sentence frames ("I want X", "I see X", "X is big") so the child feels the pattern.
- Repetition with variation: keep the frame words constant, vary the final slot with words the child is motivated by (their real interests, real snacks, real people).
- Every word is a separate card with its Fitzgerald colour — the colour pattern (yellow-green-orange…) IS the visual scaffold for word order.
- frames: list the sentence frames used, e.g. ["I want X"].
- how_to_use: 2-3 sentences — cut along the lines, model assembling one sentence while saying it, then offer the child the final-slot words to choose; extension_tip: how to grow this to ${(c.targetLength || 3) + 1} words when the child is ready.
${childBlock(c)}`,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'theme_emoji', 'how_to_use', 'target_length', 'frames', 'sentences', 'extension_tip'],
      properties: {
        title: { type: 'string' },
        theme_emoji: { type: 'string' },
        how_to_use: { type: 'string' },
        target_length: { type: 'integer' },
        frames: { type: 'array', items: { type: 'string' } },
        sentences: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['words'],
            properties: { words: { type: 'array', items: WORD_CELL } },
          },
        },
        extension_tip: { type: 'string' },
      },
    },
  },

  visual_timetable: {
    prompt: (c) => `Create a visual timetable for ${c.child.name}: ${c.topic}.
Period: ${c.period || 'daily routine'}.

A visual timetable is a vertical strip of symbol cards showing what happens in order — it makes time predictable, which is regulation support, not decoration. Rules:
- 5-9 entries covering the real sequence of this period. Concrete activities only ("brush teeth", "car to school"), no abstractions.
- time_label: parent-facing time or marker ("7:00", "after lunch") — the child reads the symbols, not the times.
- Include at least one entry the child loves — the timetable must contain joy, not just demands.
- how_to_use: 2-3 sentences — mount at child height, point to the current activity as it starts, let ${c.child.name} move a peg/check off each finished item (finished = powerful), and never use the timetable to spring surprises.
${childBlock(c)}`,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'period', 'theme_emoji', 'how_to_use', 'entries'],
      properties: {
        title: { type: 'string' },
        period: { type: 'string' },
        theme_emoji: { type: 'string' },
        how_to_use: { type: 'string' },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['time_label', 'activity', 'concept', 'emoji', 'symbol_description'],
            properties: {
              time_label: { type: 'string' },
              activity: { type: 'string', description: 'Max 3 words, concrete' },
              concept: { type: 'string', description: 'Lowercase searchable keyword' },
              emoji: { type: 'string' },
              symbol_description: { type: 'string', description: 'One-line AAC symbol scene, or empty string' },
            },
          },
        },
      },
    },
  },
  comprehension: {
    prompt: (c) => `Create a symbol-supported comprehension sheet for ${c.child.name}: ${c.topic}.

A comprehension sheet is a very short story told with symbols, followed by picture-choice questions. Rules:
- story: 3-5 short sentences at the child's language level, each with a symbol concept for its key idea. Concrete, about ${c.child.name}'s real world.
- questions: 2-4, each with exactly 3 picture choices. ERRORLESS DESIGN: the correct choice must be a concept that visibly appeared in the story, so the child can find the answer by looking back — never a trick, never two plausible answers.
- Question language simpler than the story language. Start with "who/what/where" — never "why" unless the child is at sentence level.
- how_to_use: 2-3 sentences — read the story together pointing at each symbol, then ask each question and let ${c.child.name} point at a picture; if unsure, look back at the story together (that IS the skill).
${childBlock(c)}`,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'theme_emoji', 'how_to_use', 'story', 'questions'],
      properties: {
        title: { type: 'string' },
        theme_emoji: { type: 'string' },
        how_to_use: { type: 'string' },
        story: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['text', 'emoji', 'concept', 'symbol_description'],
            properties: {
              text: { type: 'string' },
              emoji: { type: 'string' },
              concept: { type: 'string', description: "The sentence's key idea as a lowercase searchable keyword" },
              symbol_description: { type: 'string', description: 'One-line AAC symbol scene, or empty string' },
            },
          },
        },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['question', 'choices', 'answer_idx'],
            properties: {
              question: { type: 'string' },
              choices: { type: 'array', description: 'Exactly 3', items: WORD_CELL },
              answer_idx: { type: 'integer', description: '0-based index of the correct choice' },
            },
          },
        },
      },
    },
  },

  number_cards: {
    prompt: (c) => `Create counting cards for ${c.child.name}: ${c.topic}.

Counting cards show a numeral next to that many repeated symbols ("3" + three apples) — quantity made visible. Rules:
- Pick ONE counted thing from ${c.child.name}'s genuine interests or the topic (thing_word + concept) — the SAME thing on every card, repeated count times. Consistency is the point.
- range: start at 1; end at 5 for early counters, 10 only if the goals show number work. Cards in order.
- number_word: the number word in the child's language ("three").
- how_to_use: 2-3 sentences — count aloud together touching each symbol once (one-to-one correspondence is the skill, not reciting), then say the numeral. Extension: "give me 3" games with real objects.
${childBlock(c)}`,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'theme_emoji', 'how_to_use', 'thing_word', 'concept', 'emoji', 'symbol_description', 'cards'],
      properties: {
        title: { type: 'string' },
        theme_emoji: { type: 'string' },
        how_to_use: { type: 'string' },
        thing_word: { type: 'string', description: 'The counted thing, singular' },
        concept: { type: 'string', description: 'Lowercase searchable keyword for the counted thing' },
        emoji: { type: 'string' },
        symbol_description: { type: 'string', description: 'One-line AAC symbol scene, or empty string' },
        cards: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['numeral', 'number_word'],
            properties: {
              numeral: { type: 'integer' },
              number_word: { type: 'string' },
            },
          },
        },
      },
    },
  },

  reward_chart: {
    prompt: (c) => `Create a reward chart for ${c.child.name}: ${c.topic}.

A reward chart is a token board: the child earns a token symbol for each success and trades the full board for a reward. Rules:
- goal_text: the ONE behaviour being rewarded, in plain positive parent words ("Arya uses her squeeze when upset") — observable, achievable several times a day, never "be good".
- steps: 5 tokens for young/new-to-charts children, 10 only for chart veterans.
- token: something the child loves as the earning symbol (their interest beats a generic star).
- reward: the actual reward THIS child works for, from their genuine interests — this is often personalised, so give it a rich symbol_description for generation.
- celebration_text: exactly what the parent says/does when the board fills.
- how_to_use: 2-3 sentences — token IMMEDIATELY after the behaviour with specific praise naming what they did; never remove earned tokens (earned = earned, always); when full, reward straight away.
${childBlock(c)}`,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'theme_emoji', 'how_to_use', 'goal_text', 'steps', 'token', 'reward', 'celebration_text'],
      properties: {
        title: { type: 'string' },
        theme_emoji: { type: 'string' },
        how_to_use: { type: 'string' },
        goal_text: { type: 'string' },
        steps: { type: 'integer' },
        token: {
          type: 'object',
          additionalProperties: false,
          required: ['word', 'concept', 'emoji', 'symbol_description'],
          properties: {
            word: { type: 'string' }, concept: { type: 'string' },
            emoji: { type: 'string' }, symbol_description: { type: 'string' },
          },
        },
        reward: {
          type: 'object',
          additionalProperties: false,
          required: ['word', 'concept', 'emoji', 'symbol_description'],
          properties: {
            word: { type: 'string' }, concept: { type: 'string' },
            emoji: { type: 'string' }, symbol_description: { type: 'string' },
          },
        },
        celebration_text: { type: 'string' },
      },
    },
  },

  word_wall: {
    prompt: (c) => `Create a word wall for ${c.child.name}: ${c.topic}.

A word wall is a themed vocabulary sheet the family mounts where the words get used (kitchen words in the kitchen). Words are grouped by Fitzgerald colour so the child absorbs word-class colour-coding. Rules:
- 8-14 words on the theme, spanning at least 3 word classes (things alone don't build sentences — include the actions and describing words that go WITH the things).
- Every word must be usable by ${c.child.name} this week: real vocabulary at their level, not aspirational.
- how_to_use: 2-3 sentences — mount at child height where the theme happens, point at words during the routine as you say them, and let ${c.child.name} point too. The wall is for USING, not testing.
${childBlock(c)}`,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'theme_emoji', 'how_to_use', 'theme', 'words'],
      properties: {
        title: { type: 'string' },
        theme_emoji: { type: 'string' },
        how_to_use: { type: 'string' },
        theme: { type: 'string' },
        words: { type: 'array', items: WORD_CELL },
      },
    },
  },

  matching_game: {
    prompt: (c) => `Create a matching game for ${c.child.name}: ${c.topic}.

A matching game is a set of cut-out card pairs. Progression (Emma's standard): picture↔picture first (find the two the same), picture↔word only when the child is reading-ready. Rules:
- mode: choose from the child's level — "picture_picture" unless their goals show letter/word recognition, then "picture_word".
- 6-8 pairs on the topic, drawn from ${c.child.name}'s genuine interests. Every pair a clearly distinct concept (never two that look alike — the child must succeed by looking).
- how_to_use: 2-3 sentences — start with 2-3 pairs face up ("find the same!"), grow to more pairs and face-down memory play as the child succeeds. Errorless first: hold out one card and let ${c.child.name} find its partner.
${childBlock(c)}`,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'theme_emoji', 'how_to_use', 'mode', 'pairs'],
      properties: {
        title: { type: 'string' },
        theme_emoji: { type: 'string' },
        how_to_use: { type: 'string' },
        mode: { type: 'string', enum: ['picture_picture', 'picture_word'] },
        pairs: { type: 'array', items: WORD_CELL },
      },
    },
  },
}

// Walk a generated material and collect every concept for resolve-symbols.
export function extractConcepts(materialType: string, content: Record<string, unknown>): { concept: string; symbol_description?: string }[] {
  const out: { concept: string; symbol_description?: string }[] = []
  const push = (c: Record<string, unknown>) => {
    const concept = String(c.concept || '').trim().toLowerCase()
    if (!concept) return
    const desc = String(c.symbol_description || '').trim()
    out.push(desc ? { concept, symbol_description: desc } : { concept })
  }
  if (materialType === 'comm_board') {
    for (const cell of (content.cells as Record<string, unknown>[]) || []) push(cell)
  } else if (materialType === 'sentence_builder') {
    for (const s of (content.sentences as { words?: Record<string, unknown>[] }[]) || [])
      for (const w of s.words || []) push(w)
  } else if (materialType === 'visual_timetable') {
    for (const e of (content.entries as Record<string, unknown>[]) || []) push(e)
  } else if (materialType === 'flashcard_set' || materialType === 'child_zone_cards') {
    for (const c of (content.cards as Record<string, unknown>[]) || []) push(c)
  } else if (materialType === 'comprehension') {
    for (const s of (content.story as Record<string, unknown>[]) || []) push(s)
    for (const q of (content.questions as { choices?: Record<string, unknown>[] }[]) || [])
      for (const ch of q.choices || []) push(ch)
  } else if (materialType === 'number_cards') {
    push(content)
  } else if (materialType === 'reward_chart') {
    if (content.token) push(content.token as Record<string, unknown>)
    if (content.reward) push(content.reward as Record<string, unknown>)
  } else if (materialType === 'word_wall') {
    for (const w of (content.words as Record<string, unknown>[]) || []) push(w)
  } else if (materialType === 'matching_game') {
    for (const p of (content.pairs as Record<string, unknown>[]) || []) push(p)
  }
  return out
}
