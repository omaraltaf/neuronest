'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Target, Package, MessageCircle } from 'lucide-react'

// The one navigation system (UX_PLAN.md P2, consolidated in Round 2). Four stable
// destinations, one name each, on every parent screen. Child Zone is deliberately
// absent — it's launched for the child from Today, not browsed to as a parent tab.
// Icons are Lucide strokes (Direction B): emoji stay in the Child Zone where play
// is the point, never as the parent app's iconography.
const TABS = [
  { href: '/dashboard', Icon: Home,          label: 'Today' },
  { href: '/goals',     Icon: Target,        label: 'Plan' },
  { href: '/content',   Icon: Package,       label: 'Materials' },
  { href: '/ai',        Icon: MessageCircle, label: 'Ask' },
]

export default function TabBar({ childId }: { childId: string }) {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t-2 border-gray-100"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-2xl mx-auto flex">
        {TABS.map(({ href, Icon, label }) => {
          const active = pathname === href
          // Every tab carries the child id so multi-child selection survives navigation
          return (
            <Link key={href} href={`${href}?child=${childId}`}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[52px]"
              aria-current={active ? 'page' : undefined}>
              <Icon size={21} strokeWidth={active ? 2.6 : 2}
                className={active ? 'text-fjord-600' : 'text-gray-400'} />
              <span className={`text-[11px] font-bold ${active ? 'text-fjord-600' : 'text-gray-400'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
