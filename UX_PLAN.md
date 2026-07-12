# NeuroNest UX/UI Evaluation & Fix Plan

*Evaluated 2026-07-04 by Fable 5 — full code-level audit of every parent-facing screen.*
*The lens: one tired parent, one thumb, 30 seconds of attention, possibly a non-native English reader. Same lens the platform's own content prompts use ("clear enough for 7pm on a hard day") — the app chrome must meet the bar its content already sets.*

---

## Part 1 — Evaluation

### What already works well (don't break these)

- **Visual-first design language** — emoji anchors, colour-coded areas, cards. Consistent across all screens.
- **The Child Zone** is exemplary: one giant tap target, zero reading required, nothing competing.
- **Chat surfaces (check-in, Ask AI)** are clean single-purpose screens with quick-question chips.
- **The new proactive layer** (weekly focus, proposals, coaching modal) delivers information at the right *moment*, which is itself good UX — the problem below is that it landed on top of an already-full hub.

### Finding 1 — Two competing navigation systems (the core "too many tabs" problem)

There are **9 destinations**, reachable from the dashboard through **12 links across 3 different systems**:

| System | Contains |
|---|---|
| Header nav pills (dashboard only) | Home, Goals, Progress, Ask AI |
| Quick-access grid (7 tiles) | Check-in, Child Zone, Ask a question, View progress, Add documents, Content library, Progress report |
| Header extras | Child Zone pill, notification bell |

- **Ask AI, Progress, and Child Zone each appear twice** on the same screen with different labels ("Ask AI" pill vs "Ask a question" tile). A parent can't build a stable mental map when the same place has two names and two doors.
- The nav pills exist **only on the dashboard** — every subpage has only a "←" back arrow, so moving from Goals to Progress means going through Home. Hub-and-spoke is fine for occasional tasks, but the daily loop (focus → log → progress) shouldn't require re-entering the hub.
- Documents and Progress Report are **admin tasks used maybe monthly**, yet they hold equal visual rank with daily actions.

### Finding 2 — The most important daily action is 3+ levels deep

The platform's whole clinical model rests on the parent doing a 5-minute practice and logging it (fidelity → outcomes, per CLAUDE.md §2). Today that flow is:

> Dashboard → Goals → find & tap the right goal → scroll the expanded card past rationale/approach/target/status → set rating → Save.

Meanwhile the weekly focus card says "start this 5-minute activity tonight" — but has **no button to log that you did it**. The loop the AI plans is not the loop the UI closes. This is the single highest-impact fix available.

### Finding 3 — Dashboard information density

One screen currently stacks: notification badge, weekly focus card (7 sub-sections when expanded, plus a text input), check-in banner, 3 stat tiles, goals-by-area list, and 7 quick-access tiles. Two of these are purple gradient cards competing for "most important thing on screen." Everything is bold, everything has an emoji, so **nothing** is emphasized. The dashboard answers five questions at once instead of the only one that matters at 7pm: *"what should I do right now?"*

### Finding 4 — The same data shown three different ways

- Goal status appears on the **dashboard** (dots by area), **Goals** (status pills), and **Progress** (coloured list) — three different visual encodings of the same fact.
- Stat tiles appear on the dashboard (3) and Progress (4), computed from the same logs.
- This triples maintenance and forces the parent to learn three dialects for one concept.

### Finding 5 — Six named personas, tool-centric labels

Parents meet Dr. Chen, Dr. Okafor, Dr. Santos, Dr. Eriksson, Emma Blackwell, and Sunny. The persona warmth is good, but nothing on-screen explains who does what — "Dr. Santos suggests" and "Emma Blackwell · SEN Teacher" assume recall the user doesn't have. Labels are tool-words ("Content Library", "Generate", "Documents") rather than parent-words ("Materials", "Make something", "Reports & files").

### Finding 6 — Text size and tap targets

Heavy use of 9–11px text (`text-[10px]`, `text-[9px]`) for load-bearing labels, and small tap targets (status pills, filter chips). For a stressed parent — or a grandparent — this is a real accessibility barrier. WCAG minimum touch target is 44px; many controls are ~28px.

### Finding 7 — Notification variety is growing

Now 8 auto-types (checkin_due, goal_achieved, goal_proposal, streak, no_sessions, content_gap, weekly_focus, content_ready). Caps are in place (good), but they all render identically in one dropdown; the parent can't tell celebration from to-do at a glance.

---

## Part 2 — Fix Plan (prioritized)

Ordered by impact-per-effort. P1–P3 are the structural fixes; P4–P6 are polish. Each is shippable independently.

### P1 — Rebuild the dashboard as "Today" (highest impact)

One screen, one question: *what should I do right now?*

