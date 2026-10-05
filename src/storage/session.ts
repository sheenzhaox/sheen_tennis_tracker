import { clearLocalData, countDirty, db } from './db';
import { syncNow } from './sync';

export interface SessionUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
}

export interface Session {
  token: string;
  user: SessionUser;
}

export async function getSession(): Promise<Session | undefined> {
  return (await db.meta.get('session'))?.value as Session | undefined;
}

/** Drops the session token but keeps local data, so the same user can log back in without losing anything. */
export async function expireSession(): Promise<void> {
  await db.meta.delete('session');
}

async function request<T>(path: string, method: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 && token) await expireSession();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Authenticated API call (online only). */
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const session = await getSession();
  if (!session) throw new Error('Not logged in.');
  return request<T>(path, method, body, session.token);
}

/**
 * Logs in. Switching to a different account wipes this device's local data first;
 * `confirmDiscard` is asked when that would lose unsynced changes.
 */
export async function login(username: string, password: string, confirmDiscard: (pending: number) => boolean): Promise<void> {
  const { token, user } = await request<Session>('/api/login', 'POST', { username, password });
  // Devices used before accounts existed hold the admin's data.
  const previous = ((await db.meta.get('lastUserId'))?.value as string | undefined) ?? 'admin';
  if (previous !== user.id) {
    const pending = await countDirty();
    if (pending && !confirmDiscard(pending)) {
      await request('/api/logout', 'POST', undefined, token).catch(() => undefined);
      throw new Error('Login cancelled.');
    }
    await clearLocalData();
  }
  await db.meta.bulkPut([
    { key: 'session', value: { token, user } satisfies Session },
    { key: 'lastUserId', value: user.id },
  ]);
  // Full pull so ownership and newly shared matches arrive.
  await db.meta.bulkDelete(['cursor', 'apiToken']);
  void syncNow();
}

export async function logout(): Promise<void> {
  await api('/api/logout', 'POST').catch(() => undefined);
  await clearLocalData();
}
