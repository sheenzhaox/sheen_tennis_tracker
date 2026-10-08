import { isId, json, type User } from './http';

const TABLES = { players: 'players', ruleSets: 'rule_sets', matches: 'matches', points: 'points' } as const;
type Kind = keyof typeof TABLES;
const KINDS = Object.keys(TABLES) as Kind[];

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
  synced_at: number;
  data: string;
  owner_id?: string | null;
  owner_name?: string | null;
}

const MAX_BODY_BYTES = 2_000_000;
const MAX_RECORDS = 500;
const MAX_RECORD_BYTES = 100_000;
// Re-send recent rows so writes committed slightly out of order are never missed (apply is idempotent).
const PULL_OVERLAP_MS = 60_000;
// Added to match data on pull; never stored from the client.
const SERVER_FIELDS = ['ownerId', 'ownerName'];

function parseRecord(value: unknown): SyncRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.kind !== 'string' || !Object.hasOwn(TABLES, r.kind)) return null;
  if (!isId(r.id)) return null;
  if (typeof r.updatedAt !== 'number' || !Number.isFinite(r.updatedAt)) return null;
  if (r.deletedAt !== null && (typeof r.deletedAt !== 'number' || !Number.isFinite(r.deletedAt))) return null;
  if (typeof r.data !== 'object' || r.data === null || Array.isArray(r.data)) return null;
  if (r.kind === 'points' && !isId((r.data as Record<string, unknown>).matchId)) return null;
  return r as unknown as SyncRecord;
}

function upsert(db: D1Database, r: SyncRecord, syncedAt: number, user: User): D1PreparedStatement {
  const t = TABLES[r.kind];
  const data = { ...r.data };
  for (const f of SERVER_FIELDS) delete data[f];
  // Owner (matches, players) / match id (points) are fixed on insert.
  const extraCol = r.kind === 'matches' || r.kind === 'players' ? ', owner_id' : r.kind === 'points' ? ', match_id' : '';
  const extraVal = extraCol ? ', ?6' : '';
  // SET expressions see the pre-update row, so last-write-wins is decided on the old updated_at.
  const stmt = db.prepare(
    `INSERT INTO ${t} (id, updated_at, deleted_at, synced_at, data${extraCol}) VALUES (?1, ?2, ?3, ?4, ?5${extraVal})
     ON CONFLICT(id) DO UPDATE SET
       data = CASE WHEN excluded.updated_at > ${t}.updated_at THEN excluded.data ELSE ${t}.data END,
       deleted_at = CASE WHEN excluded.updated_at > ${t}.updated_at THEN excluded.deleted_at ELSE ${t}.deleted_at END,
       updated_at = MAX(${t}.updated_at, excluded.updated_at),
       synced_at = excluded.synced_at`,
  );
  const args: unknown[] = [r.id, r.updatedAt, r.deletedAt, syncedAt, JSON.stringify(data)];
  if (r.kind === 'matches') args.push(user.id);
  // Players added by an admin are shared with everyone (NULL owner); others are private to their creator.
  if (r.kind === 'players') args.push(user.role === 'admin' ? null : user.id);
  if (r.kind === 'points') args.push(data.matchId);
  return stmt.bind(...args);
}

/** Re-sends a match's players so users who can see the match also get (possibly private) player names. */
function touchMatchPlayers(db: D1Database, r: SyncRecord, syncedAt: number): D1PreparedStatement {
  return db
    .prepare('UPDATE players SET synced_at = ?1 WHERE id IN (?2, ?3) AND synced_at < ?1')
    .bind(syncedAt, String(r.data.playerAId ?? ''), String(r.data.playerBId ?? ''));
}

/** Matches the user can see: own + granted (admin sees all). `?2` = user id. */
const VISIBLE_MATCHES = `SELECT id FROM matches WHERE owner_id = ?2
  UNION SELECT match_id FROM match_access WHERE user_id = ?2 AND revoked_at IS NULL`;

/** Players the user can see: shared (admin-added), own, and players in matches the user can see. */
const VISIBLE_PLAYERS = `players.owner_id IS NULL OR players.owner_id = ?2 OR players.id IN (
  SELECT json_extract(data, '$.playerAId') FROM matches WHERE id IN (${VISIBLE_MATCHES})
  UNION SELECT json_extract(data, '$.playerBId') FROM matches WHERE id IN (${VISIBLE_MATCHES}))`;

