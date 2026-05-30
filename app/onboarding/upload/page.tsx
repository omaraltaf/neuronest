'use client'
import { useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const DOC_TYPES = [
  { value: 'ados', label: 'ADOS-2 Assessment' },
  { value: 'adir', label: 'ADI-R Report' },
  { value: 'asq3', label: 'ASQ-3 Questionnaire' },
  { value: 'school', label: 'School Assessment / IEP' },
  { value: 'medical', label: 'Medical Report' },
  { value: 'therapy', label: 'Therapy Report' },
  { value: 'other', label: 'Other Report' },
]

interface UploadedFile {
  name: string
  doc_type: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

function UploadContent() {
  const router = useRouter()
  const params = useSearchParams()
  const childId = params.get('child') || ''
  const supabase = createClient()

  const [files, setFiles] = useState<UploadedFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [defaultDocType, setDefaultDocType] = useState('other')

  const handleFiles = useCallback(async (fileList: FileList) => {
    const newFiles = Array.from(fileList).map(f => ({
      name: f.name,
      doc_type: defaultDocType,
      status: 'pending' as const,
      file: f,
    }))

    for (const item of newFiles) {
      setFiles(prev => [...prev, { name: item.name, doc_type: item.doc_type, status: 'uploading' }])

      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) continue

        // Upload to Supabase storage
        const filePath = `${user.id}/${childId}/${Date.now()}_${item.name}`
        const { error: uploadErr } = await supabase.storage
          .from('neuronest-documents')
          .upload(filePath, item.file)

        const fileUrl = uploadErr ? null : supabase.storage
          .from('neuronest-documents')
          .getPublicUrl(filePath).data.publicUrl

        // Save document record
        const { data: docRecord } = await supabase.from('documents').insert({
          child_id: childId,
          user_id: user.id,
          file_name: item.name,
          file_url: fileUrl,
          doc_type: item.doc_type,
          processing_status: 'processing',
        }).select().single()

        // Trigger extraction in background
        if (docRecord) {
          fetch('/api/extract-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              documentUrl: fileUrl,
              fileName: item.name,
              childName: '',
            }),
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

        setFiles(prev => prev.map(f =>
          f.name === item.name ? { ...f, status: 'done' } : f
        ))
      } catch {
        setFiles(prev => prev.map(f =>
          f.name === item.name ? { ...f, status: 'error', error: 'Upload failed' } : f
        ))
      }
    }
  }, [childId, supabase, defaultDocType])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h1 className="text-xl font-black text-gray-900 mb-1">Upload reports & assessments</h1>
        <p className="text-sm text-gray-500 mb-5">
          Any documents you have — diagnostic reports, school assessments, therapy notes, ASQ-3 forms.
          This helps us understand your child before the interview, so we don&apos;t ask what you&apos;ve already shared.
        </p>

        {/* Doc type selector */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Document type for uploads</label>
          <select value={defaultDocType} onChange={e => setDefaultDocType(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition">
            {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>

        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
            dragOver ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-300 hover:bg-gray-50'
          }`}
          onClick={() => document.getElementById('file-input')?.click()}
        >
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

      {/* Info box */}
      <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4">
        <div className="text-xs font-bold text-violet-700 mb-1">Why do we ask for documents?</div>
        <div className="text-xs text-violet-600 leading-relaxed">
          Our intake specialist reads every document before your interview. This means we won&apos;t ask questions you&apos;ve already answered in reports — and we can ask more targeted, useful questions about what matters most for your child.
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={() => async () => {
            // Check if interview already done — go to profile review instead
            const supabase = (await import('@/lib/supabase/client')).createClient()
            const { data: appState } = await supabase
              .from('app_state').select('intake_complete').eq('child_id', childId).maybeSingle()
            if (appState?.intake_complete) {
              const { data: session } = await supabase
                .from('intake_sessions').select('id').eq('child_id', childId)
                .order('created_at', { ascending: false }).limit(1).maybeSingle()
              router.push(`/onboarding/profile-review?child=${childId}&session=${session?.id || ''}`)
            } else {
              router.push(`/onboarding/intake?child=${childId}`)
            }
          }}
          className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl text-sm transition">
          {files.length > 0 ? 'Continue to interview →' : 'Skip, start interview →'}
        </button>
      </div>

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
