# NeuroNest — Project Context for Claude Code

**Read this entire file before making any changes.** This is the single source of truth for where the project stands, what it's for, and where it's going.

---

## 1. What NeuroNest Is

NeuroNest is an AI-powered support platform for parents of children with Autism Spectrum Disorder (ASD). It is currently a **reactive tool** — parents log in, browse, generate content on demand. The next phase must transform it into a **proactive family member**: an AI that actively drives the child's developmental progress, not one that waits to be used.

**The person building this (Omar) wants NeuroNest to eventually be capable of replacing much of the day-to-day coordination burden a family currently carries alone** — tracking progress, deciding what to work on next, generating the right material at the right time, noticing when something isn't working, and celebrating real wins. It is not meant to replace clinicians, but to be the thing that sits between clinical appointments and daily life, doing what a dedicated in-home support worker would do if the family could afford one full-time.

Live at: **neuronest-nine.vercel.app** (note: NOT neuronest.vercel.app — that's a different, stale deployment)
GitHub: `github.com/omaraltaf/neuronest`
Supabase project: `kutseusvdlkhflskezde` (schema: `neuronest`)

---

## 2. Clinical Grounding — Read This Before Touching Agent Prompts

Every agent prompt, every piece of generated content, every plan structure should be traceable to evidence-based practice. Do not invent therapeutic approaches. The current evidence base (as of 2025-2026 research) that NeuroNest should be built on:

**Naturalistic Developmental Behavioral Interventions (NDBIs)** are the current gold standard for early ASD intervention — this is what the whole platform should be modeled on. Key facts:
- NDBIs blend behavioral strategies (ABA-derived) with developmental science, delivered in natural play/daily-routine contexts rather than clinical drill settings
- Major NDBI programs: **ESDM** (Early Start Denver Model — socio-emotional, cognitive, language), **PRT** (Pivotal Response Training — motivation, self-management, response to cues), **JASPER** (Joint Attention, Symbolic Play, Engagement, Regulation)
- NDBIs are effective at **lower intensity** (10-15 hrs/week) specifically because they are **parent-mediated** — this is the core justification for a parent-facing platform like NeuroNest rather than a clinician-only tool
- Parent-mediated NDBI fidelity directly predicts child outcomes (caregivers who use strategies more consistently produce better child social-communication gains) — this means **coaching the parent's technique**, not just assigning activities, is a first-class goal for the platform
- **AAC (Augmentative and Alternative Communication)** combined with NDBI meaningfully supports language development in minimally-speaking children — the Child Zone and flashcard/AAC-style content generation should reflect real AAC symbol conventions (Boardmaker/Widgit/PCS style: flat colour, bold outline, single clear action, no visual clutter), which is also why these render better through image generation than photorealistic attempts
- **Social Stories (Carol Gray method)**: first-person, present-tense, descriptive/perspective sentences outnumber directive sentences ~2:1, always positively framed (what TO do)

**Implication for the codebase:** every specialist agent (Dr. Sarah Chen/intake, Dr. Okafor/priorities, Dr. Santos/planning, Dr. Eriksson/check-ins, Emma Blackwell/content) should have prompts that explicitly reference NDBI principles, parent-coaching (not just parent-informing), and naturalistic/play-based framing over clinical drill framing. If you are asked to improve agent prompts, ground them in this section.

---

## 3. Current Architecture

**Stack:** Next.js 14 (App Router), TypeScript, Tailwind, Supabase (Postgres + Auth + Storage + Edge Functions), Anthropic Claude API (server-side agents), Vercel (hosting).

**Key credentials (also in `.env.local`, not committed):**
- Supabase URL: `https://kutseusvdlkhflskezde.supabase.co`
- Supabase anon key: in `.env.local`
- Anthropic API key: in Vercel env as `ANTHROPIC_API_KEY`
- Gemini API key (Imagen 4, for image generation): `GEMINI_API_KEY` — set as a Supabase Edge Function secret, NOT usable from Vercel (see §6)
- GitHub PAT: available in `.env.local` history if needed for git operations

**File structure:**
```
app/
  api/                     — all agent + utility API routes (Next.js route handlers)
    intake/                — Dr. Sarah Chen intake interview agent
    profile/, profile-chat/— profile review + section chats
    planning/              — Dr. Santos plan generation agent
    checkin/               — Dr. Eriksson weekly check-in agent
    content/               — Emma Blackwell content generation (social stories, activities, flashcards, sensory cards, role-play)
    ai-chat/               — general Q&A agent with child context
    notifications/         — auto-generates in-app notifications
    report/                — data aggregation for progress reports
  onboarding/              — child-setup → upload → intake → profile-review → plan
  dashboard/               — main hub, DashboardClient.tsx
  goals/, progress/, checkin/, ai/, child-zone/, content/, report/, documents/
lib/
  agents/prompts.ts        — ALL agent system prompts live here
  agents/caller.ts
  supabase/client.ts, server.ts
middleware.ts              — auth gate; /api/ routes are EXCLUDED from middleware entirely (see §6 for why)
```

**Database (schema `neuronest`):** children, intake_sessions, child_profiles, plans, goals, app_state, documents, weekly_checkins, generated_content, session_logs, agent_state, notifications, story_images, milestones, weekly_focus, goal_proposals.

**Current test data:** Child "Arya" (id `34ba727c-e1bf-449a-8b8b-cbaa179de6d4`), full onboarding complete, plan active, Week 1 check-in complete.

---

## 4. What's Built (Phases 1-3, all complete)

**Phase 1 — Onboarding:** Auth → child setup → document upload (base64 extraction) → intake interview → profile review (section-by-section chat with enrichment) → plan generation. All agent chats persist to `agent_state` after every message so nothing is ever lost on refresh.

**Phase 2 — Active programme:** Goals (status tracking, session logging with 1-5 ratings), Progress (heatmap, streaks), Weekly check-ins (history view + chat view, Dr. Eriksson), AI Chat (contextual Q&A), Child Zone (fully visual, no-reading-required flashcard games with emoji-only cards, word hidden until tap, celebration bursts, songs).

**Phase 3 — Notifications, content, reports:** Auto-generated notifications (check-in due, goal achieved, streaks, no-sessions-this-week). Content Library — Emma Blackwell generates Social Stories, Activity Packs, Flashcard Sets, Sensory Cards, Role-Play Scripts, all visual-first with a feedback/revision loop (parent can say "make it shorter" / "use dinosaurs instead" and the piece regenerates). Print/export views for all content types. Delete with confirmation.

**Image generation (working, but fragile — read §6 before touching):** Social stories generate AAC/communication-card-style illustrations (flat cartoon, bold outline, white background, single clear action per sentence — explicitly NOT photorealistic, NOT depicting real children, due to Imagen safety filters) via a Supabase Edge Function (`generate-story-images`) that calls Gemini Imagen 4. Images are cached permanently in Supabase Storage (`neuronest-documents` bucket) and the `story_images` table, keyed by `content_id + sentence_index`. There's a manual "🖼️ Generate images" / "🔄 Regenerate" button pair in the content viewer.

---

## 5. Phase 4 Vision — The Actual Goal (Read Carefully)

This is what Omar actually wants built next. **Do not treat this as a reporting/CRUD app anymore.** The mental model: NeuroNest should behave like a dedicated, tireless in-home aide whose full-time job is Arya's (and any future child's) developmental progress — one who plans ahead, notices patterns, escalates when something's working, and never lets things go stale.

