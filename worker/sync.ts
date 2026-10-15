import { isId, json, type User } from './http';
import { bumpAccess, VISIBLE_MATCHES, VISIBLE_PLAYERS } from './access';
import { isPlayerEmail } from '../src/model/types';

const TABLES = { players: 'players', ruleSets: 'rule_sets', matches: 'matches', points: 'points', clubs: 'clubs' } as const;
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
  created_by?: string | null;
  linked_user_id?: string | null;
  club_ids?: string;
  private_notes?: string | null;
  private_notes_updated_at?: number | null;
}

const MAX_BODY_BYTES = 2_000_000;
const MAX_RECORDS = 500;
const MAX_RECORD_BYTES = 100_000;
// Re-send recent rows so writes committed slightly out of order are never missed (apply is idempotent).
const PULL_OVERLAP_MS = 60_000;
// Added to match data on pull; never stored from the client.
const SERVER_FIELDS = ['ownerId', 'ownerName', 'createdById', 'linkedUserId', 'clubIds', 'club', 'notes', 'notesUpdatedAt', 'notesOnly', 'referenceOnly'];

function parseRecord(value: unknown): SyncRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.kind !== 'string' || !Object.hasOwn(TABLES, r.kind)) return null;
  if (!isId(r.id)) return null;
  if (typeof r.updatedAt !== 'number' || !Number.isFinite(r.updatedAt)) return null;
  if (r.deletedAt !== null && (typeof r.deletedAt !== 'number' || !Number.isFinite(r.deletedAt))) return null;
  if (typeof r.data !== 'object' || r.data === null || Array.isArray(r.data)) return null;
  if ((r.data as Record<string, unknown>).id !== r.id) return null;
  if (r.kind === 'points' && !isId((r.data as Record<string, unknown>).matchId)) return null;
  if (r.kind === 'matches' && (!isId((r.data as Record<string, unknown>).playerAId)
    || !isId((r.data as Record<string, unknown>).playerBId)
    || (r.data as Record<string, unknown>).playerAId === (r.data as Record<string, unknown>).playerBId)) return null;
  return r as unknown as SyncRecord;
}

function upsert(db: D1Database, r: SyncRecord, syncedAt: number, user: User): D1PreparedStatement {
  if (r.kind === 'players' && r.data.notesOnly === true) {
    return db.prepare('UPDATE players SET synced_at = ?2 WHERE id = ?1').bind(r.id, syncedAt);
  }
  const t = TABLES[r.kind];
  const data = { ...r.data };
  for (const f of r.kind === 'players' ? SERVER_FIELDS : ['ownerId', 'ownerName']) delete data[f];
  // Owner (matches, players) / match id (points) are fixed on insert.
  const extraCol = r.kind === 'players' ? ', owner_id, created_by' : r.kind === 'matches' ? ', owner_id' : r.kind === 'points' ? ', match_id' : '';
  const extraVal = r.kind === 'players' ? ', ?6, ?7' : extraCol ? ', ?6' : '';
  const updatedData = r.kind === 'players'
    ? `CASE WHEN json_type(excluded.data, '$.gender') IS NULL AND json_type(players.data, '$.gender') = 'text'
       THEN json_set(excluded.data, '$.gender', json_extract(players.data, '$.gender')) ELSE excluded.data END`
    : 'excluded.data';
  // SET expressions see the pre-update row, so last-write-wins is decided on the old updated_at.
  const stmt = db.prepare(
    `INSERT INTO ${t} (id, updated_at, deleted_at, synced_at, data${extraCol}) VALUES (?1, ?2, ?3, ?4, ?5${extraVal})
     ON CONFLICT(id) DO UPDATE SET
       data = CASE WHEN excluded.updated_at > ${t}.updated_at THEN ${updatedData} ELSE ${t}.data END,
       deleted_at = CASE WHEN excluded.updated_at > ${t}.updated_at THEN excluded.deleted_at ELSE ${t}.deleted_at END,
       updated_at = MAX(${t}.updated_at, excluded.updated_at),
       synced_at = excluded.synced_at`,
  );
  const args: unknown[] = [r.id, r.updatedAt, r.deletedAt, syncedAt, JSON.stringify(data)];
  if (r.kind === 'matches') args.push(user.id);
  // Admins default to system players, but may explicitly create their own private match players.
  if (r.kind === 'players') args.push(user.role === 'admin' && r.data.ownerId !== user.id ? null : user.id, user.id);
  if (r.kind === 'points') args.push(data.matchId);
  return stmt.bind(...args);
}

