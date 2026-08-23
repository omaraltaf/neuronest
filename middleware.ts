import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

// Supabase's API gateway intermittently queues requests for 30s-4min (confirmed
// 2026-08-23 against their status page, "API Gateway — Degraded Performance": the
// gateway sat on requests for up to 246s while GoTrue itself answered each one in
// 3-308ms). Middleware runs on EVERY page navigation, so the unbounded await that
// used to live here turned their blip into a hard 504 on every route — Vercel stops
// middleware at 25s. A degraded dependency should make NeuroNest slow, never broken.
const AUTH_TIMEOUT_MS = 3000

// Deliberately distinct from null. null means "we asked, nobody is signed in";
// UNKNOWN means "we never got an answer" — the two must lead to different decisions.
const UNKNOWN = Symbol('auth-unknown')
type AuthResult = User | null | typeof UNKNOWN

// Supabase SSR stores the session as sb-<project-ref>-auth-token, chunked as
// .0/.1 when it is large. Presence is not proof of a valid session — it only tells
// us this looks like a signed-in browser rather than an anonymous one.
function looksSignedIn(request: NextRequest): boolean {
  return request.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
}

async function getUserOrTimeout(
  supabase: ReturnType<typeof createServerClient>
): Promise<AuthResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      supabase.auth.getUser()
        .then(({ data }) => data.user)
        .catch(() => UNKNOWN as AuthResult),
      new Promise<AuthResult>(resolve => {
        timer = setTimeout(() => resolve(UNKNOWN), AUTH_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function middleware(request: NextRequest) {
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

  const user = await getUserOrTimeout(supabase)
  const path = request.nextUrl.pathname

  // Auth pages — redirect to dashboard if already logged in
  const authPages = ['/login', '/signup', '/auth/callback']
  if (authPages.some(p => path.startsWith(p))) {
    // On UNKNOWN, show the login page rather than bouncing to a dashboard we cannot
    // confirm they can see. Signing in again is a recoverable outcome; a redirect
    // loop between /login and /dashboard is not.
    if (user && user !== UNKNOWN) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Require auth for everything else. When the answer never came, fall back to the
  // session cookie: let a browser that looks signed in through, and let the page's
  // own server-side getUser() (and RLS underneath it) make the real decision — every
  // protected page already redirects to /login on its own when there is no user.
  // Worst case is a parent seeing a slow page instead of a dead one; nobody reaches
  // another family's data, because middleware was never what was stopping them.
  if (user === UNKNOWN) {
    if (looksSignedIn(request)) return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  // Exclude API routes, static files, and images from middleware entirely
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
