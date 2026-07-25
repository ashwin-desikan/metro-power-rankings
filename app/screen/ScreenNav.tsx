'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: [string, string][] = [
  ['/screen', 'Hub'],
  ['/screen/rankings', 'Rankings by Metro'],
  ['/screen/countries', 'Rankings by Country'],
  ['/screen/people', 'People'],
  ['/screen/films', 'Films'],
  ['/screen/years', 'Year by Year'],
  ['/screen/number-ones', 'Number Ones'],
  ['/screen/oscars', 'Oscar Winners'],
  ['/screen/academy', 'The Academy'],
  ['/screen/canon', '500 Greatest'],
];

export default function ScreenNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-5 flex flex-wrap gap-1 border-b" style={{ borderColor: 'var(--border, #222b36)' }}>
      {TABS.map(([href, label]) => {
        const active = href === '/screen' ? pathname === '/screen' : pathname.startsWith(href);
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