export interface ServerPlayer {
  owner_id: string | null;
  deleted_at: number | null;
}

/** Non-admins may add players, and edit or delete (when not used in a match) only players they added. */
export function canWritePlayer(user: User, r: Pick<SyncRecord, 'deletedAt'>, server: ServerPlayer | undefined, inUse: boolean): boolean {
  if (user.role === 'admin') return true;
  if (!server) return r.deletedAt === null;
  if (server.owner_id !== user.id || server.deleted_at) return false;
  return r.deletedAt === null || !inUse;
}

export function canWriteMatch(user: User, r: Pick<SyncRecord, 'deletedAt'>, server: ServerPlayer | undefined): boolean {
  if (user.role === 'admin') return true;
  if (!server) return true;
  return server.owner_id === user.id && (!server.deleted_at || r.deletedAt !== null);
}

function selectRows(db: D1Database, kind: Kind, user: User, where: string, param: unknown): D1PreparedStatement {
  const admin = user.role === 'admin';
  const base =
    kind === 'matches'
      ? `SELECT m.id, m.updated_at, m.deleted_at, m.synced_at, m.data, m.owner_id, u.username AS owner_name
         FROM matches m LEFT JOIN users u ON u.id = m.owner_id WHERE ${where.replaceAll('{t}', 'm')}`
      : `SELECT id, updated_at, deleted_at, synced_at, data${kind === 'players' ? ', owner_id' : ''} FROM ${TABLES[kind]} WHERE ${where.replaceAll('{t}', TABLES[kind])}`;
  const filter =
    admin || kind === 'ruleSets'
      ? ''
      : kind === 'players'
        ? ` AND (${VISIBLE_PLAYERS})`
        : kind === 'matches'
          ? ` AND m.id IN (${VISIBLE_MATCHES})`
          : ` AND match_id IN (${VISIBLE_MATCHES})`;
  return filter ? db.prepare(base + filter).bind(param, user.id) : db.prepare(base).bind(param);
}

function toRecord(kind: Kind, row: Row): SyncRecord {
  const data = JSON.parse(row.data) as Record<string, unknown>;
  if (kind === 'players') data.ownerId = row.owner_id ?? undefined;
  if (kind === 'matches') {
    data.ownerId = row.owner_id ?? undefined;
    data.ownerName = row.owner_name ?? undefined;
  }
  return { kind, id: row.id, updatedAt: row.updated_at, deletedAt: row.deleted_at, data };
}

/** Non-admins can't touch rule sets and can only write their own players, matches and points. */
async function partition(db: D1Database, user: User, records: SyncRecord[]): Promise<{ allowed: SyncRecord[]; rejected: SyncRecord[] }> {
  const ids = (k: Kind) => JSON.stringify(records.filter((r) => r.kind === k).map((r) => r.id));
  const deletedPlayerIds = JSON.stringify(records.filter((r) => r.kind === 'players' && r.deletedAt !== null).map((r) => r.id));
  const matchIds = JSON.stringify([
    ...new Set(records.flatMap((r) => (r.kind === 'matches' ? [r.id] : r.kind === 'points' ? [r.data.matchId as string] : []))),
  ]);
  const [players, matches, usedPlayers] = await db.batch<{ id: string; deleted_at: number | null; owner_id: string | null }>([
    db.prepare('SELECT id, deleted_at, owner_id FROM players WHERE id IN (SELECT value FROM json_each(?1))').bind(ids('players')),
    db.prepare('SELECT id, deleted_at, owner_id FROM matches WHERE id IN (SELECT value FROM json_each(?1))').bind(matchIds),
    db.prepare(
      `SELECT value AS id FROM json_each(?1) WHERE value IN (
         SELECT json_extract(data, '$.playerAId') FROM matches WHERE deleted_at IS NULL
         UNION SELECT json_extract(data, '$.playerBId') FROM matches WHERE deleted_at IS NULL)`,
    ).bind(deletedPlayerIds),
  ]);
  const serverPlayers = new Map(players.results.map((p) => [p.id, p]));
  const inUse = new Set(usedPlayers.results.map((p) => p.id));
  const serverMatches = new Map(matches.results.map((m) => [m.id, m]));
  const ownMatches = new Map(records.filter((r) =>
    r.kind === 'matches' && canWriteMatch(user, r, serverMatches.get(r.id)),
  ).map((r) => [r.id, r.deletedAt]));

  const allowed: SyncRecord[] = [];
  const rejected: SyncRecord[] = [];
  for (const r of records) {
    let ok: boolean;
    if (user.role === 'admin') ok = true;
    else if (r.kind === 'players') ok = canWritePlayer(user, r, serverPlayers.get(r.id), inUse.has(r.id));
    else if (r.kind === 'ruleSets') ok = false;
    else if (r.kind === 'matches') {
      ok = canWriteMatch(user, r, serverMatches.get(r.id));
    } else {
      const matchId = r.data.matchId as string;
      const m = serverMatches.get(matchId);
      ok = ownMatches.has(matchId)
        ? ownMatches.get(matchId) === null || r.deletedAt !== null
        : !!m && m.owner_id === user.id && (!m.deleted_at || r.deletedAt !== null);
    }
    (ok ? allowed : rejected).push(r);
  }
  return { allowed, rejected };
}

