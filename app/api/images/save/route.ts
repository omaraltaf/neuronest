import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { b64, contentId, childId, index, prompt } = await req.json()
  if (!b64 || !contentId || !childId) return NextResponse.json({ ok: false })

  try {
    const supabase = createClient()
    const buf = Buffer.from(b64, 'base64')
    const path = `story-images/${childId}/${contentId}/${index}.png`
    await supabase.storage.from('neuronest-documents').upload(path, buf, { contentType: 'image/png', upsert: true })
    await supabase.from('story_images').upsert({
      child_id: childId, content_id: contentId,
      sentence_index: parseInt(index), prompt, storage_path: path,
    }, { onConflict: 'content_id,sentence_index' })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Save error:', e)
    return NextResponse.json({ ok: false })
  }
}
