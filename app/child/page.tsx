'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// About the child — everything the platform knows in one place: the child's details
// (editable), Dr. Okafor's confirmed clinical profile, and the uploaded documents.
// Reached from Account ("About →") and the Plan tab's records block.

const SECTION_META: { key: string; icon: string; label: string }[] = [
  { key: 'snapshot',        icon: '🌟', label: 'Snapshot' },
  { key: 'communication',   icon: '💬', label: 'Communication' },
  { key: 'social',          icon: '🤝', label: 'Social' },
  { key: 'sensory',         icon: '🌊', label: 'Sensory' },
  { key: 'behaviour',       icon: '🧭', label: 'Behaviour & regulation' },
  { key: 'motor',           icon: '🤸', label: 'Motor' },
  { key: 'cognition',       icon: '🧠', label: 'Thinking & learning' },
  { key: 'strength_map',    icon: '💪', label: 'Strengths' },
  { key: 'family_context',  icon: '🏡', label: 'Family context' },
  { key: 'priority_matrix', icon: '🎯', label: 'Priorities' },
]

// The profile sections are free-form JSON from Dr. Okafor — render whatever shape
// each holds (string, list, or nested object) as readable prose, not raw JSON
function renderValue(value: unknown, depth = 0): React.ReactNode {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <p className="text-sm text-gray-700 leading-relaxed">{String(value)}</p>
  }
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1.5">
        {value.map((v, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
            <span className="text-violet-400 flex-shrink-0">•</span>
            <div className="flex-1">{typeof v === 'object' ? renderValue(v, depth + 1) : String(v)}</div>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className={`space-y-2 ${depth > 0 ? 'mt-1' : ''}`}>
      {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
        <div key={k}>
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-wide">{k.replace(/_/g, ' ')}</div>
          {renderValue(v, depth + 1)}
        </div>
      ))}
    </div>
  )
}

const EDIT_FIELDS: { key: string; label: string; type?: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'dob', label: 'Date of birth', type: 'date' },
  { key: 'diagnosis', label: 'Diagnosis' },
  { key: 'school_name', label: 'School / kindergarten' },
  { key: 'teacher_name', label: 'Teacher / contact person' },
]

