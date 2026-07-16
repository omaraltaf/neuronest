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

**Phase A — needs nothing (Vercel-only):** prompt router + first 3 template generators
(comm_board, sentence_builder, visual_timetable) writing generated_content JSON; library
cards + viewer + print layouts; symbols resolved per-content via the EXISTING
generate-card-images pipeline (content-scoped cache) so it works end-to-end immediately.

**Phase B — needs Supabase connector (BLOCKED until it reconnects):** `aac_symbols`
migration + `resolve-symbols` Edge Function with ARASAAC-first sourcing; switch all
material types (incl. flashcards + Child Zone cards) to concept-keyed symbols; backfill
existing story_images card symbols into the library.

**Phase C:** remaining types (comprehension, number_cards, reward_chart, word_wall,
matching_game) — mechanical once A+B exist.

**Phase D:** polish — board size options, orientation, Norwegian keyword search (ARASAAC
is multilingual; NO symbols come free), batch printing.

## 7. Explicitly out of scope (for now)

- Full freeform canvas editing à la InPrint (drag/drop layout) — prompt+template beats
  it for this user base; revisit only if field use demands.
- Commercial symbol sets (Widgit/PCS/SymbolStix) — licensing, not technology.
- If NeuroNest ever commercializes: ARASAAC's NC license requires revisiting (license
  Widgit at that point, or negotiate ARASAAC commercial terms).
