import type { UserRole } from '../src/model/types';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ENVIRONMENT: string;
  /** Bootstrap password for the first admin login (before the admin sets a real password). */
  API_TOKEN?: string;
}

export interface User {
  id: string;
  username: string;
  name?: string;
  email?: string;
  role: UserRole;
  playerId?: string;
  clubIds?: string[];
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function readJson<T>(req: Request, maxBytes = 10_000): Promise<T | Response> {
  if (!req.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'expected JSON' }, 415);
  if (Number(req.headers.get('Content-Length') ?? 0) > maxBytes) return json({ error: 'too large' }, 413);
  try {
    const body = await req.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return json({ error: 'invalid JSON' }, 400);
    return body as T;
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
}

export const isUsername = (v: unknown): v is string => typeof v === 'string' && /^[\w.-]{2,32}$/.test(v);
export const isPassword = (v: unknown): v is string => typeof v === 'string' && v.length >= 8 && v.length <= 200;
export const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w:-]{1,64}$/.test(v);