### 5.1 Weekly Planning Agent (proactive, scheduled)
A Supabase cron job (pg_cron is available in this project) that runs every Monday morning per active child:
- Pulls last 7-14 days: session_logs, goal statuses, last check-in wins/challenges/recommendations, notification engagement
- Uses the **best available reasoning model** (Fable 5 while available; fall back to Opus/Sonnet after) to synthesize a genuinely tailored weekly focus — not a generic template
- Should reason like an NDBI-trained coach: what pivotal behaviors to target, what naturalistic opportunities in the family's actual week to embed practice into (if we don't have calendar data, ask the parent for it — a lightweight "what's this week look like?" prompt is worth adding)
- Writes output to a new `weekly_focus` table and fires a notification: "This week: focus on X because Y. Here's a 5-minute activity to start with."

### 5.2 Goal Progression Engine (event-driven)
When a goal's `status` changes to `achieved` in the `goals` table (Postgres trigger or Edge Function), automatically:
- Reasons about what the natural **next-level goal** is (this requires real clinical judgement — e.g., if "requests preferred item using single word" is achieved, the next level per ESDM/PRT logic is something like "requests using 2-word phrase" or "requests from non-preferred adult," not an arbitrary next thing)
- Drafts the next goal, presents it to the parent for one-tap approval rather than making them go through the full planning chat again
- Optionally: auto-generates the first piece of content (activity pack) for the new goal so the family never has a "goal achieved, now what?" gap