/** Re-sends a match's players so users who can see the match also get (possibly private) player names. */
function touchMatchPlayers(db: D1Database, r: SyncRecord, syncedAt: number): D1PreparedStatement {
  return db
    .prepare('UPDATE players SET synced_at = ?1 WHERE id IN (?2, ?3) AND synced_at < ?1')
    .bind(syncedAt, String(r.data.playerAId ?? ''), String(r.data.playerBId ?? ''));
}

export interface ServerPlayer {
  owner_id: string | null;
  deleted_at: number | null;
  linked_user_id?: string | null;
  visible?: number;
}

/** Linked system profiles are editable; private owners may delete only unused players. */
export function canWritePlayer(user: User, r: Pick<SyncRecord, 'deletedAt'>, server: ServerPlayer | undefined, inUse: boolean): boolean {
  if (user.role === 'admin') return true;
  if (!server) return r.deletedAt === null;
  if (server.deleted_at) return false;
  if (server.owner_id === null && server.linked_user_id === user.id) return r.deletedAt === null;
  if (server.owner_id !== user.id) return false;
  return r.deletedAt === null || !inUse;
}

export function canWriteMatch(user: User, r: Pick<SyncRecord, 'deletedAt'>, server: ServerPlayer | undefined): boolean {
  if (user.role === 'admin') return true;
  if (!server) return true;
  return server.owner_id === user.id && (!server.deleted_at || r.deletedAt !== null);
}

function playerError(r: SyncRecord, server: ServerPlayer | undefined): string | undefined {
  if (r.deletedAt !== null) return server?.linked_user_id ? 'Unlink the player from their account before deleting them.' : undefined;
  const invalid = (r.data.notesOnly !== true && (
    typeof r.data.name !== 'string' || !r.data.name.trim() || r.data.name.length > 200
    || (r.data.gender !== undefined && r.data.gender !== 'male' && r.data.gender !== 'female')
    || (r.data.email !== undefined && !isPlayerEmail(r.data.email))
  )) || (r.data.notesOnly === true && typeof r.data.notes !== 'string')
    || (r.data.notes !== undefined && (typeof r.data.notes !== 'string' || r.data.notes.length > 20_000))
    || (r.data.notesUpdatedAt !== undefined && (typeof r.data.notesUpdatedAt !== 'number' || !Number.isFinite(r.data.notesUpdatedAt)));
  return invalid ? 'Player name is required; gender, when provided, must be Male/Female. Check email and private notes.' : undefined;
}

function selectRows(db: D1Database, kind: Kind, user: User, where: string, param: unknown): D1PreparedStatement {
  const admin = user.role === 'admin';
  const base =
    kind === 'matches'
      ? `SELECT m.id, m.updated_at, m.deleted_at, m.synced_at, m.data, m.owner_id, u.username AS owner_name
         FROM matches m LEFT JOIN users u ON u.id = m.owner_id WHERE ${where.replaceAll('{t}', 'm')}`
      : kind === 'players' ? `SELECT id, updated_at, deleted_at, synced_at, data, owner_id, created_by,
          (SELECT id FROM users WHERE player_id = players.id) AS linked_user_id,
          (SELECT json_group_array(pc.club_id) FROM player_clubs pc JOIN clubs c ON c.id = pc.club_id
           WHERE pc.player_id = players.id AND c.deleted_at IS NULL) AS club_ids,
          (SELECT notes FROM player_notes WHERE player_id = players.id AND user_id = ?2) AS private_notes,
          (SELECT updated_at FROM player_notes WHERE player_id = players.id AND user_id = ?2) AS private_notes_updated_at
         FROM players WHERE ${where.replaceAll('{t}', 'players')}`
        : `SELECT id, updated_at, deleted_at, synced_at, data FROM ${TABLES[kind]} WHERE ${where.replaceAll('{t}', TABLES[kind])}`;
  const filter =
    admin || kind === 'ruleSets' || kind === 'clubs'
      ? ''
      : kind === 'players'
        ? ` AND (${VISIBLE_PLAYERS})`
        : kind === 'matches'
          ? ` AND m.id IN (${VISIBLE_MATCHES})`
          : ` AND match_id IN (${VISIBLE_MATCHES})`;
  return filter || kind === 'players' ? db.prepare(base + filter).bind(param, user.id) : db.prepare(base).bind(param);
}

