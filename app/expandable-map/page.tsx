import { getAllMetros } from '@/lib/data';
import ExpandableMapClient from './ExpandableMapClient';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  // The layout title template appends the site name; hardcoding it here
  // doubled the suffix in shares (share-consistency pass, 2026-08-03).
  title: 'Expandable Map',
  description:
    'Interactive full-corpus map of every metro area. Filter by continent, region, and search; resize the canvas to any height; viewport and filters persist across sessions.',
};

export default function ExpandableMapPage() {
  const metros = getAllMetros();
  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <ExpandableMapClient metros={metros} />
    </main>
  );
}
