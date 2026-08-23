import { type ReactNode } from 'react'

// Agents write markdown by instinct. Every chat bubble used to render the reply raw
// inside whiteSpace:'pre-wrap', so parents literally saw "**Try this first**" and
// "## Next steps" with the asterisks and hashes showing. This is the one place that
// turns an agent reply into real formatting.
//
// Deliberately tiny and dependency-free — it handles only what the agents actually
// produce (bold, inline code, bullets, numbered lists, headings, paragraphs) rather
// than pulling in a full markdown stack for six chat surfaces. It emits React
// elements, never dangerouslySetInnerHTML, so agent text can never inject markup.

type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'h'; text: string }

const HEADING = /^ {0,3}#{1,6} +(.*)$/
const BULLET = /^ *[-*•] +(.*)$/
const NUMBERED = /^ *\d+[.)] +(.*)$/
const RULE = /^ *([-*_] *){3,}$/

// Inline: **bold** and `code`. Anything else stays literal text.
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /\*\*(.+?)\*\*|`(.+?)`/g
  let last = 0
  let key = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    if (match[1] !== undefined) {
      parts.push(<strong key={key++} className="font-bold">{match[1]}</strong>)
    } else {
      parts.push(<code key={key++} className="px-1 py-0.5 rounded bg-gray-100 text-[0.9em]">{match[2]}</code>)
    }
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function parse(text: string): Block[] {
  const blocks: Block[] = []
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const last = blocks.at(-1)
    if (!line.trim() || RULE.test(line)) { blocks.push({ type: 'p', lines: [] }); continue }

    const heading = line.match(HEADING)
    if (heading) { blocks.push({ type: 'h', text: heading[1] }); continue }

    const bullet = line.match(BULLET)
    if (bullet) {
      if (last?.type === 'ul') last.items.push(bullet[1])
      else blocks.push({ type: 'ul', items: [bullet[1]] })
      continue
    }

    const numbered = line.match(NUMBERED)
    if (numbered) {
      if (last?.type === 'ol') last.items.push(numbered[1])
      else blocks.push({ type: 'ol', items: [numbered[1]] })
      continue
    }

    // Plain prose. Consecutive lines stay in one paragraph so the agent's own
    // line breaks survive, but a blank line always starts a new one.
    if (last?.type === 'p') last.lines.push(line)
    else blocks.push({ type: 'p', lines: [line] })
  }
  return blocks.filter(b => b.type !== 'p' || b.lines.length > 0)
}

export default function AgentText({ text, className = '' }: { text: string; className?: string }) {
  const blocks = parse(text)
  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((block, i) => {
        if (block.type === 'h') {
          return <div key={i} className="font-bold text-[0.95em] pt-0.5">{inline(block.text)}</div>
        }
        if (block.type === 'p') {
          return <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{inline(block.lines.join('\n'))}</p>
        }
        const List = block.type === 'ul' ? 'ul' : 'ol'
        return (
          <List key={i} className={`space-y-1 pl-5 ${block.type === 'ul' ? 'list-disc' : 'list-decimal'} list-outside`}>
            {block.items.map((item, j) => <li key={j}>{inline(item)}</li>)}
          </List>
        )
      })}
    </div>
  )
}
