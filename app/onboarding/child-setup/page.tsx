'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const DIAGNOSIS_OPTIONS = [
  'Autism Spectrum Disorder (ASD)',
  'ASD Level 1',
  'ASD Level 2',
  'ASD Level 3',
  'Suspected ASD — awaiting assessment',
  'Suspected ASD — no formal assessment yet',
  'Other neurodevelopmental condition',
]

export default function ChildSetupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    name: '',
    dob: '',
    gender: '',
    diagnosis: '',
    diagnosis_source: '',
    country: 'NO',
    school_name: '',
    language: 'en' as 'en' | 'no',
  })

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Please enter your child\'s name'); return }
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: child, error: childErr } = await supabase
      .from('children')
      .insert({
        user_id: user.id,
        name: form.name.trim(),
        dob: form.dob || null,
        gender: form.gender || null,
        diagnosis: form.diagnosis || null,
        diagnosis_source: form.diagnosis_source || null,
        country: form.country,
        school_name: form.school_name || null,
        language: form.language,
        interests: [],
      })
      .select()
      .single()

    if (childErr || !child) {
      setError(childErr?.message || 'Failed to create child profile')
      setLoading(false)
      return
    }

    // Create initial app_state
    await supabase.from('app_state').insert({
      child_id: child.id,
      user_id: user.id,
      current_phase: 'intake',
    })

    router.push(`/onboarding/upload?child=${child.id}`)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="mb-6">
        <h1 className="text-xl font-black text-gray-900 mb-1">Tell us about your child</h1>
        <p className="text-sm text-gray-500">This helps us personalise everything. You can update any details later.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Child&apos;s first name <span className="text-red-400">*</span></label>
          <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Arya"
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition" />
        </div>

        {/* DOB + Gender */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date of birth</label>
            <input type="date" value={form.dob} onChange={e => set('dob', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Gender</label>
            <select value={form.gender} onChange={e => set('gender', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition bg-white">
              <option value="">Prefer not to say</option>
              <option value="girl">Girl</option>
              <option value="boy">Boy</option>
              <option value="non-binary">Non-binary</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {/* Diagnosis */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Diagnosis status</label>
          <select value={form.diagnosis} onChange={e => set('diagnosis', e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition bg-white">
            <option value="">Select one</option>
            {DIAGNOSIS_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* School */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">School or kindergarten <span className="text-gray-400">(optional)</span></label>
          <input value={form.school_name} onChange={e => set('school_name', e.target.value)} placeholder="School name"
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition" />
        </div>

        {/* Country + Language */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Country</label>
            <select value={form.country} onChange={e => set('country', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition bg-white">
              <option value="NO">🇳🇴 Norway</option>
              <option value="GB">🇬🇧 United Kingdom</option>
              <option value="US">🇺🇸 United States</option>
              <option value="AU">🇦🇺 Australia</option>
              <option value="CA">🇨🇦 Canada</option>
              <option value="IN">🇮🇳 India</option>
              <option value="PK">🇵🇰 Pakistan</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Language</label>
            <select value={form.language} onChange={e => set('language', e.target.value as 'en' | 'no')}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition bg-white">
              <option value="en">English</option>
              <option value="no">Norsk</option>
            </select>
          </div>
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition mt-2">
          {loading ? 'Saving…' : 'Continue →'}
        </button>
      </form>
    </div>
  )
}
