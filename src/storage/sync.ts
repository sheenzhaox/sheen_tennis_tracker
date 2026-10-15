import { db, onLocalChange, SYNC_TABLES, type SyncTable } from './db';
import { expireSession, getSession, type SessionUser } from './session';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'signed-out' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncedAt?: number;
  message?: string;
}

interface RemoteRecord {
  kind: SyncTable;
  id: string;
  updatedAt: number;
  deletedAt: number | null;
  data: Record<string, unknown>;
}

interface LocalRecord {
  id: string;
  updatedAt: number;
  deletedAt?: number;
  dirty?: 0 | 1;
  notes?: string;
  notesUpdatedAt?: number;
}

interface SyncResponse {
  cursor: number;
  records: RemoteRecord[];
  /** Changes the server refused (no permission), with the server's copy to roll back to (null = not visible). */
  rejected: { kind: SyncTable; id: string; server: RemoteRecord | null; reason?: string }[];
  /** Match ids whose shared access was removed. */
  revoked: string[];
  visibleMatchIds?: string[];
  visiblePlayerIds?: string[];
  accessRevision?: number;
  user?: SessionUser;
}

const CHUNK_SIZE = 200;
const DEBOUNCE_MS = 1500;
const INTERVAL_MS = 60_000;

let state: SyncState = { status: 'idle' };
const subscribers = new Set<(s: SyncState) => void>();

function setState(next: SyncState) {
  state = next;
  subscribers.forEach((fn) => fn(state));
}

export function subscribeSync(fn: (s: SyncState) => void): () => void {
  subscribers.add(fn);
  fn(state);
  return () => subscribers.delete(fn);
}

let running: Promise<void> | null = null;
let rerun = false;

export function syncNow(): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = doSync().finally(() => {
    running = null;
    if (rerun) {
      rerun = false;
      void syncNow();
    }
  });
  return running;
}

function toRemote(kind: SyncTable, r: LocalRecord & Record<string, unknown>): RemoteRecord {
  const { dirty: _dirty, ...data } = r;
  return { kind, id: r.id, updatedAt: r.updatedAt, deletedAt: r.deletedAt ?? null, data };
}

async function applyResponse(pushed: RemoteRecord[], res: SyncResponse, userId: string) {
  const put = (r: RemoteRecord) =>
    db.table(r.kind).put({ ...r.data, updatedAt: r.updatedAt, deletedAt: r.deletedAt ?? undefined, dirty: 0 });
  await db.transaction('rw', SYNC_TABLES.map((t) => db.table(t)), async () => {
    for (const p of pushed) {
      const local = (await db.table(p.kind).get(p.id)) as LocalRecord | undefined;
      // Only clear the flag if the record wasn't edited again while the request was in flight.
      if (local && local.updatedAt === p.updatedAt && (p.kind !== 'players' || local.notesUpdatedAt === p.data.notesUpdatedAt)) {
        await db.table(p.kind).update(p.id, { dirty: 0, ...(p.kind === 'players' ? { notesOnly: undefined } : {}) });
      }
    }
    for (const r of res.records) {
      if (!SYNC_TABLES.includes(r.kind)) continue;
      const local = (await db.table(r.kind).get(r.id)) as LocalRecord | undefined;
      if (!local || r.updatedAt > local.updatedAt || (r.kind === 'players' && r.data.referenceOnly === true)) {
        await put(r);
        if (r.kind === 'players' && local?.dirty && (local.notesUpdatedAt ?? 0) > Number(r.data.notesUpdatedAt ?? 0)) {
          await db.table(r.kind).update(r.id, { notes: local.notes, notesUpdatedAt: local.notesUpdatedAt, dirty: 1, notesOnly: true });
        }
      }
      else if (r.kind === 'players' || r.kind === 'matches') {
        // Ownership is server-assigned and must arrive even when local content is newer or unchanged.
        const ownerId = r.data.ownerId;
        if (ownerId !== undefined && typeof ownerId !== 'string') throw new Error('Invalid ownership metadata from server.');
        const metadata: { ownerId?: string; ownerName?: string } = { ownerId };
        if (r.kind === 'matches') {
          const ownerName = r.data.ownerName;
          if (ownerName !== undefined && typeof ownerName !== 'string') throw new Error('Invalid owner name from server.');
          metadata.ownerName = ownerName;
        }
        await db.table(r.kind).update(r.id, metadata);
        if (r.kind === 'players' && Array.isArray(r.data.clubIds)) {
          if (!r.data.clubIds.every((id) => typeof id === 'string')) throw new Error('Invalid club metadata from server.');
          await db.table(r.kind).update(r.id, {
            clubIds: r.data.clubIds, linkedUserId: r.data.linkedUserId, createdById: r.data.createdById,
            ...(!local.dirty ? { email: r.data.email } : {}),
          });
        }
        if (r.kind === 'players' && r.data.notesUpdatedAt !== undefined) {
          if (typeof r.data.notesUpdatedAt !== 'number' || !Number.isFinite(r.data.notesUpdatedAt) || typeof r.data.notes !== 'string') {
            throw new Error('Invalid private notes from server.');
          }
          if (!local.dirty || r.data.notesUpdatedAt >= (local.notesUpdatedAt ?? 0)) {
            await db.table(r.kind).update(r.id, { notes: r.data.notes, notesUpdatedAt: r.data.notesUpdatedAt });
          }
        }
      }
    }
    for (const r of res.rejected ?? []) {
      if (!SYNC_TABLES.includes(r.kind)) continue;
      if (r.server) await put(r.server);
      else await db.table(r.kind).delete(r.id);
    }
    for (const matchId of res.revoked ?? []) {
      await db.matches.delete(matchId);
      await db.points.where('matchId').equals(matchId).delete();
    }
    if (res.revoked?.length) {
      // Drop other users' private players that are no longer used by any match visible here.
      const used = new Set((await db.matches.toArray()).flatMap((m) => [m.playerAId, m.playerBId]));
      await db.players.filter((p) => !!p.ownerId && p.ownerId !== userId && !used.has(p.id)).delete();
    }
    if (res.visibleMatchIds && res.visiblePlayerIds) {
      const matches = new Set(res.visibleMatchIds);
      for (const match of await db.matches.toArray()) {
        if (!matches.has(match.id) && !(match.dirty && match.ownerId === userId)) {
          await db.matches.delete(match.id);
          await db.points.where('matchId').equals(match.id).delete();
        }
      }
      const players = new Set(res.visiblePlayerIds);
      for (const player of await db.players.toArray()) {
        if (!players.has(player.id) && !(player.dirty && (player.ownerId === userId || (res.user?.role === 'admin' && !player.ownerId)))) {
          await db.players.delete(player.id);
        }
      }
    }
  });
}

