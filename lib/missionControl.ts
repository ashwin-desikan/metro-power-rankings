// Server-only helpers for the Mission Control admin panel.
// Reads the latest anomaly digest and persists a small distribution queue
// to a local JSON file. This module must never be imported from a client
// component. The admin page is a server component and the mutation API
// routes call these helpers from the server runtime.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import { getRedis } from "./kv";

const PROJECT_ROOT = process.cwd();
const DIGEST_DIR = join(PROJECT_ROOT, "digests");
const DATA_DIR = join(PROJECT_ROOT, "data");
const QUEUE_PATH = join(DATA_DIR, "mission-control.json");
const QUEUE_KEY = "mission-control:queue";

// ---------- Types ----------

export type DigestFinding = {
  slug: string;
  name: string;
  country: string;
  score: number;
  rank: number | null;
  category: "polarity" | "sensitivity" | "obscurity";
  pair_label?: string;
  story_angle: string;
  // polarity-specific
  high_dim?: string;
  high_rank?: number | null;
  low_dim?: string;
  low_rank?: number | null;
  // sensitivity-specific
  dominant_dim?: string;
  share?: number;
  // obscurity-specific
  pop_rank?: number | null;
  multiple?: number;
};

export type Digest = {
  date: string;
  generated_at: string;
  counts: { polarity: number; sensitivity: number; obscurity: number };
  findings: {
    polarity: DigestFinding[];
    sensitivity: DigestFinding[];
    obscurity: DigestFinding[];
  };
};

export type QueueStatus = "draft" | "shipped" | "skipped";

export type QueueEntry = {
  id: string;
  // Source identification — allows us to dedupe and show provenance
  source: {
    digestDate: string; // YYYY-MM-DD
    category: DigestFinding["category"];
    slug: string;
    pairLabel?: string;
  };
  // Display metadata captured at the time of adding
  metroName: string;
  country: string;
  storyAngle: string;
  // Workflow
  channel: "substack" | "linkedin" | "reddit" | "notes" | "other";
  status: QueueStatus;
  notes?: string;
  statusReason?: string; // populated when skipped
  // Timestamps (ISO 8601 UTC)
  createdAt: string;
  updatedAt: string;
};

export type QueueFile = {
  version: 1;
  entries: QueueEntry[];
};

// ---------- Digest reading ----------

export function listDigestDates(): string[] {
  if (!existsSync(DIGEST_DIR)) return [];
  return readdirSync(DIGEST_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort()
    .reverse();
}

export function loadDigest(date: string): Digest | null {
  // Defense in depth: never let a non-ISO date reach the path join, so this
  // function is traversal-safe regardless of caller.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const path = join(DIGEST_DIR, `${date}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as Digest;
  } catch {
    return null;
  }
}

export function loadLatestDigest(): Digest | null {
  const dates = listDigestDates();
  if (dates.length === 0) return null;
  return loadDigest(dates[0]);
}

// Stable identifier for a finding so we can dedupe queue adds
export function findingId(date: string, f: DigestFinding): string {
  const pair = f.pair_label ?? f.dominant_dim ?? "obscurity";
  return `${date}::${f.category}::${f.slug}::${pair}`;
}

// ---------- Queue persistence ----------

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export async function loadQueue(): Promise<QueueFile> {
  const client = getRedis();
  if (client) {
    try {
      const data = await client.get<QueueFile>(QUEUE_KEY);
      if (data && data.version === 1 && Array.isArray(data.entries)) {
        return data;
      }
    } catch {
      // Transient KV error: treat as empty rather than crashing the panel.
    }
    return { version: 1, entries: [] };
  }
  // Local-dev fallback: JSON file under data/.
  if (!existsSync(QUEUE_PATH)) {
    return { version: 1, entries: [] };
  }
  try {
    const raw = readFileSync(QUEUE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as QueueFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    return parsed;
  } catch {
    return { version: 1, entries: [] };
  }
}

async function saveQueue(queue: QueueFile): Promise<void> {
  const client = getRedis();
  if (client) {
    await client.set(QUEUE_KEY, queue);
    return;
  }
  // Local-dev fallback: atomic-ish file write.
  ensureDataDir();
  // Atomic-ish write: write to tmp, rename. Avoids leaving a half-written
  // file if the process is killed mid-write.
  const tmp = `${QUEUE_PATH}.tmp-${randomBytes(4).toString("hex")}`;
  writeFileSync(tmp, JSON.stringify(queue, null, 2), "utf-8");
  // fs.renameSync is atomic on POSIX within the same filesystem
  // and replaces the target on Windows. Both behaviors are acceptable here.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { renameSync, unlinkSync } = require("fs") as typeof import("fs");
    try {
      renameSync(tmp, QUEUE_PATH);
    } catch {
      // Fallback: copy + remove tmp (some sandboxes block rename across FS)
      writeFileSync(QUEUE_PATH, readFileSync(tmp, "utf-8"), "utf-8");
      unlinkSync(tmp);
    }
  } catch {
    // Last-ditch: best-effort direct write
    writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), "utf-8");
  }
}

// ---------- Queue mutations ----------

export type AddInput = {
  source: QueueEntry["source"];
  metroName: string;
  country: string;
  storyAngle: string;
  channel?: QueueEntry["channel"];
  notes?: string;
};

export async function addToQueue(input: AddInput): Promise<QueueEntry> {
  const queue = await loadQueue();
  const now = new Date().toISOString();
  const id = randomBytes(6).toString("hex");
  const entry: QueueEntry = {
    id,
    source: input.source,
    metroName: input.metroName,
    country: input.country,
    storyAngle: input.storyAngle,
    channel: input.channel ?? "substack",
    status: "draft",
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
  queue.entries.unshift(entry);
  await saveQueue(queue);
  return entry;
}

export async function updateEntry(
  id: string,
  patch: Partial<Pick<QueueEntry, "status" | "channel" | "notes" | "statusReason">>,
): Promise<QueueEntry | null> {
  const queue = await loadQueue();
  const idx = queue.entries.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const updated: QueueEntry = {
    ...queue.entries[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  queue.entries[idx] = updated;
  await saveQueue(queue);
  return updated;
}

export async function deleteEntry(id: string): Promise<boolean> {
  const queue = await loadQueue();
  const before = queue.entries.length;
  queue.entries = queue.entries.filter((e) => e.id !== id);
  if (queue.entries.length === before) return false;
  await saveQueue(queue);
  return true;
}

export async function isAlreadyQueued(sourceId: string): Promise<boolean> {
  const queue = await loadQueue();
  return queue.entries.some(
    (e) =>
      `${e.source.digestDate}::${e.source.category}::${e.source.slug}::${
        e.source.pairLabel ?? "obscurity"
      }` === sourceId,
  );
}