### 5.3 Proactive Content Anticipation
Instead of only generating content when a parent explicitly asks:
- If a goal has had zero content generated for it in >7 days while active, surface a notification suggesting content
- If the weekly focus (5.1) identifies a specific naturalistic opportunity (e.g., "grocery store trip planned this week" if calendar/context is available), proactively generate a relevant social story or activity pack ahead of time, not after the fact
- Content generation should increasingly be **push, not pull**

### 5.4 Parent Coaching Loop (fidelity-focused, per NDBI research in §2)
Since parent implementation fidelity is the single strongest predictor of child outcomes in the literature:
- After a parent logs a session with a low rating (1-2), the response shouldn't just save the log — it should ask one specific follow-up question and give one specific technique adjustment, framed warmly, in the moment
- Over time, track patterns (e.g., "sessions rated low tend to happen in the evening" or "struggling specifically with generalization to non-preferred people") and surface these as insights, not just raw data

### 5.5 Child Zone should reflect active goals
Currently the Child Zone flashcard sets (animals, food, shapes, feelings, actions) are static generic sets. They should instead be **generated from the child's actual active goals and vocabulary targets** — if a goal targets specific words, those should appear in the Child Zone games, not a generic "cat/dog/bird" set. This closes the loop between what the parent is working on and what the child is practicing in the fun, gamified space.

### 5.6 Momentum & Celebration Layer
Notifications currently exist for streaks and achievements, but the framing should be warmer and more specific — not "3-day streak!" generically, but tied to what was actually practiced. This matters more than it sounds for parent motivation/retention, which is itself an NDBI fidelity factor per §2.

---

## 6. Known Issues / Technical Debt — Read Before Debugging

