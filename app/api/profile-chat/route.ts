import { NextRequest, NextResponse } from 'next/server'
import { INTAKE_AGENT_PROMPT } from '@/lib/agents/prompts'
import type { ChatMessage } from '@/types'

export async function POST(req: NextRequest) {
  const {
    messages,
    sectionKey,
    sectionTitle,
    currentContent,
    childName,
    childContext,
    allSections,
  } = await req.json()

  const systemPrompt = `${INTAKE_AGENT_PROMPT}

You are now in PROFILE REVIEW MODE. You have already completed the intake interview and Dr. Okafor has generated a profile. You are discussing the "${sectionTitle}" section with the parent.

CURRENT SECTION CONTENT:
${currentContent}

FULL PROFILE CONTEXT:
${(allSections as { key: string; title: string; content: string }[]).map(s => `${s.title}:\n${s.content}`).join('\n\n---\n\n')}

${childContext}

YOUR ROLE IN THIS CONVERSATION:
- You are Dr. Sarah Chen reviewing your own findings with the parent
- Listen carefully to what the parent says — they know ${childName} better than any assessment
- Ask follow-up questions if something needs clarification
- If the parent corrects or adds information, acknowledge it warmly and revise your understanding
- When you have enough new information to update the section, revise it

RESPONSE FORMAT:
1. Your conversational response to the parent (warm, specific, clinical but human)
2. If the section content should be updated based on this conversation, output EXACTLY this on a new line:
UPDATED_SECTION: [the complete updated section text, replacing the old content entirely]

Only output UPDATED_SECTION if there is genuinely new information that changes the profile. Do not output it just to acknowledge the conversation.`

  const apiMessages = (messages as ChatMessage[])
    .slice(-20)
    .reduce((acc: { role: string; content: string }[], msg) => {
      if (acc.length === 0 && msg.role === 'assistant') return acc
      const lastRole = acc.at(-1)?.role
      if (lastRole === msg.role) return acc
      return [...acc, { role: msg.role, content: msg.content }]
    }, [])

  if (!apiMessages.length) {
    return NextResponse.json({ text: 'How can I help you with this section?', updatedContent: null })
  }

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
        system: systemPrompt,
        messages: apiMessages,
      }),
    })

    const data = await res.json()
    const rawText = data.content?.find((c: { type: string }) => c.type === 'text')?.text || ''

    // Extract updated section if present
    let updatedContent: string | null = null
    let displayText = rawText

    const updateMatch = rawText.match(/UPDATED_SECTION:\s*([\s\S]+?)(?:\n\nUPDATED_SECTION:|$)/)
    if (updateMatch) {
      updatedContent = updateMatch[1].trim()
      displayText = rawText.replace(/UPDATED_SECTION:[\s\S]+$/, '').trim()
    }

    // Add update notice to display text if content was revised
    if (updatedContent) {
      displayText = displayText + '\n\n✏️ I\'ve updated the ' + sectionTitle + ' section based on what you\'ve shared.'
    }

    return NextResponse.json({ text: displayText, updatedContent })
  } catch (err) {
    console.error('Profile chat error:', err)
    return NextResponse.json({
      text: 'I had a connection issue. Please try again.',
      updatedContent: null,
    }, { status: 500 })
  }
}
