# AAC Studio — Design & Implementation Plan

*Designed 2026-07-16 (Fable 5) from Omar's requirement: replace his InPrint 3 / Widgit
workflow — "upon my prompt, corresponding AAC material is created." This document is the
durable context for the feature; read it fully before touching any AAC Studio code.*

---

## 1. Objective

Omar currently authors AAC materials by hand in InPrint 3 (Widgit): activities & games,
communication boards, comprehension sheets, flashcards, numbers, reward charts,
timetables, word cards, and progressive sentence construction (3 → 4 → 5-word
sentences). Those tools rest on two pillars NeuroNest must reproduce:

1. **A huge, style-consistent symbol library** (Widgit ≈ 20k symbols; commercial, not
   licensable for us).
2. **Templated material layouts** that arrange symbols + words into printable,
   classroom-ready pages.

The prompt-driven version: parent types what they need ("a 4-word sentence builder about
mealtimes", "a morning timetable for school days", "a choice board for snack time") →
Emma produces the correct material type, populated for THIS child, with real AAC symbols,
printable.

## 2. The symbol engine — hybrid sourcing (the key architectural decision)

**Primary: ARASAAC** (arasaac.org) — ~13,000 professionally drawn AAC pictograms, the
open-license clinical standard (used by real AAC apps worldwide). CC BY-NC-SA: free for
non-commercial use with attribution (attribution line goes on every print/export footer:
"Pictograms: ARASAAC (arasaac.org) — CC BY-NC-SA, Gov. of Aragón, author Sergio Palao").
- Search API: `GET https://api.arasaac.org/v1/pictograms/{lang}/search/{keyword}`
  (multilingual — `en`, `no`, and others; returns pictogram ids + keywords). Verified
  working 2026-07-16.
- Image: `https://static.arasaac.org/pictograms/{id}/{id}_300.png` (verified).
- MUST be fetched from the Supabase Edge Function (Vercel's network sandbox blocks all
  external domains — CLAUDE.md §6). Downloaded once, stored in our bucket, never
  hotlinked.

**Fallback: Imagen + vision QA** (the existing `generate-card-images` pipeline) for
concepts ARASAAC lacks — above all PERSONALIZED symbols ("Arya's classroom", a specific
toy, the family car). Same Widgit-style prompt + Haiku QA loop already in production.

**Concept-keyed symbol library** (`neuronest.aac_symbols` — needs a migration):
```
aac_symbols: id, concept (normalized keyword, e.g. 'apple'), language,
  source ('arasaac' | 'generated'), arasaac_id int null, storage_path,
  symbol_description text null, qa_passed bool, created_at
  unique (concept, language)
```
Resolution order for any concept: aac_symbols cache → ARASAAC search → Imagen+QA
generate → save to bucket + table. Symbols are generated ONCE per concept and reused
across every material forever (today's `story_images` caches per-content, which cannot
scale to thousands of cards). One new Edge Function `resolve-symbols` owns this:
input `{concepts: [{concept, language, symbol_description?}]}`, ACK + waitUntil, writes
aac_symbols, same x-cron-secret auth.

## 3. Material templates (the 9 types)

Every material is a `generated_content` row (existing table, existing library UI,
existing print route) with a typed JSON shape. Each cell/word references a concept; the
UI renders the resolved symbol image with the word beneath (emoji fallback until the
symbol lands). Fitzgerald colour-coding (already standard in the platform: people
#F59E0B, actions #16A34A, describing #5B7FE8, things #F97316, social #DB2777, questions
#7C3AED) applies wherever word class matters.

| # | content_type | Shape sketch | Notes |
|---|---|---|---|
| 1 | `comm_board` | title, rows×cols, cells: {word, concept, word_class, colour} | Choice boards, core boards. Grid sizes 2×2 → 5×4 |
| 2 | `sentence_builder` | target_length (3/4/5…), sentences: [{words: [{word, concept, word_class, colour}]}], cut_line hints | THE progressive type: colour-coded strips, print → cut → child assembles. Colour-coded by word class per modified Fitzgerald |
| 3 | `visual_timetable` | period ('morning'/'school day'/…), entries: [{time_label, activity, concept}] | Vertical strip, check-off circles |
| 4 | `flashcard_set` | EXISTS — upgrade to concept-keyed symbols | Already Fitzgerald-coloured |
| 5 | `comprehension` | scene_description/story sentences (symbol-supported), questions: [{q, choices: [{word, concept}], answer_idx}] | Errorless option: correct choice visually anchored in the scene |
| 6 | `number_cards` | range, per-number: {numeral, word, concept ('three apples' → count×symbol)} | Counting = N repeated symbols + numeral |
| 7 | `reward_chart` | goal_text, steps (5/10 tokens), token_concept ('star'/child's interest), reward_concept | The reward slot uses a PERSONALIZED symbol (generated) when the reward is child-specific |
| 8 | `word_wall` | theme, words: [{word, concept, word_class, colour}] | Vocabulary sheets grouped by class colour |
| 9 | `matching_game` | pairs: [{word, concept}], board layout | Picture↔picture first, picture↔word harder (per Emma's existing progression) |

## 4. Prompt-driven creation (the front door)

Materials tab gets ONE free-text box at the top: **"Describe what you need"** (mic-
friendly, one sentence). A router call (Emma, standard tier, structured output) maps the
prompt → {material_type, parameters, personalization} — same decide-then-generate
pattern as content anticipation. The parent never picks from 9 template names; Emma
does. The existing type-picker modal stays as the manual path. Recommendations
("Recommended for this week") gain AAC types once templates exist.

Sentence-construction is level-aware: Emma reads the communication profile (currently
single words → start 2-3 word strips) and the active goals ("Building from Words to
Phrases" goal drives which sentence frames matter: "I want X", "I need help", …).

## 5. Print

Existing `/content/print` route gains layouts per type: cards 2×4 per A4, boards
full-page, strips with cut lines, timetables as vertical strips. ARASAAC attribution
footer on every page. (PDF export = browser print-to-PDF, as today.)

## 6. Phasing (with the hard dependency called out)

**Phase A — DONE (2026-07-16):** prompt router (`AAC_ROUTER_PROMPT`) + 3 template
generators in `lib/agents/aacTemplates.ts`, served by `/api/aac-studio` (route also
handles schema-enforced revision and fires resolve-symbols server-side — it holds the
cron secret). "Describe what you need" box at the top of Materials; the 3 types are in
the manual picker, viewer (`app/content/aacViewers.tsx` — separate file so the fragile
page.tsx edits stayed surgical), and print route. Because Phase B landed the same day,
Phase A shipped concept-keyed from the start — the content-scoped interim never existed.
Verified end-to-end: "a 3-word sentence builder about snack time" → router picked
sentence_builder + linked the words-to-phrases goal → correct Fitzgerald colours → all
10 concepts resolved from ARASAAC.

**Phase B — DONE (2026-07-16, including tail):** `aac_symbols` migration (RLS:
authenticated read, service-role-only writes) + `resolve-symbols` Edge Function v2
deployed. Resolution: cache → ARASAAC (top-3 candidates ranked exact-keyword >
all-tokens-in-keyword > search order, each vision-QA'd for SEMANTIC match before
caching — keyword search alone returned a CAR WASH for "wash hands", and one wrong
cached symbol would poison every material) → Imagen+QA fallback (proven live: "squeeze
toy" had no ARASAAC match and generated a QA-passed Widgit-style pictogram). Tail done
same day: flashcard_set template + Child Zone cards now emit `concept` per card and
fire resolve-symbols (from /api/content and /api/child-zone-cards respectively — the
per-content generate-card-images pipeline is no longer called for new sets); flashcard
viewer/print and the Child Zone game render library symbols with emoji fallback.
story_images backfill was made unnecessary instead of executed: pre-upgrade Child Zone
sets keep reading their old per-index story_images until the goal set changes, at which
point regeneration produces concept-keyed cards.

**Phase C — DONE (2026-07-16):** all 5 remaining types live end-to-end (template +
schema + router entry + viewer + print in the same files as Phase A): comprehension
(symbol story + errorless picture-choice questions, answer key on print), number_cards
(numeral + count× repeated symbol of ONE interest-drawn thing), reward_chart
(interactive token board on screen; print has cut-out tokens + dashed circles; reward
symbol personalised via Imagen when needed), word_wall (grouped by Fitzgerald class),
matching_game (picture↔picture / picture↔word, two cut-out grids, second grid
reordered). /api/aac-studio also gained retry-with-backoff on transient Anthropic
429/5xx/529 (hit a real 529 during testing).

**Phase D — mostly DONE (2026-07-16):** batch printing (🖨️ select-mode in the library
header → tap materials → one print job, `?ids=a,b,c` on the print route, one material
per page via breakAfter); portrait/landscape toggle on the print toolbar (@page size);
"Recommended for this week" now suggests the area-matched AAC type per working goal
(communication → sentence strips, social → communication board, adaptive → visual
timetable, sensory/behaviour → reward chart) ahead of the generic pack/flashcards.
Board sizes need no extra UI — the router already honours sizes named in the prompt
("a 4x4 board..."). Remaining: Norwegian keyword search — deferred with the rest of
Norwegian support to product Phase 5 (CLAUDE.md §8); aac_symbols and resolve-symbols
are already language-keyed, so it is mostly prompt/UI work when it comes.

## 7. Explicitly out of scope (for now)

- Full freeform canvas editing à la InPrint (drag/drop layout) — prompt+template beats
  it for this user base; revisit only if field use demands.
- Commercial symbol sets (Widgit/PCS/SymbolStix) — licensing, not technology.
- If NeuroNest ever commercializes: ARASAAC's NC license requires revisiting. Researched
  2026-07-17 (Omar asked about OpenAAC): OpenAAC/OpenSymbols is an AGGREGATOR, not a
  license — ARASAAC stays CC BY-NC-SA inside it and Sclera is NC too; the only sizeable
  truly commercial-friendly classic set is Mulberry (~3,100 symbols, CC BY-SA). The
  architecture is already source-pluggable (aac_symbols.source + the resolve chain), so
  the commercialization paths are, in preference order: (1) negotiate ARASAAC commercial
  permission (Gov. of Aragón grants case-by-case), (2) swap chain to Mulberry-first +
  Imagen fallback (one code change; cache refills per concept in the background),
  (3) license Widgit/PCS. Imagen-generated symbols are wholly ours either way.
