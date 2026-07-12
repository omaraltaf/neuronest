import { redirect } from 'next/navigation'

// Progress was folded into the Plan tab (UX_PLAN.md Round 2, 2026-07-06): its useful
// remains (check-in summary, recent practice, reports & files) live at the bottom of
// /goals. This redirect keeps old notification links and bookmarks working.
export default function ProgressPage({ searchParams }: { searchParams: { child?: string } }) {
  redirect(searchParams.child ? `/goals?child=${searchParams.child}` : '/dashboard')
}
