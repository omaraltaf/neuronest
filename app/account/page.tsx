'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Account — the person behind the platform: sign-in details, the children on this
// account (owned and shared), and family sharing (invite a co-parent/guardian by
// email; they accept from their own Account page). Reached from the ⚙️ in the header.

type Child = { id: string; name: string; dob: string; user_id: string }
type Guardian = {
  id: string; child_id: string; child_name: string; invited_email: string
  status: string; user_id: string | null
}

function AccountContent() {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()

  // Recovery links land here with ?pw=1 — open the password form straight away
  const [pwOpen, setPwOpen] = useState(params.get('pw') === '1')
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [memberSince, setMemberSince] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [guardians, setGuardians] = useState<Guardian[]>([])
  const [myInvites, setMyInvites] = useState<Guardian[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteChild, setInviteChild] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setEmail(user.email || '')
    setUserId(user.id)
    setMemberSince(new Date(user.created_at).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }))

    // RLS returns owned children plus any shared with this account
    const [{ data: kids }, { data: guardianRows }] = await Promise.all([
      supabase.from('children').select('id, name, dob, user_id').order('created_at'),
      supabase.from('child_guardians').select('*').order('created_at'),
    ])
    setChildren((kids || []) as Child[])
    const rows = (guardianRows || []) as Guardian[]
    const mine = (user.email || '').toLowerCase()
    setMyInvites(rows.filter(r => r.status === 'pending' && r.invited_email === mine))
    setGuardians(rows.filter(r => r.invited_email !== mine))
    if (kids?.length && !inviteChild) setInviteChild(kids.find(k => k.user_id === user.id)?.id || '')
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sends the actual invitation email (via the invite-guardian Edge Function) for a
  // pending invite — also used to resend for invites created before email existed
  const sendInviteEmail = async (childId: string, email: string) => {
    const res = await fetch('/api/invite-guardian', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ childId, email }),
    })
    const result = await res.json().catch(() => ({}))
    if (result.emailed) {
      setNotice(`📧 Invite email sent to ${email} — the link in it signs them in and shows the invitation to accept.`)
    } else if (result.existing) {
      setNotice(`${email} already has a NeuroNest account — the invitation is waiting under ⚙️ Account next time they sign in.`)
    } else {
      setNotice(`The invite is saved, but the email could not be sent — they can still sign up at neuronest-nine.vercel.app with ${email} and accept from their Account page.`)
    }
  }

  const invite = async () => {
    if (!inviteEmail.trim() || !inviteChild) return
    setBusy(true)
    const email = inviteEmail.trim().toLowerCase()
    const child = children.find(c => c.id === inviteChild)
    const { error } = await supabase.from('child_guardians').insert({
      child_id: inviteChild,
      child_name: child?.name || '',
      invited_email: email,
      invited_by: userId,
    })
    if (error) {
      setNotice(error.message.includes('duplicate')
        ? 'That email is already invited for this child.'
        : 'Could not save the invite — check the email address.')
    } else {
      await sendInviteEmail(inviteChild, email)
    }
    setInviteEmail('')
    setBusy(false)
    load()
  }

  const removeGuardian = async (id: string) => {
    await supabase.from('child_guardians').delete().eq('id', id)
    load()
  }

  const acceptInvite = async (row: Guardian) => {
    setBusy(true)
    await supabase.from('child_guardians')
      .update({ status: 'accepted', user_id: userId, accepted_at: new Date().toISOString() })
      .eq('id', row.id)
    setNotice(`You now have access to ${row.child_name}'s platform. 🎉`)
    setBusy(false)
    load()
  }

  // Signed-in users set their password directly — no email round-trip (the reset
  // email is only for the signed-out "Forgot password?" path on the login page)
  const changePassword = async () => {
    if (pw1.length < 6) { setNotice('Password needs at least 6 characters.'); return }
    if (pw1 !== pw2) { setNotice("The two passwords don't match — try again."); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setNotice(error ? `Could not update the password: ${error.message}` : '🔑 Password updated — use it next time you sign in.')
    if (!error) { setPwOpen(false); setPw1(''); setPw2('') }
    setBusy(false)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const ownedChildren = children.filter(c => c.user_id === userId)
  const sharedChildren = children.filter(c => c.user_id !== userId)
  const age = (dob: string) => Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000))

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} aria-label="Back"
            className="w-11 h-11 -ml-2 flex items-center justify-center text-gray-400 text-xl">←</button>
          <div className="font-black text-sm text-gray-900">Account</div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-16">
        {notice && (
          <div className="bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3 text-sm text-violet-800 flex items-start gap-2">
            <span className="flex-1">{notice}</span>
            <button onClick={() => setNotice(null)} className="text-violet-400 px-1">✕</button>
          </div>
        )}

        {/* Invitations waiting for me — first, because it's the one action another
            person is waiting on */}
        {myInvites.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <div className="text-sm font-black text-emerald-800 mb-2">💌 You&apos;ve been invited</div>
            {myInvites.map(inv => (
              <div key={inv.id} className="flex items-center gap-3 bg-white rounded-xl p-3 mb-2 last:mb-0">
                <div className="flex-1">
                  <div className="text-sm font-bold text-gray-900">{inv.child_name}&apos;s platform</div>
                  <div className="text-xs text-gray-400">Shared with you as a parent/guardian</div>
                </div>
                <button onClick={() => acceptInvite(inv)} disabled={busy}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-sm min-h-[44px]">
                  Accept
                </button>
              </div>
            ))}
          </div>
        )}

        {/* You */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-2">You</div>
          <div className="font-bold text-sm text-gray-900">{email}</div>
          <div className="text-xs text-gray-400 mt-0.5">Member since {memberSince}</div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setPwOpen(o => !o)}
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 font-bold rounded-xl text-sm min-h-[44px] hover:bg-gray-50">
              🔑 Change password
            </button>
            <button onClick={signOut}
              className="flex-1 py-2.5 border border-red-100 text-red-500 font-bold rounded-xl text-sm min-h-[44px] hover:bg-red-50">
              Sign out
            </button>
          </div>

          {pwOpen && (
            <div className="mt-3 bg-gray-50 rounded-xl p-3 space-y-2">
              <div className="text-xs font-bold text-gray-600">Set a new password</div>
              <input type="password" value={pw1} onChange={e => setPw1(e.target.value)}
                placeholder="New password (min 6 characters)" minLength={6} autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-violet-400 min-h-[44px]" />
              <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                placeholder="Same password again"
                onKeyDown={e => { if (e.key === 'Enter') changePassword() }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-violet-400 min-h-[44px]" />
              <button onClick={changePassword} disabled={busy || !pw1 || !pw2}
                className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-black rounded-xl text-sm min-h-[44px]">
                Save password
              </button>
            </div>
          )}
        </div>

        {/* Children */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-2">Children</div>
          {children.length === 0 && (
            <div className="text-sm text-gray-400">No children yet.</div>
          )}
          {ownedChildren.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
              <span className="text-2xl">🧒</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-gray-900">{c.name}</div>
                <div className="text-xs text-gray-400">{age(c.dob)} years old</div>
              </div>
              <Link href={`/child?child=${c.id}`}
                className="text-sm font-bold text-violet-600 px-3 py-2.5 min-h-[44px] flex items-center">
                About →
              </Link>
            </div>
          ))}
          {sharedChildren.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
              <span className="text-2xl">🧒</span>
              <div className="flex-1">
                <div className="text-sm font-bold text-gray-900">{c.name} <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5 ml-1">shared with you</span></div>
                <div className="text-xs text-gray-400">{age(c.dob)} years old</div>
              </div>
              <Link href={`/child?child=${c.id}`}
                className="text-sm font-bold text-violet-600 px-3 py-2.5 min-h-[44px] flex items-center">
                About →
              </Link>
            </div>
          ))}
          <Link href="/onboarding/child-setup"
            className="mt-2 block text-center py-2.5 border border-dashed border-gray-200 text-gray-500 font-bold rounded-xl text-sm min-h-[44px] hover:border-violet-300 hover:text-violet-600 transition">
            ＋ Add a child
          </Link>
        </div>

        {/* Family sharing — only for children this account owns */}
        {ownedChildren.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-1">Family sharing</div>
            <div className="text-xs text-gray-400 mb-3">
              Invite the other parent, a grandparent, or a support worker — they see and use everything for that child: the plan, materials, practice logging.
            </div>

            {guardians.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {guardians.map(g => (
                  <div key={g.id} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{g.invited_email}</div>
                      <div className="text-[10px] text-gray-400">
                        {g.child_name} · {g.status === 'accepted' ? '✅ active' : '⏳ waiting for them to accept'}
                      </div>
                    </div>
                    {g.status === 'pending' && (
                      <button onClick={() => sendInviteEmail(g.child_id, g.invited_email)}
                        className="text-xs font-bold text-violet-600 hover:text-violet-800 px-2 py-2 whitespace-nowrap">
                        📧 Send email
                      </button>
                    )}
                    <button onClick={() => removeGuardian(g.id)} aria-label="Remove"
                      className="text-red-400 hover:text-red-600 px-2 py-2 text-sm">✕</button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {ownedChildren.length > 1 && (
                <select value={inviteChild} onChange={e => setInviteChild(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-violet-400 min-h-[44px]">
                  {ownedChildren.map(c => (
                    <option key={c.id} value={c.id}>For {c.name}</option>
                  ))}
                </select>
              )}
              <div className="flex gap-2">
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  type="email" placeholder="their-email@example.com"
                  onKeyDown={e => { if (e.key === 'Enter') invite() }}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 min-h-[44px]" />
                <button onClick={invite} disabled={busy || !inviteEmail.trim() || !inviteChild}
                  className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-black rounded-xl text-sm min-h-[44px] flex-shrink-0">
                  Invite
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading…</div>}>
      <AccountContent />
    </Suspense>
  )
}
