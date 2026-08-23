import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Middleware makes NO network call on ordinary navigation. It is a routing gate, not
// the lock: it decides from the session cookie alone, and the page behind it does the
// real verification (every protected page calls getUser() server-side and redirects to
// /login itself, with RLS underneath that).
//
// Why (2026-08-23): calls from Vercel's EDGE runtime to Supabase were taking 17-127s,
// while calls to the same project from the Node runtime, in the same seconds, took
// ~85ms — it is the edge→Supabase path that is broken, not Supabase (GoTrue answered
// every one of those in 3-308ms). Middleware runs on edge and on every navigation, so
// awaiting auth here first produced app-wide 504s at Vercel's 25s kill, then a fixed
// 3s tax once bounded. Deciding from the cookie removes the broken path entirely.
//
// The cost of this design: middleware no longer refreshes the session. The browser
// client's auto-refresh and the Node-side page render cover that; a session expiring
// while the tab is closed can bounce the parent to /login once. That is the accepted
// trade — see CLAUDE.md §6.

// Auth pages are the one place a verified answer is worth waiting for, because
// "bounce them to the dashboard" is not a decision a page can undo. Kept short: on
// timeout we simply render the login page.
const AUTH_PAGE_TIMEOUT_MS = 1000

const AUTH_PAGES = ['/login', '/signup', '/auth/callback']

// Supabase SSR stores the session as sb-<project-ref>-auth-token, chunked .0/.1 when
// large. Presence is not proof of a valid session — only that this looks like a
// signed-in browser rather than an anonymous one, which is all routing needs.
function looksSignedIn(request: NextRequest): boolean {
  return request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
}

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  return NextResponse.redirect(url)
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  const isAuthPage = AUTH_PAGES.some(p => path.startsWith(p))
  const signedIn = looksSignedIn(request)

  // Everything except the auth pages: cookie in, cookie out. No network, no waiting.
  if (!isAuthPage) {
    return signedIn ? NextResponse.next({ request }) : redirectTo(request, '/login')
  }

  // On an auth page with no session cookie there is nothing to verify.
  if (!signedIn) return NextResponse.next({ request })

  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Only a confirmed user sends them to the dashboard. A timeout, an error, or no
  // user all mean the same thing here: show the login page. Signing in again is
  // recoverable; a /login ↔ /dashboard redirect loop is not.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const confirmed = await Promise.race([
      supabase.auth.getUser().then(({ data }) => Boolean(data.user)).catch(() => false),
      new Promise<boolean>(resolve => {
        timer = setTimeout(() => resolve(false), AUTH_PAGE_TIMEOUT_MS)
      }),
    ])
    if (confirmed) return redirectTo(request, '/dashboard')
  } finally {
    if (timer) clearTimeout(timer)
  }

  return supabaseResponse
}

export const config = {
  // Exclude API routes, static files, and images from middleware entirely
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
