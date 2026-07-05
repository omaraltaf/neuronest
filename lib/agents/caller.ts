import type { ChatMessage } from '@/types'
import { resolveModel } from '@/lib/agents/models'

export interface AgentCallParams {
  systemPrompt: string
  childContext: string
  messages: ChatMessage[]
  maxTokens?: number
}

export interface AgentCallResult {
  text: string
  error?: string
}

export async function callAgent(params: AgentCallParams): Promise<AgentCallResult> {
  const { systemPrompt, childContext, messages, maxTokens = 1500 } = params

  // Build the message history for the API
  // Filter to last 20 messages to stay within context
  const recentMessages = messages.slice(-20)

  // Ensure alternating user/assistant — Claude requires this
  const apiMessages: { role: 'user' | 'assistant'; content: string }[] = []
  for (const msg of recentMessages) {
    if (apiMessages.length === 0 && msg.role === 'assistant') continue
    const lastRole = apiMessages.at(-1)?.role
    if (lastRole === msg.role) continue // skip duplicate roles
    apiMessages.push({ role: msg.role, content: msg.content })
  }

  if (apiMessages.length === 0) return { text: '', error: 'No messages to send' }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: await resolveModel('standard'),
        thinking: { type: 'disabled' },
        max_tokens: maxTokens,
        system: `${systemPrompt}\n\n${childContext}`,
        messages: apiMessages,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic API error:', err)
      return { text: '', error: `API error: ${response.status}` }
    }

    const data = await response.json()
    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || ''
    return { text }
  } catch (err) {
    console.error('callAgent error:', err)
    return { text: '', error: 'Network error' }
  }
}

/**
 * Extract JSON from agent response (agents output structured JSON + conversation text)
 */
export function extractJSON<T>(text: string): T | null {
  try {
    // Try to find JSON block in the response
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) ||
                      text.match(/\{[\s\S]*\}/) ||
                      text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return null
    const jsonStr = jsonMatch[1] || jsonMatch[0]
    return JSON.parse(jsonStr) as T
  } catch {
    return null
  }
}

/**
 * Extract confidence update from intake agent response
 */
export function extractConfidenceUpdate(text: string): Record<string, number> | null {
  try {
    const match = text.match(/"confidence_update"\s*:\s*(\{[^}]+\})/)
    if (!match) return null
    return JSON.parse(match[1]) as Record<string, number>
  } catch {
    return null
  }
}

/**
 * Clean agent response — remove JSON blocks and internal markers from display text
 */
export function cleanAgentResponse(text: string): string {
  return text
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/\{"confidence_update"[\s\S]*?\}/g, '')
    .replace(/\{"ready_for_synthesis"[\s\S]*?\}/g, '')
    .trim()
}
