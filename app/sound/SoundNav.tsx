'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: [string, string][] = [
  ['/sound', 'Hub'],
  ['/sound/charts', 'Live Charts'],
  ['/sound/rankings', 'Rankings by Metro'],
  ['/sound/artists', 'Artists'],
  ['/sound/grammys', 'Awards History'],
  ['/sound/decades', 'Decades'],
  ['/sound/scenes', 'Scenes'],
  ['/sound/rolling-stone-500', 'RS 500'],
  ['/sound/velvet-rock', 'Velvet Rock'],
];

export default function SoundNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-5 flex flex-wrap gap-1 border-b" style={{ borderColor: 'var(--border, #222b36)' }}>
      {TABS.map(([href, label]) => {
        const active = href === '/sound' ? pathname === '/sound' : pathname.startsWith(href);
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