1. **Hero = weekly focus card** with a single primary CTA: **"▶ Today's 5 minutes"** opening the starter activity, ending in **"Done! How did it go?"** → inline 1–5 rating + optional note → writes a session_log tied to the focus's primary goal (rating ≤2 triggers the existing coaching modal). *This closes the plan→do→log→coach loop in one place.*
2. **One contextual banner maximum**, priority-ordered: pending goal proposal > check-in due > content ready. Never stack banners.
3. **Collapse the 3 stat tiles into one momentum line** inside the focus card footer: "🔥 3 days in a row · 2 of 8 goals achieved".
4. **Remove the goals-by-area section** (it duplicates the Goals tab) and shrink quick access to **4 tiles**: ✨ Arya's Zone (large, first), 🎯 Goals, 📦 Materials, 💬 Ask. Documents & Report move into Progress (P4).
5. Focus card's expanded details stay collapsed by default; week-ahead question appears **only until answered** for the week.

### P2 — One navigation system: bottom tab bar

- Persistent bottom tabs on all parent screens: **🏠 Today · 🎯 Goals · 📈 Progress · 📦 Materials · 💬 Ask**.
- Delete the dashboard header pills and the duplicate tiles; header keeps only child name, bell, and Child Zone launcher (Child Zone is *for the child*, so it's launched deliberately from Today rather than being a parent tab).
- Every screen keeps a stable identity: one name, one door.

### P3 — Universal quick-log

- A floating **"+ Log practice"** button on Today and Goals: tap → goal picker (defaulting to this week's focus goal, with "just general practice" option) → rating → optional note → save. Two taps to a rating.
- The per-goal expanded card keeps its logger, but nobody *has* to find it.

### P4 — Consolidate the records area

- **Progress** absorbs Documents and Progress Report as two rows at the bottom ("📄 Reports & files"). Both are occasional admin — they belong inside the records area, not on the front door.
- Progress also gets the check-in history summary (latest wins/recommendations) with a link into the full chat — one place to "look back", three places become one.
- Destination count drops from 9 to 6.

### P5 — Language & persona pass

- Every persona reference gains a role tag on first appearance per screen: "Dr. Santos · your planner", "Dr. Eriksson · your coach", "Emma · makes your materials". No memory required.
- Rename tool-words: Content Library → **Materials**, Generate → **Make something for [goal]**, Documents → **Reports & files**.
- Copy pass to ~8-year-old reading level on all static labels (the AI-generated content already does this — the chrome should match).

### P6 — Accessibility & visual hierarchy pass

- Minimum text: 12px body, 14px for anything tappable; minimum 44px touch targets (status pills, filter chips, rating buttons).
- One gradient card per screen (the hero); everything else flat white — restores a "most important thing".
- Notification dropdown groups into "🎉 Wins" and "👉 For you" so celebration and to-do are scannable.

### Explicitly not changing

- Child Zone (already right), chat screens' internals, onboarding flow (one-time, works), the print/export views, and all agent/backend architecture — this plan is purely presentational plus one new quick-log write path.

### Suggested execution order

| Step | Scope | Touches |
|---|---|---|
| 1 | P2 bottom tabs + de-duplication | new `components/TabBar.tsx`, all page headers |
| 2 | P1 Today rebuild + focus quick-log | `DashboardClient.tsx`, small API addition |
| 3 | P3 floating quick-log | `GoalsClient.tsx`, shared component |
| 4 | P4 Progress consolidation | `ProgressClient.tsx`, delete tiles |
| 5 | P5+P6 copy & accessibility pass | all screens, mechanical |

Steps 1–3 deliver ~80% of the felt improvement.

---

# Round 2 — Screen-by-Screen Consolidation (2026-07-06)

*Trigger: field feedback after guided mode — "still lost, too many things, materials not connected to goals." Test applied to every screen: a busy, non-digital-savvy parent should never have to figure out where to go.*

## Decisions

| Screen | Decision |
|---|---|
| Today | Keep (the spine). Lead the hero with the ACTION ("Today's 5 minutes: X"), not the focus title. Surface the week-ahead question on the card whenever unanswered — buried under "Full plan" it starves the content-anticipation feature. |
| Goals | Keep, becomes the **Plan** tab. Each working-on-now goal links to its materials inline ("N materials ready →"). Gains a quiet "History & records" block at the bottom: last check-in wins/recommendation + start-checkin link, recent sessions, report & documents links. |
| Progress | **Removed as a tab.** Stat tiles/heatmap were analyst UI duplicating Today's momentum line; all-goals list duplicated Goals. Route becomes a redirect to Plan (old notification links must keep working). |
| Materials | Keep. Generate modal shows the 2 parent-legible types first (activity pack, story); flashcards/sensory/role-play behind "More types". Supports ?goal= deep link from Plan. |
| Ask | Keep as-is. |
| Check-in | Not a tab (unchanged); its summary lives in Plan's History block. |
| Child Zone | Untouched. |
| Documents / Report | Reached from Plan → History & records. |

## Resulting IA — 4 tabs

🏠 Today (do this now) · 🎯 Plan (the journey + records) · 📦 Materials (recommended first) · 💬 Ask

Every piece of data is displayed in exactly ONE place. Goal↔material cross-links kill the last "go hunting" flow.
