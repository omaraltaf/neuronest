'use client'
import { useState, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const DOC_TYPES = [
  { value: 'ados',    label: 'ADOS-2 Assessment' },
  { value: 'adir',    label: 'ADI-R Report' },
  { value: 'asq3',    label: 'ASQ-3 Questionnaire' },
  { value: 'school',  label: 'School Assessment / IEP' },
  { value: 'medical', label: 'Medical Report' },
  { value: 'therapy', label: 'Therapy Report' },
  { value: 'other',   label: 'Other Report' },
]

interface UploadedFile {
  name: string
  doc_type: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

function UploadContent() {
  const router    = useRouter()
  const params    = useSearchParams()
  const childId   = params.get('child') || ''
  const supabase  = createClient()

  const [files, setFiles]               = useState<UploadedFile[]>([])
  const [dragOver, setDragOver]         = useState(false)
  const [defaultDocType, setDocType]    = useState('other')
  const [intakeDone, setIntakeDone]     = useState<boolean | null>(null) // null = loading
  const [sessionId, setSessionId]       = useState<string | null>(null)
  const [navigating, setNavigating]     = useState(false)

  // Load interview status on mount
  useEffect(() => {
    if (!childId) return
    const check = async () => {
      const { data: appState } = await supabase
        .from('app_state').select('intake_complete').eq('child_id', childId).maybeSingle()
      setIntakeDone(appState?.intake_complete ?? false)

      if (appState?.intake_complete) {
        const { data: session } = await supabase
          .from('intake_sessions').select('id').eq('child_id', childId)
          .order('started_at', { ascending: false }).limit(1).maybeSingle()
        setSessionId(session?.id || null)
      }
    }
    check()
  }, [childId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFiles = useCallback(async (fileList: FileList) => {
    const newFiles = Array.from(fileList)

    for (const file of newFiles) {
      setFiles(prev => [...prev, { name: file.name, doc_type: defaultDocType, status: 'uploading' }])

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) continue

        const filePath = `${user.id}/${childId}/${Date.now()}_${file.name}`
        const { error: uploadErr } = await supabase.storage
          .from('neuronest-documents').upload(filePath, file)

        const fileUrl = uploadErr ? null : supabase.storage
          .from('neuronest-documents').getPublicUrl(filePath).data.publicUrl

        const { data: docRecord } = await supabase.from('documents').insert({
          child_id: childId,
          user_id: user.id,
          file_name: file.name,
          file_url: fileUrl,
          doc_type: defaultDocType,
          processing_status: 'processing',
        }).select().single()

        // Trigger background extraction
        if (docRecord) {
          fetch('/api/extract-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentUrl: fileUrl, fileName: file.name }),
          }).then(async r => {
            const { extracted } = await r.json()
            await supabase.from('documents').update({
              extracted_data: extracted,
              processing_status: 'complete',
              processed_at: new Date().toISOString(),
            }).eq('id', docRecord.id)
          }).catch(() => {
            supabase.from('documents').update({ processing_status: 'failed' }).eq('id', docRecord.id)
          })
        }

        setFiles(prev => prev.map(f => f.name === file.name ? { ...f, status: 'done' } : f))
      } catch {
        setFiles(prev => prev.map(f => f.name === file.name ? { ...f, status: 'error', error: 'Upload failed' } : f))
      }
    }
  }, [childId, supabase, defaultDocType])

  const handleContinue = async () => {
    setNavigating(true)
    if (intakeDone) {
      router.push(`/onboarding/profile-review?child=${childId}&session=${sessionId || ''}`)
    } else {
      router.push(`/onboarding/intake?child=${childId}`)
    }
  }

  const buttonLabel = () => {
    if (intakeDone === null) return 'Loading…'
    if (intakeDone) {
      return files.length > 0 ? 'Continue to profile review →' : 'Go to profile review →'
    }
    return files.length > 0 ? 'Continue to interview →' : 'Skip, start interview →'
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h1 className="text-xl font-black text-gray-900 mb-1">Upload reports & assessments</h1>
        <p className="text-sm text-gray-500 mb-5">
          {intakeDone
            ? 'Upload any additional documents. Dr. Sarah Chen will review them and ask only new questions before you confirm the profile.'
            : 'Any documents you have — diagnostic reports, school assessments, therapy notes, ASQ-3 forms. This helps us understand your child before the interview.'}
        </p>

        {/* Doc type selector */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Document type</label>
          <select value={defaultDocType} onChange={e => setDocType(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition">
            {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>

        {/* Drop zone */}
        <div
          onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files) }}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
            dragOver ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-300 hover:bg-gray-50'
          }`}
          onClick={() => document.getElementById('file-input')?.click()}>
          <input id="file-input" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
          <div className="text-3xl mb-3">📄</div>
          <div className="font-semibold text-gray-700 text-sm mb-1">Drop files here or click to browse</div>
          <div className="text-xs text-gray-400">PDF, images, Word documents accepted</div>
        </div>

        {/* Uploaded files */}
        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                <span className="text-lg flex-shrink-0">
                  {f.status === 'done' ? '✅' : f.status === 'error' ? '❌' : f.status === 'uploading' ? '⏳' : '📄'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{f.name}</div>
                  <div className="text-xs text-gray-400">{DOC_TYPES.find(d => d.value === f.doc_type)?.label}</div>
                </div>
                {f.error && <span className="text-xs text-red-500">{f.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info box — context-aware */}
      <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
        <div className="text-xs font-bold text-violet-700 mb-1">
          {intakeDone ? '📋 Documents added after interview' : '📋 Why upload documents?'}
        </div>
        <div className="text-xs text-violet-600 leading-relaxed">
          {intakeDone
            ? 'Since your interview is complete, Dr. Sarah Chen will read these documents, show you exactly what was extracted, and ask only the new questions they raise — without repeating anything from your interview.'
            : 'Our intake specialist reads every document before your interview. We won\'t ask questions you\'ve already answered in reports — saving time and making the interview more targeted.'}
        </div>
      </div>

      {/* Continue button */}
      <button
        onClick={handleContinue}
        disabled={navigating || intakeDone === null}
        className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition">
        {navigating ? 'Loading…' : buttonLabel()}
      </button>

      <p className="text-center text-xs text-gray-400">
        Documents are stored securely and only used to personalise your child&apos;s programme.
      </p>
    </div>
  )
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="text-center py-8 text-gray-400 text-sm">Loading…</div>}>
      <UploadContent />
    </Suspense>
  )
}
