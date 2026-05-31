'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { ChatMessage } from '@/types'

interface DocRecord {
  id: string
  file_name: string
  doc_type: string | null
  processing_status: string
  extracted_data: Record<string, unknown> | null
  uploaded_at: string
}

interface ComparisonResult {
  new_information: Record<string, string | null>
  conflicts: { section: string; existing: string; document_says: string; needs_clarification: boolean }[]
  clarification_questions: string[]
  profile_updates: Record<string, unknown>
  summary_for_parent: string
}

const DOC_TYPES = [
  { value: 'ados',    label: 'ADOS-2 Assessment' },
  { value: 'adir',    label: 'ADI-R Report' },
  { value: 'asq3',    label: 'ASQ-3 Questionnaire' },
  { value: 'school',  label: 'School Assessment / IEP' },
  { value: 'medical', label: 'Medical Report' },
  { value: 'therapy', label: 'Therapy Report' },
  { value: 'other',   label: 'Other Report' },
]

function DocumentsContent() {
  const params = useSearchParams()
  const router = useRouter()
  const childId = params.get('child') || ''
  const supabase = createClient()

  const [docs, setDocs]                   = useState<DocRecord[]>([])
  const [uploading, setUploading]         = useState(false)
  const [docType, setDocType]             = useState('other')
  const [dragOver, setDragOver]           = useState(false)
  const [processingId, setProcessingId]   = useState<string | null>(null)
  const [comparison, setComparison]       = useState<ComparisonResult | null>(null)
  const [chatMessages, setChatMessages]   = useState<ChatMessage[]>([])
  const [chatInput, setChatInput]         = useState('')
  const [chatLoading, setChatLoading]     = useState(false)
  const [clarificationDone, setClarificationDone] = useState(false)
  const [updatingProfile, setUpdatingProfile]     = useState(false)
  const [profileUpdated, setProfileUpdated]       = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchDocs() }, [childId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  const fetchDocs = async () => {
    if (!childId) return
    const { data } = await supabase.from('documents').select('*')
      .eq('child_id', childId).order('uploaded_at', { ascending: false })
    setDocs((data || []) as DocRecord[])
  }

  const handleFiles = async (fileList: FileList) => {
    const files = Array.from(fileList)
    for (const file of files) {
      setUploading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) continue

      // Upload to storage
      const filePath = `${user.id}/${childId}/${Date.now()}_${file.name}`
      const { error: uploadErr } = await supabase.storage.from('neuronest-documents').upload(filePath, file)
      const fileUrl = uploadErr ? null : supabase.storage.from('neuronest-documents').getPublicUrl(filePath).data.publicUrl

      // Save doc record
      const { data: docRecord } = await supabase.from('documents').insert({
        child_id: childId, user_id: user.id,
        file_name: file.name, file_url: fileUrl,
        doc_type: docType, processing_status: 'processing',
      }).select().single()

      if (!docRecord) continue
      await fetchDocs()

      // Extract document data — send as base64 directly to Claude
      setProcessingId(docRecord.id)
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const extractRes = await fetch('/api/extract-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: base64,
          fileMediaType: file.type || 'application/pdf',
          fileName: file.name,
          fileUrl: fileUrl,
        }),
      })
      const { extracted } = await extractRes.json()

      await supabase.from('documents').update({
        extracted_data: extracted,
        processing_status: 'complete',
        processed_at: new Date().toISOString(),
      }).eq('id', docRecord.id)

      // Now compare against existing profile
      const { data: profile } = await supabase.from('child_profiles')
        .select('*').eq('child_id', childId).eq('is_current', true).maybeSingle()

      if (profile?.profile_data) {
        const compareRes = await fetch('/api/enrich-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'compare',
            existingProfile: profile.profile_data,
            extractedDocData: extracted,
            childName: '',
          }),
        })
        const { comparison: comp } = await compareRes.json()
        if (comp) {
          setComparison(comp)
          // Start clarification chat if there are questions
          if (comp.clarification_questions?.length > 0) {
            const openingMsg: ChatMessage = {
              role: 'assistant',
              content: `I've reviewed the document you uploaded. ${comp.summary_for_parent}\n\nI have ${comp.clarification_questions.length} follow-up question${comp.clarification_questions.length > 1 ? 's' : ''} based on what the document revealed — things that weren't covered in our original interview. I'll take them one at a time.\n\n${comp.clarification_questions[0]}`,
              timestamp: new Date().toISOString(),
            }
            setChatMessages([openingMsg])
            // Persist chat
            await supabase.from('agent_state').upsert({
              child_id: childId, user_id: user.id,
              agent_type: `doc-enrichment-${docRecord.id}`,
              messages: [openingMsg],
              state_data: { comparison: comp, docId: docRecord.id },
              updated_at: new Date().toISOString(),
            }, { onConflict: 'child_id,agent_type' })
          } else {
            // No questions needed — just update profile directly
            await applyProfileUpdates(comp, profile, user.id)
          }
        }
      }

      setProcessingId(null)
      setUploading(false)
      await fetchDocs()
    }
  }

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading || !comparison) return
    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim(), timestamp: new Date().toISOString() }
    const newMessages = [...chatMessages, userMsg]
    setChatMessages(newMessages)
    setChatInput('')
    setChatLoading(true)

    const res = await fetch('/api/enrich-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'clarify',
        messages: newMessages,
        clarificationQuestions: comparison.clarification_questions,
        comparisonSummary: comparison.summary_for_parent,
      }),
    })
    const { text, clarificationComplete } = await res.json()
    const aiMsg: ChatMessage = { role: 'assistant', content: text, timestamp: new Date().toISOString() }
    const finalMessages = [...newMessages, aiMsg]
    setChatMessages(finalMessages)
    setChatLoading(false)

    // Persist
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('agent_state').upsert({
        child_id: childId, user_id: user.id,
        agent_type: 'doc-enrichment-latest',
        messages: finalMessages,
        state_data: { comparison },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'child_id,agent_type' })
    }

    if (clarificationComplete) {
      setClarificationDone(true)
    }
  }

  const applyProfileUpdates = async (
    comp: ComparisonResult,
    profile: { id: string; profile_data: Record<string, unknown>; version: number },
    userId: string
  ) => {
    setUpdatingProfile(true)
    const updatedData = { ...profile.profile_data }

    // Apply non-null profile updates from the comparison
    if (comp.profile_updates) {
      Object.entries(comp.profile_updates).forEach(([key, val]) => {
        if (val !== null && val !== undefined) {
          updatedData[key] = val
        }
      })
    }

    // Mark old profile as not current
    await supabase.from('child_profiles').update({ is_current: false }).eq('id', profile.id)

    // Create new version
    await supabase.from('child_profiles').insert({
      child_id: childId, user_id: userId,
      version: (profile.version || 1) + 1,
      profile_data: updatedData,
      is_current: true,
      parent_confirmed: false,
    })

    setUpdatingProfile(false)
    setProfileUpdated(true)
  }

  const handleApplyUpdates = async () => {
    if (!comparison) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('child_profiles')
      .select('*').eq('child_id', childId).eq('is_current', true).maybeSingle()
    if (profile) await applyProfileUpdates(comparison, profile, user.id)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.back()}
          className="text-gray-400 hover:text-gray-600 text-xl">←</button>
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-sm">📄</div>
        <div>
          <div className="font-black text-sm text-gray-900">Documents</div>
          <div className="text-[10px] text-gray-400">Upload reports to enrich the profile</div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5 pb-12">

        {/* Upload zone */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-bold text-sm text-gray-900 mb-1">Add a document</h2>
          <p className="text-xs text-gray-400 mb-4 leading-relaxed">
            Upload any report and Dr. Sarah Chen will review it, compare it against the existing profile, and ask only the new questions it raises — without repeating anything from your interview.
          </p>

          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Document type</label>
            <select value={docType} onChange={e => setDocType(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-violet-400 transition">
              {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>

          <div
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files) }}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => document.getElementById('doc-file-input')?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
              dragOver ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-300 hover:bg-gray-50'
            } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <input id="doc-file-input" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
            <div className="text-3xl mb-2">📄</div>
            <div className="font-semibold text-sm text-gray-700 mb-1">
              {uploading ? 'Processing…' : 'Drop files here or click to browse'}
            </div>
            <div className="text-xs text-gray-400">PDF, images, Word documents</div>
          </div>
        </div>

        {/* Processing indicator */}
        {processingId && (
          <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 flex items-center gap-3">
            <div className="flex gap-1">
              <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
            </div>
            <div className="text-sm text-violet-700 font-medium">
              Dr. Sarah Chen is reading the document and comparing it to the existing profile…
            </div>
          </div>
        )}

        {/* Clarification chat */}
        {chatMessages.length > 0 && !profileUpdated && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-sm">👩‍⚕️</div>
              <div>
                <div className="text-sm font-bold text-gray-900">Dr. Sarah Chen</div>
                <div className="text-[10px] text-gray-400">Follow-up questions from new document</div>
              </div>
            </div>

            <div className="px-4 py-4 space-y-3 max-h-80 overflow-y-auto">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-xs flex-shrink-0 mt-1">👩‍⚕️</div>
                  )}
                  <div className={msg.role === 'user' ? 'chat-user' : 'chat-ai'} style={{ whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-indigo-500 flex items-center justify-center text-xs flex-shrink-0">👩‍⚕️</div>
                  <div className="chat-ai flex items-center gap-1.5 py-3">
                    <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {!clarificationDone ? (
              <div className="px-4 py-3 border-t border-gray-50 flex gap-2">
                <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                  placeholder="Answer Dr. Chen's question…" rows={2}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:border-violet-400 transition" />
                <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                  className="px-4 self-end py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition">
                  Send
                </button>
              </div>
            ) : (
              <div className="px-4 py-4 border-t border-gray-50">
                <div className="text-sm text-emerald-600 font-semibold mb-3">
                  ✓ All questions answered — ready to update the profile
                </div>
                <button onClick={handleApplyUpdates} disabled={updatingProfile}
                  className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition">
                  {updatingProfile ? 'Updating profile…' : 'Update profile with new information →'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Profile updated confirmation */}
        {profileUpdated && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
            <div className="font-bold text-emerald-700 mb-1">✓ Profile updated</div>
            <div className="text-sm text-emerald-600 leading-relaxed">
              The document has been added to the profile. A new profile version has been created — your original interview is preserved and this information has been added on top of it.
            </div>
            <button onClick={() => router.push(`/onboarding/profile-review?child=${childId}`)}
              className="mt-3 text-xs font-bold text-violet-600 hover:underline">
              Review updated profile →
            </button>
          </div>
        )}

        {/* Existing documents */}
        {docs.length > 0 && (
          <div>
            <h2 className="font-black text-sm text-gray-900 mb-3">Uploaded documents ({docs.length})</h2>
            <div className="space-y-2">
              {docs.map(doc => (
                <div key={doc.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
                  <span className="text-xl flex-shrink-0">
                    {doc.processing_status === 'complete' ? '✅' :
                     doc.processing_status === 'processing' ? '⏳' :
                     doc.processing_status === 'failed' ? '❌' : '📄'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-gray-900 truncate">{doc.file_name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {DOC_TYPES.find(d => d.value === doc.doc_type)?.label || 'Document'}
                      {' · '}
                      {new Date(doc.uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                    {doc.extracted_data && !!(doc.extracted_data as Record<string, unknown>).key_findings && (
                      <div className="text-xs text-violet-600 mt-1 leading-relaxed">
                        {String((doc.extracted_data as Record<string, unknown>).key_findings ?? '').slice(0, 120)}…
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      doc.processing_status === 'complete' ? 'bg-emerald-50 text-emerald-600' :
                      doc.processing_status === 'processing' ? 'bg-amber-50 text-amber-600' :
                      'bg-gray-100 text-gray-400'
                    }`}>
                      {doc.processing_status === 'complete' ? 'Extracted' :
                       doc.processing_status === 'processing' ? 'Processing…' : 'Pending'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400 text-sm">Loading…</div>}>
      <DocumentsContent />
    </Suspense>
  )
}