export async function sync(req: Request, db: D1Database, user: User): Promise<Response> {
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

  const { allowed, rejected } = await partition(db, user, records);
  const syncedAt = Date.now();
  if (allowed.length) {
    await db.batch([
      ...allowed.map((r) => upsert(db, r, syncedAt, user)),
      ...allowed.filter((r) => r.kind === 'matches' && r.deletedAt !== null).map((r) =>
        db.prepare(
          `UPDATE points SET deleted_at = (SELECT deleted_at FROM matches WHERE id = ?1),
             updated_at = MAX(updated_at + 1, (SELECT deleted_at FROM matches WHERE id = ?1)), synced_at = ?2
           WHERE match_id = ?1 AND deleted_at IS NULL
             AND EXISTS (SELECT 1 FROM matches WHERE id = ?1 AND deleted_at IS NOT NULL)`,
        ).bind(r.id, syncedAt),
      ),
      ...allowed.filter((r) => r.kind === 'matches' && r.deletedAt === null).map((r) => touchMatchPlayers(db, r, syncedAt)),
    ]);
  }

  const pulls = KINDS.map((k) => selectRows(db, k, user, '{t}.synced_at > ?1', since - PULL_OVERLAP_MS));
  // Current server copy of rejected records, so the client can roll back (missing = not visible -> remove locally).
  const rejectedKinds = KINDS.filter((k) => rejected.some((r) => r.kind === k));
  const rollbacks = rejectedKinds.map((k) =>
    selectRows(db, k, user, '{t}.id IN (SELECT value FROM json_each(?1))', JSON.stringify(rejected.filter((r) => r.kind === k).map((r) => r.id))),
  );
  const revokedStmt = db
    .prepare('SELECT match_id, synced_at FROM match_access WHERE user_id = ?2 AND revoked_at IS NOT NULL AND synced_at > ?1')
    .bind(since - PULL_OVERLAP_MS, user.id);
  const results = await db.batch<Row>([...pulls, ...rollbacks]);
  const revoked = user.role === 'admin' ? [] : (await revokedStmt.all<{ match_id: string; synced_at: number }>()).results;

  let cursor = since;
  const out: SyncRecord[] = [];
  KINDS.forEach((k, i) => {
    for (const row of results[i].results) {
      cursor = Math.max(cursor, row.synced_at);
      out.push(toRecord(k, row));
    }
  });
  const rolledBack: SyncRecord[] = [];
  rejectedKinds.forEach((k, i) => rolledBack.push(...results[KINDS.length + i].results.map((row) => toRecord(k, row))));
  for (const r of revoked) cursor = Math.max(cursor, r.synced_at);

  return json({
    cursor,
    records: out,
    rejected: rejected.map((r) => ({ kind: r.kind, id: r.id, server: rolledBack.find((s) => s.kind === r.kind && s.id === r.id) ?? null })),
    revoked: revoked.map((r) => r.match_id),
  });
}
