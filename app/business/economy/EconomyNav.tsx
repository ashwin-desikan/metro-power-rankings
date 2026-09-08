'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Second-level tab row under /business/economy, same idiom as BusinessNav.
// Rates is the only sub-family that has shipped; Prices, Housing, Yields and
// Countries join this list as they ship. Do not render a tab with no page
// behind it.
const TABS: [string, string][] = [
  ['/business/economy', 'Rates'],
];

export default function EconomyNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: 'var(--border, #222b36)' }}>
      {TABS.map(([href, label]) => {
        const active = href === '/business/economy' ? pathname.startsWith('/business/economy') : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="min-h-[44px] inline-flex items-center px-3 text-sm font-semibold"
            style={{
              color: active ? 'var(--text, #e6edf3)' : 'var(--text-muted)',
              borderBottom: active ? '2px solid var(--accent, #4f9dff)' : '2px solid transparent',
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
