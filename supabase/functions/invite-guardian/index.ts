// Supabase Edge Function: invite-guardian
// Sends the real invitation email for family sharing (Account page → invite a
// co-parent/guardian). Runs here because auth.admin requires the service-role key,
// which is auto-injected into Edge Functions and must never reach Vercel or the browser.
//
// inviteUserByEmail creates the account AND sends Supabase's invite email; the link
// signs the invitee in and lands them on /auth/callback?next=/account, where their
// pending invitation is waiting to accept. If the email already has an account,
// Supabase returns 422 — no email needed; the invite shows on their Account page on
// next sign-in (we report existing:true so the owner's UI can say so).
//
// Same conventions as the other functions: NOT auto-deployed from git (redeploy
// manually via Supabase MCP deploy_edge_function or `supabase functions deploy
// invite-guardian`, verify_jwt: false), x-cron-secret auth (shared
// WEEKLY_FOCUS_CRON_SECRET), secrets from env or Vault via neuronest.get_secret.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { db: { schema: 'neuronest' } }
)

const APP_URL = Deno.env.get('APP_URL') || 'https://neuronest-nine.vercel.app'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const expected = await getSecret('WEEKLY_FOCUS_CRON_SECRET')
    const provided = req.headers.get('x-cron-secret')
    if (!expected || provided !== expected) {
      return json({ error: 'unauthorized' }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const childName = String(body.child_name || '').trim()
    if (!email) return json({ error: 'email required' }, 400)

    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${APP_URL}/auth/callback?next=/account`,
      data: { invited_for_child: childName },
    })

    if (error) {
      // Already registered → no email needed; the invite is waiting on their Account page
      if (error.status === 422 || /already.*registered/i.test(error.message)) {
        return json({ ok: true, existing: true })
      }
      console.error(`invite-guardian ${email}:`, error.message)
      return json({ error: error.message }, 500)
    }

    console.log(`invite email sent to ${email} (for ${childName})`)
    return json({ ok: true, emailed: true })
  } catch (err) {
    console.error('invite-guardian error:', err)
    return json({ error: String(err) }, 500)
  }
})

const secretCache: Record<string, string> = {}
async function getSecret(name: string): Promise<string | null> {
  const fromEnv = Deno.env.get(name)
  if (fromEnv) return fromEnv
  if (secretCache[name]) return secretCache[name]
  const { data, error } = await supabase.rpc('get_secret', { secret_name: name })
  if (error) { console.error(`get_secret(${name}):`, error.message); return null }
  if (data) secretCache[name] = data as string
  return (data as string) || null
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
