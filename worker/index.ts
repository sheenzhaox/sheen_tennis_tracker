interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ENVIRONMENT: string;
  API_TOKEN?: string;
}

const TABLES = { players: 'players', ruleSets: 'rule_sets', matches: 'matches' } as const;
type Kind = keyof typeof TABLES;

interface SyncRecord {
  kind: Kind;
  id: string;
  updatedAt: number;
  deletedAt: number | null;
  data: Record<string, unknown>;
}

interface Row {
  id: string;
  updated_at: number;
  deleted_at: number | null;
  data: string;
}

const MAX_BODY_BYTES = 2_000_000;
const MAX_RECORDS = 500;
const MAX_RECORD_BYTES = 100_000;
// Re-send recent rows so writes committed slightly out of order are never missed (apply is idempotent).
const PULL_OVERLAP_MS = 60_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

async function authorized(req: Request, env: Env): Promise<boolean> {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!env.API_TOKEN || !token) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(token)),
    crypto.subtle.digest('SHA-256', enc.encode(env.API_TOKEN)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

function parseRecord(value: unknown): SyncRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.kind !== 'string' || !Object.hasOwn(TABLES, r.kind)) return null;
  if (typeof r.id !== 'string' || !/^[\w:-]{1,64}$/.test(r.id)) return null;
  if (typeof r.updatedAt !== 'number' || !Number.isFinite(r.updatedAt)) return null;
  if (r.deletedAt !== null && (typeof r.deletedAt !== 'number' || !Number.isFinite(r.deletedAt))) return null;
  if (typeof r.data !== 'object' || r.data === null || Array.isArray(r.data)) return null;
  return r as unknown as SyncRecord;
}

function upsert(db: D1Database, r: SyncRecord, syncedAt: number): D1PreparedStatement {
  const t = TABLES[r.kind];
  // SET expressions see the pre-update row, so last-write-wins is decided on the old updated_at.
  return db
    .prepare(
      `INSERT INTO ${t} (id, updated_at, deleted_at, synced_at, data) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET
         data = CASE WHEN excluded.updated_at > ${t}.updated_at THEN excluded.data ELSE ${t}.data END,
         deleted_at = CASE WHEN excluded.updated_at > ${t}.updated_at THEN excluded.deleted_at ELSE ${t}.deleted_at END,
         updated_at = MAX(${t}.updated_at, excluded.updated_at),
         synced_at = excluded.synced_at`,
    )
    .bind(r.id, r.updatedAt, r.deletedAt, syncedAt, JSON.stringify(r.data));
}

async function sync(req: Request, db: D1Database): Promise<Response> {
  if (!req.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'expected JSON' }, 415);
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'too large' }, 413);

  let body: { since?: unknown; records?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const since = typeof body.since === 'number' && Number.isFinite(body.since) ? body.since : 0;
  const input = Array.isArray(body.records) ? body.records : [];
  if (input.length > MAX_RECORDS) return json({ error: 'too many records' }, 413);

  const records: SyncRecord[] = [];
  for (const value of input) {
    const r = parseRecord(value);
    if (!r || JSON.stringify(r.data).length > MAX_RECORD_BYTES) return json({ error: 'invalid record' }, 400);
    records.push(r);
  }

  const syncedAt = Date.now();
  if (records.length) await db.batch(records.map((r) => upsert(db, r, syncedAt)));

  const kinds = Object.keys(TABLES) as Kind[];
  const results = await db.batch<Row & { synced_at: number }>(
    kinds.map((k) =>
      db
        .prepare(`SELECT id, updated_at, deleted_at, synced_at, data FROM ${TABLES[k]} WHERE synced_at > ?1`)
        .bind(since - PULL_OVERLAP_MS),
    ),
  );

  let cursor = since;
  const out: SyncRecord[] = [];
  results.forEach((res, i) => {
    for (const row of res.results) {
      cursor = Math.max(cursor, row.synced_at);
      out.push({
        kind: kinds[i],
        id: row.id,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        data: JSON.parse(row.data),
      });
    }
  });
  return json({ cursor, records: out });
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (!(await authorized(req, env))) return json({ error: 'unauthorized' }, 401);

    if (url.pathname === '/api/sync' && req.method === 'POST') return sync(req, env.DB);
    if (url.pathname === '/api/ping' && req.method === 'GET') return json({ ok: true, environment: env.ENVIRONMENT });
    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