function toRecord(kind: Kind, row: Row, user: User): SyncRecord {
  const original = JSON.parse(row.data) as Record<string, unknown>;
  const data: Record<string, unknown> = kind === 'players' && row.owner_id && row.owner_id !== user.id && user.role !== 'admin'
    ? { id: row.id, name: original.name, createdAt: original.createdAt, updatedAt: original.updatedAt, referenceOnly: true }
    : original;
  if (kind === 'players') {
    data.ownerId = row.owner_id ?? undefined;
    data.createdById = row.created_by ?? undefined;
    data.linkedUserId = row.linked_user_id ?? undefined;
    data.clubIds = JSON.parse(row.club_ids ?? '[]') as string[];
    data.notes = row.private_notes ?? '';
    data.notesUpdatedAt = row.private_notes_updated_at ?? 0;
    if (user.role !== 'admin' && row.owner_id !== user.id && row.linked_user_id !== user.id) delete data.email;
  }
  if (kind === 'matches') {
    data.ownerId = row.owner_id ?? undefined;
    data.ownerName = row.owner_name ?? undefined;
  }
  return { kind, id: row.id, updatedAt: row.updated_at, deletedAt: row.deleted_at, data };
}

/** Non-admins can't touch rule sets and can only write their own players, matches and points. */
async function partition(db: D1Database, user: User, records: SyncRecord[]): Promise<{ allowed: SyncRecord[]; rejected: SyncRecord[]; reasons: Map<string, string>; accessChanged: boolean }> {
  const deletedPlayerIds = JSON.stringify(records.filter((r) => r.kind === 'players' && r.deletedAt !== null).map((r) => r.id));
  const matchIds = JSON.stringify([
    ...new Set(records.flatMap((r) => (r.kind === 'matches' ? [r.id] : r.kind === 'points' ? [r.data.matchId as string] : []))),
  ]);
  const playerIds = JSON.stringify([...new Set(records.flatMap((r) =>
    r.kind === 'players' ? [r.id] : r.kind === 'matches' ? [r.data.playerAId, r.data.playerBId] : []))]);
  const [players, matches, usedPlayers] = await db.batch<{ id: string; deleted_at: number | null; owner_id: string | null; linked_user_id?: string | null; visible?: number; data?: string }>([
    db.prepare(`SELECT id, deleted_at, owner_id, (SELECT id FROM users WHERE player_id = players.id) AS linked_user_id,
      CASE WHEN (${VISIBLE_PLAYERS}) THEN 1 ELSE 0 END AS visible
      FROM players WHERE id IN (SELECT value FROM json_each(?1))`).bind(playerIds, user.id),
    db.prepare('SELECT id, deleted_at, owner_id, data FROM matches WHERE id IN (SELECT value FROM json_each(?1))').bind(matchIds),
    db.prepare(
      `SELECT value AS id FROM json_each(?1) WHERE value IN (
         SELECT json_extract(data, '$.playerAId') FROM matches WHERE deleted_at IS NULL
         UNION SELECT json_extract(data, '$.playerBId') FROM matches WHERE deleted_at IS NULL)`,
    ).bind(deletedPlayerIds),
  ]);
  const serverPlayers = new Map(players.results.map((p) => [p.id, p]));
  const inUse = new Set(usedPlayers.results.map((p) => p.id));
  const serverMatches = new Map(matches.results.map((m) => [m.id, m]));
  for (const r of records.filter((record) => record.kind === 'matches' && record.deletedAt === null)) {
    if (canWriteMatch(user, r, serverMatches.get(r.id))) {
      inUse.add(String(r.data.playerAId));
      inUse.add(String(r.data.playerBId));
    }
  }
  const playerReasons = new Map<SyncRecord, string | undefined>();
  const newPlayers = new Set<string>();
  for (const r of records.filter((record) => record.kind === 'players')) {
    const server = serverPlayers.get(r.id);
    const permitted = r.data.notesOnly === true
      ? !!server && !server.deleted_at && r.deletedAt === null && (user.role === 'admin' || server.visible === 1)
      : canWritePlayer(user, r, server, inUse.has(r.id));
    const error = permitted ? playerError(r, server) : 'You do not have permission to change this player.';
    playerReasons.set(r, error);
    if (!error && !server && r.deletedAt === null) newPlayers.add(r.id);
  }
  const validParticipants = (r: SyncRecord) => {
    if (r.deletedAt !== null) return true;
    const existing = serverMatches.get(r.id);
    const previous = existing?.data ? JSON.parse(existing.data) as Record<string, unknown> : undefined;
    return [r.data.playerAId, r.data.playerBId].every((id) => {
      if (typeof id !== 'string') return false;
      const player = serverPlayers.get(id);
      return (previous && (id === previous.playerAId || id === previous.playerBId))
        || newPlayers.has(id) || (!!player && !player.deleted_at
          && (user.role === 'admin' || player.owner_id === null || player.owner_id === user.id));
    });
  };
  const ownMatches = new Map(records.filter((r) =>
    r.kind === 'matches' && canWriteMatch(user, r, serverMatches.get(r.id)) && validParticipants(r),
  ).map((r) => [r.id, r.deletedAt]));

  const allowed: SyncRecord[] = [];
  const rejected: SyncRecord[] = [];
  const reasons = new Map<string, string>();
  for (const r of records) {
    let ok: boolean;
    let reason = 'You do not have permission to change this record.';
    if (r.kind === 'clubs') ok = false;
    else if (r.kind === 'players') { reason = playerReasons.get(r) ?? ''; ok = !reason; }
    else if (r.kind === 'points') {
      const matchId = r.data.matchId as string;
      const m = serverMatches.get(matchId);
      ok = ownMatches.has(matchId)
        ? ownMatches.get(matchId) === null || r.deletedAt !== null
        : !!m && (user.role === 'admin' || m.owner_id === user.id) && (!m.deleted_at || r.deletedAt !== null);
    }
    else if (user.role === 'admin') ok = true;
    else if (r.kind === 'ruleSets') ok = false;
    else ok = canWriteMatch(user, r, serverMatches.get(r.id));
    if (ok && r.kind === 'matches' && !validParticipants(r)) {
      ok = false;
      reason = 'Choose existing system players or players you added yourself.';
    }
    if (!ok) reasons.set(`${r.kind}:${r.id}`, reason);
    (ok ? allowed : rejected).push(r);
  }
  const accessChanged = allowed.some((r) => {
    const player = r.kind === 'players' ? serverPlayers.get(r.id) : undefined;
    return player?.owner_id === null && (r.deletedAt !== null) !== (player.deleted_at !== null);
  });
  return { allowed, rejected, reasons, accessChanged };
}

