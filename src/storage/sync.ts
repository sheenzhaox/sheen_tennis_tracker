import { db, onLocalChange, SYNC_TABLES, type SyncTable } from './db';
import { expireSession, getSession } from './session';

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
}

interface SyncResponse {
  cursor: number;
  records: RemoteRecord[];
  /** Changes the server refused (no permission), with the server's copy to roll back to (null = not visible). */
  rejected: { kind: SyncTable; id: string; server: RemoteRecord | null }[];
  /** Match ids whose shared access was removed. */
  revoked: string[];
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
      if (local && local.updatedAt === p.updatedAt) await db.table(p.kind).update(p.id, { dirty: 0 });
    }
    for (const r of res.records) {
      if (!SYNC_TABLES.includes(r.kind)) continue;
      const local = (await db.table(r.kind).get(r.id)) as LocalRecord | undefined;
      if (!local || r.updatedAt > local.updatedAt) await put(r);
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
  });
}

async function doSync(): Promise<void> {
  const session = await getSession();
  if (!session) return setState({ status: 'signed-out' });
  if (!navigator.onLine) return setState({ ...state, status: 'offline' });
  setState({ ...state, status: 'syncing' });

  try {
    let since = ((await db.meta.get('cursor'))?.value as number | undefined) ?? 0;
    const dirty: RemoteRecord[] = [];
    for (const kind of SYNC_TABLES) {
      const rows = (await db.table(kind).where('dirty').equals(1).toArray()) as (LocalRecord & Record<string, unknown>)[];
      dirty.push(...rows.map((r) => toRemote(kind, r)));
    }

    let offset = 0;
    do {
      const chunk = dirty.slice(offset, offset + CHUNK_SIZE);
      offset += CHUNK_SIZE;
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ since, records: chunk }),
      });
      if (res.status === 401) {
        await expireSession();
        return setState({ status: 'signed-out' });
      }
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const body = (await res.json()) as SyncResponse;
      await applyResponse(chunk, body, session.user.id);
      since = body.cursor;
      await db.meta.put({ key: 'cursor', value: since });
    } while (offset < dirty.length);

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
