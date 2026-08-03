'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// /business hub tab nav, same idiom as SoundNav/ScreenNav: subroutes with an
// active underline. Add a tab here when a new board ships.
const TABS: [string, string][] = [
  ['/business', 'Overview'],
  ['/business/companies', 'Companies'],
  ['/business/private', 'Private & Unicorns'],
  ['/business/sp500', 'S&P 500'],
  ['/business/owners', 'Owners'],
  ['/business/markets', 'Markets'],
  ['/business/currencies', 'Currencies'],
  ['/business/leaders', 'Leaders'],
  ['/business/crossovers', 'Crossovers'],
];

export default function BusinessNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b" style={{ borderColor: 'var(--border, #222b36)' }}>
      {TABS.map(([href, label]) => {
        const active = href === '/business' ? pathname === '/business' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="px-3 py-2 text-sm font-semibold"
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
