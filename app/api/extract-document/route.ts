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
  "organisation": "...",
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
  "recommendations": ["all recommendations listed in the document"],
  "current_support": ["support currently in place"],
  "hours_per_week": "...",
  "school_placement": "...",
  "iop_goals": ["goals listed in IOP if present"],
  "medical_notes": "...",
  "key_findings": "A comprehensive summary of all key findings from this document"
}

Be thorough — extract ALL recommendations, goals, and findings. 
Return ONLY valid JSON, no markdown, no explanation. Use null for fields not present.`

export async function POST(req: NextRequest) {
  const { fileUrl, fileName, fileBase64, fileMediaType } = await req.json()

  try {
    let messageContent: unknown[]

    if (fileBase64 && fileMediaType) {
      // Direct base64 upload — preferred path
      const isImage = fileMediaType.startsWith('image/')
      const isPdf = fileMediaType === 'application/pdf'

      if (isPdf) {
        messageContent = [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: fileBase64,
            },
          },
          {
            type: 'text',
            text: `Please extract all clinical information from this document (${fileName}). Return complete JSON as instructed.`,
          },
        ]
      } else if (isImage) {
        messageContent = [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: fileMediaType,
              data: fileBase64,
            },
          },
          {
            type: 'text',
            text: `Please extract all clinical information from this document image (${fileName}). Return complete JSON as instructed.`,
          },
        ]
      } else {
        // Unknown type — treat as text
        messageContent = [{
          type: 'text',
          text: `Document: ${fileName}\n\nPlease extract what you can from the filename and return structured JSON.`,
        }]
      }
    } else if (fileUrl) {
      // Fallback: try to fetch the file content from the URL
      try {
        const fileRes = await fetch(fileUrl)
        const arrayBuffer = await fileRes.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')
        const contentType = fileRes.headers.get('content-type') || 'application/pdf'
        const isPdf = contentType.includes('pdf')
        const isImage = contentType.startsWith('image/')

        if (isPdf) {
          messageContent = [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            { type: 'text', text: `Extract all clinical information from this document (${fileName}).` },
          ]
        } else if (isImage) {
          const mediaType = contentType.startsWith('image/jpeg') ? 'image/jpeg' :
                           contentType.startsWith('image/png') ? 'image/png' : 'image/jpeg'
          messageContent = [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            { type: 'text', text: `Extract all clinical information from this document image (${fileName}).` },
          ]
        } else {
          throw new Error('Unsupported file type')
        }
      } catch {
        // URL fetch failed — return minimal extraction
        return NextResponse.json({
          extracted: {
            key_findings: `Document uploaded: ${fileName}. Text content could not be extracted automatically — please review manually.`,
            doc_type: 'other',
            assessment_date: new Date().toISOString().split('T')[0],
          }
        })
      }
    } else {
      return NextResponse.json({
        extracted: { key_findings: `No file content provided for ${fileName}`, doc_type: 'other' }
      })
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        thinking: { type: 'disabled' },
        max_tokens: 2000,
        system: EXTRACTION_PROMPT,
        messages: [{ role: 'user', content: messageContent }],
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