async function doSync(): Promise<void> {
  const session = await getSession();
  if (!session) return setState({ status: 'signed-out' });
  if (!navigator.onLine) return setState({ ...state, status: 'offline' });
  setState({ ...state, status: 'syncing' });

  try {
    const ownershipSynced = (await db.meta.get('ownershipMetadataSynced'))?.value === true;
    // Repair previously skipped ownership, including rows older than the incremental-sync window.
    let since = ownershipSynced ? ((await db.meta.get('cursor'))?.value as number | undefined) ?? 0 : 0;
    const dirty: RemoteRecord[] = [];
    for (const kind of SYNC_TABLES) {
      const rows = (await db.table(kind).where('dirty').equals(1).toArray()) as (LocalRecord & Record<string, unknown>)[];
      dirty.push(...rows.map((r) => toRemote(kind, r)));
    }

    let offset = 0;
    let accessRevision = (await db.meta.get('accessRevision'))?.value;
    let currentUser = session.user;
    const rejections: string[] = [];
    do {
      const chunk = dirty.slice(offset, offset + CHUNK_SIZE);
      offset += CHUNK_SIZE;
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ since, records: chunk, accessRevision, role: currentUser.role }),
      });
      if (res.status === 401) {
        await expireSession();
        return setState({ status: 'signed-out' });
      }
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const body = (await res.json()) as SyncResponse;
      await applyResponse(chunk, body, session.user.id);
      if (body.user) {
        if (body.user.id !== session.user.id) throw new Error('Invalid account metadata from server.');
        currentUser = body.user;
        await db.meta.put({ key: 'session', value: { ...session, user: body.user } });
      }
      if (body.accessRevision !== undefined) {
        accessRevision = body.accessRevision;
        await db.meta.put({ key: 'accessRevision', value: accessRevision });
      }
      for (const rejected of body.rejected ?? []) rejections.push(rejected.reason ?? 'A change was rejected because you no longer have permission.');
      since = body.cursor;
      await db.meta.put({ key: 'cursor', value: since });
    } while (offset < dirty.length);

    await db.meta.put({ key: 'ownershipMetadataSynced', value: true });
    if (rejections.length) throw new Error([...new Set(rejections)].join(' '));
    setState({ status: 'idle', lastSyncedAt: Date.now() });
  } catch (e) {
    setState({ ...state, status: navigator.onLine ? 'error' : 'offline', message: e instanceof Error ? e.message : String(e) });
  }
}

export function startBackgroundSync(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  onLocalChange(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), DEBOUNCE_MS);
  });
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, INTERVAL_MS);
  void syncNow();
}