**Image generation is fragile — do not casually "fix" it without reading this:**
- Vercel's network sandbox in this environment blocks essentially every external API domain except `api.anthropic.com`. Gemini, Hugging Face, Unsplash, Pollinations — all blocked from Vercel server functions and from this build sandbox. This is NOT a code bug; it's an environment restriction that took an extremely long debugging session to identify. Do not re-attempt calling external image APIs directly from `/app/api/*` routes on Vercel.
- The working solution: a **Supabase Edge Function** (`generate-story-images`) calls Gemini Imagen 4 from Supabase's servers, which have unrestricted network access. The source of truth is `supabase/functions/generate-story-images/index.ts` in this repo; the deployed function matches it as of 2026-07-02 (deployment v22). It is NOT auto-deployed from git — after editing the file, redeploy manually (Supabase MCP `deploy_edge_function` or `supabase functions deploy generate-story-images`) and keep `verify_jwt: false` (the client calls it without a JWT).
- Imagen 4 requires **postpay Google Cloud billing** linked to the project — prepay AI Studio credits do NOT unlock it, this cost hours to discover. The account is now correctly configured.
- Imagen 4's safety filters aggressively block prompts mentioning children/minors even in completely benign contexts (this is `personGeneration` policy, not a bug). The working approach: describe **AAC-symbol-style scenes** (objects, symbols, simple cartoon figures performing an action) rather than depicting a specific child — see the current `buildPrompt` function in the Edge Function for the exact working prompt pattern. Do not revert to photorealistic prompts mentioning "child" — it will silently return `{}` (200 status, empty body) rather than an error, which is maximally confusing if you don't know to expect it.
- Two more Imagen failure modes (discovered 2026-07-05 while building card symbols): (1) **attribute-list prompts** ("One concept only, centred, flat colours, no text…") can make Imagen render a garbled DESIGN SPEC SHEET as the image — write prompts as natural scene-first descriptions instead (see `buildAacPrompt` in `generate-card-images`); (2) scenes involving **physical contact between human figures** ("two figures hugging") can come back as a PHOTOREALISTIC PHOTO of a person instead of a pictogram — use object/animal stand-ins for contact concepts (teddy bear hugging a heart). Both failures return 200 with a valid image, so they're invisible without spot-checking generated output.
- Vercel's **Deployment Protection** (Vercel Authentication) was found to be silently blocking direct API route requests from any client without a Vercel session cookie — this caused hours of "the function exists but 404s" confusion. It's now set to off / standard protection. If image generation mysteriously breaks again, check this setting first.
- The production domain is `neuronest-nine.vercel.app`, NOT `neuronest.vercel.app` — an old/different deployment exists at the latter and caused significant confusion. Always verify which URL you're testing against.
- **Supabase Auth "Site URL" pointed at the STALE domain too** (found 2026-07-17 when the first guardian invite email delivered a perfectly valid session to the dead app): every auth email link (invite, recovery, signup confirmation) redirects to Site URL unless the requested redirect_to is allowlisted. Fix lives in Supabase Dashboard → Authentication → URL Configuration (Site URL `https://neuronest-nine.vercel.app`, Redirect URLs `https://neuronest-nine.vercel.app/**`) — FIXED by Omar 2026-07-17 (confirmed); if auth links ever misbehave again, verify this FIRST. Interim rescue used: set the invitee's password directly (`update auth.users set encrypted_password = extensions.crypt(..., gen_salt('bf', 10))`) so they can sign in without any link.

**Middleware:** `/api/*` routes are fully excluded from the auth middleware matcher (`matcher: ['/((?!api/|_next/static|...).*)"]`). This was necessary because the auth-check-then-redirect logic was redirecting unauthenticated image requests (e.g. `<img src="/api/images">`, which sends no auth cookie) to `/login`, which Vercel then serves as a 404 for what should be an image response. If you add new API routes that need to work from `<img>` tags or other credential-less contexts, they're already covered by this exclusion — don't add per-route workarounds.

**Model selection is centralized and retirement-proof (2026-07-06).** `lib/agents/models.ts` is the ONLY place model preferences live for Vercel code — never hardcode a model id at a call site. Three tiers: `fast` (Haiku — image QA, classification), `standard` (Sonnet — all chat agents, content, coaching, extraction; these send `thinking: {type: 'disabled'}` so the tier must never contain Fable-class models), `deep` (reserved). The resolver validates preferences against Anthropic's live Models API (1h cache) so retired models are skipped automatically; env overrides: FAST_MODEL/STANDARD_MODEL/DEEP_MODEL plus per-agent ones. The Edge Functions (`weekly-focus`, `goal-progression`) carry their own 404-fallback chain Fable→Opus→Sonnet (`createWithModelFallback`). Background: on 2026-07-05 every conversational agent was found broken in production because a hardcoded `claude-sonnet-4-20250514` had been retired (404) with no alert. Adopting a NEW model stays deliberate: add it to the top of the tier list after a prompt sanity pass.

**Content page file integrity:** `app/content/page.tsx` is large (900+ lines) and has been accidentally corrupted twice during this project by imprecise find-and-replace operations (header imports got dropped, function boundaries got mismatched). If editing this file, view it fully first and make surgical, verified edits — don't do broad regex replacements across the whole file.

---

## 7. Immediate Next Steps (in priority order)