function AboutChildContent() {
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const router = useRouter()
  const supabase = createClient()

  const [child, setChild] = useState<Record<string, unknown> | null>(null)
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [profileDate, setProfileDate] = useState<string | null>(null)
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([])
  const [openSection, setOpenSection] = useState<string | null>('snapshot')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [interestsDraft, setInterestsDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!childId) return
    const load = async () => {
      const [{ data: c }, { data: p }, { data: docs }] = await Promise.all([
        supabase.from('children').select('*').eq('id', childId).single(),
        supabase.from('child_profiles').select('profile_data, created_at')
          .eq('child_id', childId).eq('is_current', true).maybeSingle(),
        supabase.from('documents').select('id, file_name, doc_type, uploaded_at')
          .eq('child_id', childId).order('uploaded_at', { ascending: false }),
      ])
      if (c) setChild(c)
      if (p) { setProfile(p.profile_data as Record<string, unknown>); setProfileDate(p.created_at as string) }
      setDocuments(docs || [])
    }
    load()
  }, [childId]) // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = () => {
    if (!child) return
    const d: Record<string, string> = {}
    for (const f of EDIT_FIELDS) d[f.key] = (child[f.key] as string) || ''
    setDraft(d)
    setInterestsDraft(((child.interests as string[]) || []).join(', '))
    setEditing(true)
  }

  const saveEdit = async () => {
    setSaving(true)
    const update: Record<string, unknown> = { ...draft }
    update.interests = interestsDraft.split(',').map(s => s.trim()).filter(Boolean)
    const { data } = await supabase.from('children').update(update).eq('id', childId).select().single()
    if (data) setChild(data)
    setSaving(false)
    setEditing(false)
  }

  if (!child) {
    return <div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading…</div>
  }

  const name = child.name as string
  const dob = child.dob ? new Date(child.dob as string) : null
  const age = dob ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000)) : null
  const interests = (child.interests as string[]) || []

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} aria-label="Back"
            className="w-11 h-11 -ml-2 flex items-center justify-center text-gray-400 text-xl">←</button>
          <div className="flex-1">
            <div className="font-black text-sm text-gray-900">About {name}</div>
            <div className="text-xs text-gray-400">Everything the platform knows, in one place</div>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-16">
        {/* Details — the facts, editable */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Details</div>
            {!editing && (
              <button onClick={startEdit} className="text-sm font-bold text-violet-600 px-2 py-1">✏️ Edit</button>
            )}
          </div>

          {!editing ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-4xl">🧒</span>
                <div>
                  <div className="font-black text-lg text-gray-900">{name}</div>
                  <div className="text-xs text-gray-400">
                    {age !== null ? `${age} years old` : ''}{child.gender ? ` · ${child.gender}` : ''}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                <div className="bg-gray-50 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold text-gray-400">DIAGNOSIS</div>
                  <div className="text-gray-800">{(child.diagnosis as string) || '—'}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold text-gray-400">SCHOOL</div>
                  <div className="text-gray-800">{(child.school_name as string) || '—'}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold text-gray-400">TEACHER</div>
                  <div className="text-gray-800">{(child.teacher_name as string) || '—'}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-2.5">
                  <div className="text-[10px] font-bold text-gray-400">LANGUAGE</div>
                  <div className="text-gray-800">{(child.language as string) === 'no' ? 'Norwegian' : 'English'}</div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-2.5">
                <div className="text-[10px] font-bold text-gray-400">LOVES</div>
                <div className="text-sm text-gray-800">
                  {interests.length ? interests.join(' · ') : 'Add interests — Emma personalises every material with them'}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {EDIT_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-bold text-gray-500 mb-1">{f.label}</label>
                  <input type={f.type || 'text'} value={draft[f.key] || ''}
                    onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 min-h-[44px]" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Interests (comma-separated — these power personalisation)</label>
                <input value={interestsDraft} onChange={e => setInterestsDraft(e.target.value)}
                  placeholder="dinosaurs, bubbles, trampoline"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 min-h-[44px]" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditing(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-500 font-bold rounded-xl text-sm min-h-[44px]">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={saving}
                  className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-black rounded-xl text-sm min-h-[44px]">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clinical profile — Dr. Okafor's confirmed formulation, one accordion per domain */}
        {profile && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Profile</div>
            <div className="text-xs text-gray-400 mb-2">
              Dr. Okafor — {name}&apos;s profiler · confirmed by you{profileDate ? ` · ${new Date(profileDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            </div>
            {SECTION_META.filter(s => profile[s.key]).map(s => (
              <div key={s.key} className="border-b border-gray-50 last:border-0">
                <button onClick={() => setOpenSection(o => o === s.key ? null : s.key)}
                  className="w-full flex items-center gap-2.5 py-3 text-left min-h-[44px]">
                  <span className="text-lg">{s.icon}</span>
                  <span className="flex-1 text-sm font-bold text-gray-800">{s.label}</span>
                  <span className="text-gray-300 text-sm">{openSection === s.key ? '▴' : '▾'}</span>
                </button>
                {openSection === s.key && (
                  <div className="pb-3 pl-9">{renderValue(profile[s.key])}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Documents — the gathered files */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Documents ({documents.length})</div>
            <Link href={`/documents?child=${childId}`} className="text-sm font-bold text-violet-600 px-2 py-1">
              Manage →
            </Link>
          </div>
          {documents.length === 0 ? (
            <div className="text-sm text-gray-400">
              No documents yet — assessments, IOPs, and reports you upload live here and feed the profile.
            </div>
          ) : (
            <div className="space-y-1.5">
              {documents.slice(0, 5).map(d => (
                <div key={d.id as string} className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3 py-2.5">
                  <span className="text-lg">📄</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 truncate">{d.file_name as string}</div>
                    <div className="text-[10px] text-gray-400">
                      {(d.doc_type as string) || 'document'} · {new Date(d.uploaded_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              ))}
              {documents.length > 5 && (
                <div className="text-xs text-gray-400 text-center pt-1">+ {documents.length - 5} more in Manage</div>
              )}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/report?child=${childId}`}
            className="bg-white rounded-2xl border border-gray-100 p-4 text-center hover:border-violet-200 transition">
            <div className="text-2xl mb-1">📈</div>
            <div className="text-sm font-bold text-gray-800">Progress report</div>
          </Link>
          <Link href={`/goals?child=${childId}`}
            className="bg-white rounded-2xl border border-gray-100 p-4 text-center hover:border-violet-200 transition">
            <div className="text-2xl mb-1">🎯</div>
            <div className="text-sm font-bold text-gray-800">The plan</div>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function AboutChildPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading…</div>}>
      <AboutChildContent />
    </Suspense>
  )
}