export async function sync(req: Request, db: D1Database, user: User): Promise<Response> {
  if (!req.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'expected JSON' }, 415);
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'too large' }, 413);

  let body: { since?: unknown; records?: unknown; accessRevision?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const version = await db.prepare('SELECT revision FROM access_version WHERE id = 1').first<{ revision: number }>();
  if (!version) throw new Error('Club/profile database migration is required.');
  let since = body.role === user.role && body.accessRevision === version.revision
    && typeof body.since === 'number' && Number.isFinite(body.since) ? body.since : 0;
  const input = Array.isArray(body.records) ? body.records : [];
  if (input.length > MAX_RECORDS) return json({ error: 'too many records' }, 413);

  const records: SyncRecord[] = [];
  for (const value of input) {
    const r = parseRecord(value);
    if (!r || JSON.stringify(r.data).length > MAX_RECORD_BYTES) return json({ error: 'invalid record' }, 400);
    records.push(r);
  }

  const { allowed, rejected, reasons, accessChanged } = await partition(db, user, records);
  const syncedAt = Date.now();
  if (allowed.length) {
    await db.batch([
      ...allowed.map((r) => upsert(db, r, syncedAt, user)),
      ...allowed.filter((r) => r.kind === 'players' && r.deletedAt === null && typeof r.data.notes === 'string').map((r) =>
        db.prepare(`INSERT INTO player_notes (player_id, user_id, notes, updated_at) VALUES (?1, ?2, ?3, ?4)
          ON CONFLICT (player_id, user_id) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at
          WHERE excluded.updated_at > player_notes.updated_at`)
          .bind(r.id, user.id, r.data.notes, r.data.notesUpdatedAt ?? r.updatedAt),
      ),
      ...allowed.filter((r) => r.kind === 'matches' && r.deletedAt !== null).map((r) =>
        db.prepare(
          `UPDATE points SET deleted_at = (SELECT deleted_at FROM matches WHERE id = ?1),
             updated_at = MAX(updated_at + 1, (SELECT deleted_at FROM matches WHERE id = ?1)), synced_at = ?2
           WHERE match_id = ?1 AND deleted_at IS NULL
             AND EXISTS (SELECT 1 FROM matches WHERE id = ?1 AND deleted_at IS NOT NULL)`,
        ).bind(r.id, syncedAt),
      ),
      ...allowed.filter((r) => r.kind === 'matches' && r.deletedAt === null).map((r) => touchMatchPlayers(db, r, syncedAt)),
      ...(accessChanged ? [bumpAccess(db)] : []),
    ]);
  }
  if (accessChanged) {
    since = 0;
    version.revision++;
  }

  const pulls = KINDS.map((k) => selectRows(db, k, user, '{t}.synced_at > ?1', since - PULL_OVERLAP_MS));
  // Current server copy of rejected records, so the client can roll back (missing = not visible -> remove locally).
  const rejectedKinds = KINDS.filter((k) => rejected.some((r) => r.kind === k));
  const rollbacks = rejectedKinds.map((k) =>
    selectRows(db, k, user, '{t}.id IN (SELECT value FROM json_each(?1))', JSON.stringify(rejected.filter((r) => r.kind === k).map((r) => r.id))),
  );
  const revokedStmt = db
    .prepare(`SELECT match_id, synced_at FROM match_access WHERE user_id = ?2 AND revoked_at IS NOT NULL
      AND synced_at > ?1 AND match_id NOT IN (${VISIBLE_MATCHES})`)
    .bind(since - PULL_OVERLAP_MS, user.id);
  const results = await db.batch<Row>([...pulls, ...rollbacks]);
  const revoked = user.role === 'admin' ? [] : (await revokedStmt.all<{ match_id: string; synced_at: number }>()).results;

  let cursor = since;
  const out: SyncRecord[] = [];
  KINDS.forEach((k, i) => {
    for (const row of results[i].results) {
      cursor = Math.max(cursor, row.synced_at);
      out.push(toRecord(k, row, user));
    }
  });
  const rolledBack: SyncRecord[] = [];
  rejectedKinds.forEach((k, i) => rolledBack.push(...results[KINDS.length + i].results.map((row) => toRecord(k, row, user))));
  for (const r of revoked) cursor = Math.max(cursor, r.synced_at);

  const [visibleMatches, visiblePlayers] = await db.batch<{ id: string }>([
    user.role === 'admin' ? db.prepare('SELECT id FROM matches')
      : db.prepare(`SELECT id FROM matches WHERE id IN (${VISIBLE_MATCHES})`).bind(0, user.id),
    user.role === 'admin' ? db.prepare('SELECT id FROM players')
      : db.prepare(`SELECT id FROM players WHERE ${VISIBLE_PLAYERS}`).bind(0, user.id),
  ]);
  return json({
    cursor,
    records: out,
    rejected: rejected.map((r) => ({ kind: r.kind, id: r.id, reason: reasons.get(`${r.kind}:${r.id}`), server: rolledBack.find((s) => s.kind === r.kind && s.id === r.id) ?? null })),
    revoked: revoked.map((r) => r.match_id),
    visibleMatchIds: visibleMatches.results.map((r) => r.id),
    visiblePlayerIds: visiblePlayers.results.map((r) => r.id),
    accessRevision: version.revision,
    user,
  });
}
