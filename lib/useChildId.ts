'use client'
import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Every parent-facing client page reads the child from ?child=. When that parameter
// is missing — a typed URL, an old bookmark, a shared link, a notification whose
// query string got trimmed — the page used to sit on its loading spinner forever,
// because the loader bailed before any query ran and nothing ever cleared `loading`.
// (Found 2026-08-23: /checkin opened without ?child= never issued a single request.)
//
// This resolves the child instead of giving up: URL first, else the first child this
// account can see (RLS covers owned + shared), else hand off to /dashboard, which
// already knows how to route someone with no children or a pending invite.
export function useChildId(): { childId: string; resolving: boolean } {
  const params = useSearchParams()
  const router = useRouter()
  const fromUrl = params.get('child') || ''
  const [childId, setChildId] = useState(fromUrl)
  const [resolving, setResolving] = useState(!fromUrl)

  useEffect(() => {
    if (fromUrl) { setChildId(fromUrl); setResolving(false); return }
    let cancelled = false
    const resolve = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.from('children').select('id')
          .order('created_at', { ascending: true }).limit(1)
        if (cancelled) return
        if (data?.length) {
          setChildId(data[0].id as string)
          setResolving(false)
        } else {
          router.replace('/dashboard')
        }
      } catch {
        if (!cancelled) router.replace('/dashboard')
      }
    }
    resolve()
    return () => { cancelled = true }
  }, [fromUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  return { childId, resolving }
}
