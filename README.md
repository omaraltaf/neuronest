# NeuroNest

**AI-Powered ASD Parent Support Platform**

A personalised guide for every child's journey — powered by 6 specialist AI agents.

---

## What it does

1. **Intake Interview** — Dr. Sarah Chen (Clinical Psychologist AI) conducts a structured parent interview across 8 domains, tracking confidence per domain until 80%+ on all
2. **Profile Generation** — Dr. James Okafor (Developmental Paediatrician AI) synthesises intake data into a root-cause profile
3. **Plan Feedback Loop** — Dr. Maria Santos (BCBA-D AI) creates a personalised plan and iterates with parents until they approve it
4. **Daily Programme** — Content Agent generates personalised daily activities
5. **Weekly Check-ins** — Dr. Lena Eriksson (Progress Agent) conducts structured weekly reviews
6. **Child Zone** — "Sunny" (Child Agent) powers personalised games, flashcards, and songs

---

## Deploy in 10 minutes

### 1. Push to GitHub
```bash
cd neuronest
git init
git add .
git commit -m "Initial commit"
# Create repo on github.com then:
git remote add origin https://github.com/YOUR_USERNAME/neuronest.git
git push -u origin main
```

### 2. Deploy on Vercel
1. vercel.com → New Project → Import repo
2. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://kutseusvdlkhflskezde.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (from .env.local)
   - `ANTHROPIC_API_KEY` = your key from console.anthropic.com
3. Deploy

### 3. Create Supabase Storage bucket
In Supabase dashboard → Storage → New bucket: `neuronest-documents` (public)

### 4. Sign up and start
Go to your live URL. Create an account. Begin onboarding.

---

## Local development
```bash
npm install
npm run dev
# Open http://localhost:3000
```

---

## Architecture
- **Next.js 14** (App Router)
- **Supabase** (Postgres `neuronest` schema + Auth + Storage)
- **Anthropic Claude** (6 specialised agents via server-side API routes)
- **Tailwind CSS**
- **Vercel** (hosting)

## Agent Files
- `/lib/agents/prompts.ts` — all 6 agent system prompts
- `/app/api/intake/route.ts` — Intake Agent API
- `/app/api/profile/route.ts` — Profile Agent API
- `/app/api/planning/route.ts` — Planning Agent API

## Migration
When ready to move to a dedicated Supabase project:
```sql
pg_dump --schema=neuronest --no-owner --no-acl $SOURCE_DB_URL | psql $DEST_DB_URL
```
