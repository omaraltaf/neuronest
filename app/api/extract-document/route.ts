import { NextRequest, NextResponse } from 'next/server'

const EXTRACTION_PROMPT = `You are Dr. Sarah Chen, a clinical psychologist specialising in ASD assessment.
You have been given a document to analyse. Extract all clinically relevant information and return it as structured JSON.

Extract the following where present:
{
  "doc_type": "ados|adir|asq3|school|medical|therapy|other",
  "child_name": "...",
  "child_dob": "...",
  "assessment_date": "...",
  "assessor": "...",
  "diagnosis": "...",
  "diagnosis_level": "Level 1|2|3|unspecified",
  "scores": {
    "ados_total": null,
    "ados_communication": null,
    "ados_social": null,
    "adir_social": null,
    "adir_communication": null,
    "adir_repetitive": null,
    "iq_estimate": null,
    "language_age_equivalent": null,
    "adaptive_behaviour": null
  },
  "communication_summary": "...",
  "social_summary": "...",
  "sensory_summary": "...",
  "behaviour_summary": "...",
  "motor_summary": "...",
  "cognitive_summary": "...",
  "strengths": ["..."],
  "recommendations": ["..."],
  "current_support": ["..."],
  "medical_notes": "...",
  "key_findings": "..."
}

Return ONLY valid JSON, no markdown, no explanation. Use null for fields not present in the document.`

export async function POST(req: NextRequest) {
  const { documentText, documentUrl, fileName, childName } = await req.json()

  const userContent = documentText
    ? `Please extract structured clinical information from this document about ${childName || 'the child'}:\n\n${documentText}`
    : `The document "${fileName}" has been uploaded but its text content could not be extracted automatically. Based on the filename and any context available, please provide a minimal extraction with doc_type identified where possible.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: EXTRACTION_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    const data = await res.json()
    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || '{}'

    let extracted = {}
    try {
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      extracted = JSON.parse(clean)
    } catch {
      extracted = { key_findings: text, parse_error: true }
    }

    return NextResponse.json({ extracted })
  } catch (err) {
    console.error('Document extraction error:', err)
    return NextResponse.json({ extracted: {}, error: 'Extraction failed' }, { status: 500 })
  }
}
