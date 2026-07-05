'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// The one navigation system (UX_PLAN.md P2). Five stable destinations, one name each,
// present on every parent screen. Child Zone is deliberately absent — it's launched
// for the child from Today, not browsed to as a parent tab.
const TABS = [
  { href: '/dashboard', icon: '🏠', label: 'Today' },
  { href: '/goals', icon: '🎯', label: 'Goals' },
  { href: '/progress', icon: '📈', label: 'Progress' },
  { href: '/content', icon: '📦', label: 'Materials' },
  { href: '/ai', icon: '💬', label: 'Ask' },
]

export default function TabBar({ childId }: { childId: string }) {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-2xl mx-auto flex">
        {TABS.map(tab => {
          const active = pathname === tab.href
          const href = tab.href === '/dashboard' ? tab.href : `${tab.href}?child=${childId}`
          return (
            <Link key={tab.href} href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px]"
              aria-current={active ? 'page' : undefined}>
              <span className={`text-xl leading-none ${active ? '' : 'grayscale opacity-60'}`}>{tab.icon}</span>
              <span className={`text-[11px] font-bold ${active ? 'text-violet-600' : 'text-gray-400'}`}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
