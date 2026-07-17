# Ops snippets

**heal-missing-symbols.sql** — walks every material's content JSON, collects every
`concept` it references (all 9 AAC shapes + flashcards/child-zone cards), finds the
ones with no `aac_symbols` row for their language, and fires them at the
resolve-symbols Edge Function. Idempotent — run via the SQL editor / MCP whenever
symbols look missing (e.g. a resolve run hit the Edge Function time ceiling, as
during the 2026-07-17 ARASAAC→Mulberry migration). Zero rows missing = no-op.