1. ~~**Add `supabase/functions/generate-story-images/index.ts` to the git repo**~~ — DONE (2026-07-02): source committed, deployed function redeployed from the repo copy (v22, verified with a smoke test), so repo and deployment are in sync.
2. ~~**Build the Weekly Planning Agent (§5.1)**~~ — DONE (2026-07-02). Architecture: pg_cron job `weekly-focus-monday` (Mondays 06:00 UTC) → pg_net → Supabase Edge Function `weekly-focus` (source of truth: `supabase/functions/weekly-focus/index.ts`, manual redeploy like generate-story-images) → Claude Fable 5 with structured JSON output + server-side Opus fallback (override model via `WEEKLY_FOCUS_MODEL` Edge Function env var; the prompt is written model-agnostic for the eventual Sonnet handoff) → writes `weekly_focus` table + fires a `weekly_focus` notification. Auth between callers and the function is the `x-cron-secret` header; the secret and the `ANTHROPIC_API_KEY` live in Supabase Vault, readable only via the service-role-locked `neuronest.get_secret()` RPC. App surface: `/api/weekly-focus` (GET current focus, POST manual trigger — needs `WEEKLY_FOCUS_CRON_SECRET` in Vercel env, already set) and a WeeklyFocusCard on the dashboard. The prompt asks the parent a "week ahead" question each week (§5.1's lightweight calendar ask) — capturing the ANSWER back into planning context is still to be built.
3. ~~**Build the Goal Progression Engine (§5.2)**~~ — DONE (2026-07-04). Architecture: Postgres trigger `goal_achieved_progression` on `neuronest.goals` (fires on any transition into `achieved`, SECURITY DEFINER so it can read Vault + use pg_net) → async pg_net POST → Edge Function `goal-progression` (source: `supabase/functions/goal-progression/index.ts`, same conventions as weekly-focus: manual redeploy, `x-cron-secret` auth reusing WEEKLY_FOCUS_CRON_SECRET as the shared internal secret, Fable 5 + Opus fallback, `GOAL_PROGRESSION_MODEL` env override) → drafts the next goal via explicit ESDM/PRT progression logic (extend the mastered skill along exactly ONE axis: complexity, generalisation, or independence) → writes `goal_proposals` (one per source goal, service-role insert only) + `goal_proposal` notification. Parent one-tap surface: `/api/goal-proposals` (GET pending, POST approve/dismiss; approve inserts the drafted goal directly — proposal fields mirror the goals table) and a GoalProposalCard at the top of the goals page. Verified end-to-end against Arya's data (synthetic achievement, then cleaned up). Not yet built: §5.2's optional auto-generated first activity pack for the approved goal — currently the parent generates content for it via the existing Content Library.
4. ~~**Wire Child Zone to active goals (§5.5)**~~ — DONE (2026-07-04). A "My Words" set (personalised label, shown first in the Child Zone game grid) is generated by Emma Blackwell (`CHILD_ZONE_CARDS_PROMPT` in `lib/agents/prompts.ts`) from the child's active goals — regulation words, request words, social scripts, choice/classroom vocabulary at the child's exact language level. Runs in `/api/child-zone-cards` on Vercel (only calls api.anthropic.com — allowed), model `claude-opus-4-8` (override: `CHILD_ZONE_MODEL` env var). Cached in `generated_content` (content_type `child_zone_cards`, one active row per child — excluded from the Content Library query) and auto-regenerates when the active goal set changes (hash of goal ids + statuses). Generic sets remain as fallback; the Child Zone never breaks if generation fails.
5. **Proactive content anticipation (§5.3)** — DONE (2026-07-04). Push, not pull, two ways: (a) a `content_gap` notification when an in-progress/emerging goal has no fresh material in 7+ days — deliberately capped at ONE goal per week so the inbox never piles up; (b) when the parent answers the weekly focus's week-ahead question (inline input on the dashboard card → PATCH `/api/weekly-focus`), Emma decides via `CONTENT_ANTICIPATION_PROMPT` whether it names a concrete upcoming event (strict bar: vague answers generate nothing) and if so generates a social story or activity pack AHEAD of the event, straight into the Content Library using the shared templates in `lib/agents/contentTemplates.ts` (extracted from the content route — the JSON shapes must stay in sync with what `app/content/page.tsx` renders). The answer is stored in `focus_data.week_ahead_answer` (RLS update policy added) and next Monday's weekly-focus run reads it from previous focuses (Edge Function v3).
6. **Momentum & celebration layer (§5.6)** — DONE (2026-07-04). All auto-notifications rewritten to be specific to what the family actually did: streaks name what was practised, the no-sessions nudge points at this week's focus starter, goal-achieved names the child and hands off to the Progression Engine's next-step notification, check-in framing is reflective not administrative.
7. **Parent coaching loop (§5.4)** — BUILT (2026-07-04), refinement ongoing. In-the-moment: a session logged with rating 1-2 triggers `/api/coaching` (Dr. Eriksson via `SESSION_COACH_PROMPT` in `lib/agents/prompts.ts`, model `claude-opus-4-8`, override `SESSION_COACH_MODEL`) → modal on the goals page with one empathy line, one diagnostic follow-up question (implementation vs strategy barrier), one technique adjustment, and a named cross-session pattern when one genuinely exists. The parent's answer is appended to the session log's notes as `[Dr. Eriksson asked] … / [Parent] …`, where the check-in and weekly-planning agents read it. Pattern surfacing: the weekly-focus agent (Edge Function v2) now emits `pattern_insight` (shown on the dashboard focus card). Ongoing: keep refining these prompts as real usage data accumulates.

**UX simplification: DONE (2026-07-05, Round 2 consolidation 2026-07-06).** The evaluation and both rounds live in `UX_PLAN.md`. Final IA: **four tabs** — Today / Plan / Materials / Ask (`components/TabBar.tsx`; Child Zone launches from Today). Today = hero focus card leading with the ACTION (Today's 5 minutes → log → coaching via `components/PracticeLogger.tsx`), one contextual banner, week-ahead question surfaced until answered. Plan (route `/goals`) = staged journey (Working on now 1-2 / Up next / achieved trophies) with per-goal materials deep links (`/content?goal=`) and the History & records block (check-in summary, recent practice, report + documents). `/progress` is a redirect to Plan — Progress was removed as a tab; don't reintroduce analyst UI (heatmaps/stat grids). Every piece of data renders in exactly ONE place; parent-words + persona role tags + ≥44px targets throughout.

**Card generation follows AAC standards (2026-07-05):** colours are the modified Fitzgerald Key by word class (people yellow #F59E0B, actions green #16A34A, describing blue #5B7FE8, things orange #F97316, social pink #DB2777, questions purple #7C3AED) — enforced in `CHILD_ZONE_CARDS_PROMPT` and the flashcard template — and cards get real Widgit/Boardmaker-style symbol images via the `generate-card-images` Edge Function (same Imagen pipeline + `story_images` cache as stories, instant ACK + waitUntil background work, emoji fallback in the UI). Since v3 every candidate image is vision-QA'd by the fast tier (single concept, not photorealistic, no text/diagram) before being saved — the Imagen failure modes in §6 are auto-caught now, manual spot-checks no longer required.

**Guided mode (2026-07-06, from first field feedback "I'm still lost"):** goals are a staged journey — "Working on now" (1-2 goals), "Up next" queue, collapsed achieved; a Start-here card (Dr. Santos suggests this week's focus goals, one tap to start) solves the cold start; Materials opens with "Recommended for this week" one-tap generations for the currently-worked goals (blank-canvas Generate is secondary); Today shows a 3-step how-this-works card until 3+ sessions are logged. Working on FEW goals at a time is the clinically correct NDBI model, not a simplification compromise — keep this shape.

**Also built 2026-07-06:** goal approval now auto-generates the new goal's first activity pack (client-triggered from GoalProposalCard, content_gap nudge as backstop — closes §5.2's optional gap); multi-child support (dashboard honors `?child=`, header switcher when >1 child + "Add a child", TabBar carries child id on every tab); onboarding text-size/persona-role-tag pass. First fully autonomous Monday cron run succeeded 2026-07-06 06:01 UTC on weekly-focus v4.

**Pending Supabase work from 2026-07-13→16: ALL CLEARED (2026-07-16).** weekly-focus v5 deployed from the repo copy; the current week's focus was indeed violating the working-on-now rule (one of its two goals was not_started), force-regenerated on v5 — the new focus targets a single in_progress goal, served by Fable 5.

**AAC Studio (Phases A + B + C LIVE, 2026-07-16):** replaces Omar's InPrint 3/Widgit workflow — prompt-driven AAC material creation. Full design + phase status in `AAC_STUDIO_PLAN.md` — READ IT before touching AAC code. What's live: `aac_symbols` table (per-CONCEPT symbol cache, unique concept+language, authenticated read / service-role-only writes) + `resolve-symbols` Edge Function v2 (ARASAAC-first — plain keyword search returned a CAR WASH pictogram for "wash hands", so the top 3 ranked candidates are each vision-QA'd for semantic match before caching; Imagen+QA fallback for personalized concepts, proven live with "squeeze toy"; same conventions as the other Edge Functions: manual redeploy, x-cron-secret auth). App surface: "Describe what you need" free-text box at the top of Materials (textarea; Emma may hand ONE clarifying question back; parent examples are extracted as mentioned_items and MUST all appear; Edit-request button in the viewer) → `/api/aac-studio` (routes free text to a material type, generates with structured output from `lib/agents/aacTemplates.ts`, fires resolve-symbols server-side — the browser never sees the cron secret; retries transient Anthropic 429/5xx/529) → EIGHT AAC content types: `comm_board`, `sentence_builder`, `visual_timetable`, `comprehension`, `number_cards`, `reward_chart`, `word_wall`, `matching_game`, all with viewers + print layouts in `app/content/aacViewers.tsx` (kept OUT of page.tsx deliberately, per the file-integrity warning above; ARASAAC attribution footer renders whenever ARASAAC symbols appear). Flashcards + Child Zone cards are concept-keyed too (generate-card-images is no longer called for new sets; pre-upgrade Child Zone sets fall back to their old story_images until the goal set changes and they regenerate). All verified end-to-end against Arya's data. Remaining: Phase D polish (board sizes/orientation, Norwegian symbol search — the schema is already language-keyed, batch printing).

**Account, About-the-child, and guardian sharing (2026-07-16, from Omar's gap list):** (1) `/account` — email, member-since, change password (reset email), sign out, children list (owned + "shared with you"), family sharing (invite by email); reached via the ⚙️ in the dashboard header (which replaced the old Sign out button). (2) `/child?child=` — "About [name]": editable details (name/dob/diagnosis/school/teacher/interests — interests feed every material's personalisation), Dr. Okafor's confirmed profile as per-domain accordions (generic JSON renderer), gathered documents, quick links; linked from Account and the Plan tab's records block. (3) **Guardian sharing**: `neuronest.child_guardians` (invite by email, child_name denormalized for the invitee's pending view, unique child+email) + `neuronest.has_child_access()` SECURITY DEFINER helper + ADDITIVE RLS policies on all 18 child-scoped tables (permissive OR with existing owner policies — nothing about single-parent access was touched); invitee accepts from their own Account page; dashboard children query now relies on RLS instead of filtering user_id so shared children appear. **Invitation emails are real (2026-07-17):** the `invite-guardian` Edge Function sends Supabase's invite email via `auth.admin.inviteUserByEmail` (creates the account; link lands on `/auth/callback?next=/account`; 422 already-registered is reported as existing:true), called through `/api/invite-guardian` (verifies the caller owns the pending invite). Account page sends on invite + "Send email" button on pending rows; dashboard routes childless users with a pending invite to `/account` (NOT create-a-child onboarding); login forwards already-established sessions into the app. Notifications are family-shared per child (guardians see the same inbox), Edge Function notifications still address the owner.

**Family calendar context — DONE (2026-07-16, roadmap #1; agent wiring completed 2026-07-17):** `neuronest.family_events` (kind 'event' with date / 'rhythm' with plain-words recurrence, `has_child_access` RLS so guardians share it). Fills two ways: (a) every week-ahead answer runs through `CALENDAR_EXTRACTION_PROMPT` (strict: only stated facts, relative dates resolved against today, vague answers → nothing, existing entries not duplicated) in `/api/weekly-focus` PATCH; (b) parent adds/removes directly in the "Family calendar" card on `/child`. Consumed by EVERY agent: weekly-focus v6 (FAMILY CALENDAR context block — upcoming events → embeds/preparation, just-past → follow-up, rhythms → recurring practice slots; stale events auto-deactivate each run), Dr. Eriksson's check-ins (`/api/checkin` now takes childId and injects the calendar — asks how named events went), the coaching loop (`/api/coaching` + SESSION_COACH_PROMPT pattern check cross-references rhythms — "hard sessions land on swimming days"), the Ask tab (calendar in chat context), and notifications (`event_prep`: an event within 5 days gets ONE nudge ever, marker-tracked like goal_achieved, pointing the parent at the Materials front door to prepare a story ahead of it).

**REMAINING ROADMAP (Omar, 2026-07-16 — build all of these):**
2. **Norwegian (product Phase 5)** — UI copy, agent output, and ARASAAC symbol search in Norwegian (`aac_symbols`/resolve-symbols are already language-keyed).
3. **AAC prompt refinement from field use** — router + templates have seen only a handful of real requests; expect more catches like the type-override/filler-cards/count fixes of 2026-07-16.
4. **ARASAAC licensing** — CC BY-NC-SA is fine for personal use; commercializing requires Widgit licensing or ARASAAC commercial terms.
5. **Freeform canvas editing** (InPrint-style) — only if field use demands it.

**On model selection going forward:** design the agent prompts and system architecture now, while Fable 5 is available, to be as good as possible — but write them to be model-agnostic (clear structured instructions, explicit reasoning steps spelled out rather than relying on implicit frontier-model judgement) so that Sonnet-tier models can execute them reliably day-to-day after Fable 5 access reverts to paid-only. The planning/goal-progression *prompt design* should get Fable 5's attention; the routine *execution* of those prompts can run on Sonnet.

---

## 8. Style/Product Principles (don't drift from these)

**Visual identity: Direction B — "Fjord & Marigold" (chosen by Omar 2026-07-17; two-direction pitch in the design-review artifact).** The tokens live in `tailwind.config.js` as a REMAP of standard Tailwind names, so existing classes render the new palette — never reintroduce stock Tailwind hues at call sites. The system: fjord deep green `#21564C` is the primary/identity colour (remapped over violet/indigo); warm sand `#F2EEE6` is the page ground and warm white `#FFFEFA` the card surface (remapped over gray-50/white); **marigold `#F6C453` with dark ink `#3D3007` is the ONLY action colour** — every primary CTA is `bg-marigold-400 text-marigold-ink`, never white-on-colour; clay `#E2704A` is reserved for child-facing warmth (remapped over orange); leaf greens are success (remapped over emerald); text is pine ink `#23312E` and warm grays (remapped over gray). Type is **Nunito** (next/font, `--font-nunito`), one rounded family at many weights — friendly at 800-900, legible at 400; base scale lifted via `html { font-size: 106.25% }`. Icons on parent surfaces are **Lucide strokes** — emoji are ONLY for the Child Zone and child-facing/generated content, never parent-app iconography. Do NOT remap: red (errors) and the inline-hex Fitzgerald Key colours on AAC materials (clinical standard). Child Zone deliberately stays loud and playful — its contrast with the calm parent app is a feature. Pass 1 (tokens/font/icons/CTAs) done 2026-07-17; Pass 2 = per-screen component sweep incl. child-zone inline hex gradients, TYPE_COLORS harmonisation, chat surfaces; Pass 3 = wordmark, illustration, night mode.

- **Visual-first, always.** This user base includes non-readers and children who are visual learners. Every piece of content, every UI screen, defaults to visual before textual.
- **No photorealistic depictions of children** in generated content (safety filter reality, and arguably good practice regardless).
- **Parent-mediated framing**, never clinician-replacing framing. NeuroNest coaches the parent; the parent is the one implementing with the child.
- **Positive, strengths-based language** throughout — this mirrors Social Stories methodology (§2) and should extend to all copy, not just generated stories.
- **Norwegian language support is Phase 5**, explicitly deferred — do not build it prematurely into Phase 4 work unless asked.
