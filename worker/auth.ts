import { isPassword, json, readJson, type Env, type User } from './http';
import { ACCOUNT_SELECT, accountData, type AccountRow } from './access';

const PBKDF2_ITERATIONS = 100_000; // Workers' PBKDF2 maximum.
const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, iterations, salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2' || !salt || !hash) return false;
  const got = await pbkdf2(password, unb64(salt), Number(iterations));
  const expected = unb64(hash);
  return got.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(got, expected);
}

async function sha256(s: string): Promise<string> {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(x, y);
}

const bearer = (req: Request) => {
  const h = req.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
};

export async function authenticate(req: Request, env: Env): Promise<User | null> {
  const token = bearer(req);
  if (!token || token.length > 100) return null;
  const row = await env.DB.prepare(
    `${ACCOUNT_SELECT} JOIN sessions s ON u.id = s.user_id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND u.disabled_at IS NULL`,
  )
    .bind(await sha256(token), Date.now())
    .first<AccountRow>();
  return row ? accountData(row) : null;
}

interface UserRow extends AccountRow {
  password_hash: string | null;
  disabled_at: number | null;
  failed_logins: number;
  locked_until: number | null;
}

export async function login(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ username?: unknown; password?: unknown }>(req);
  if (body instanceof Response) return body;
  const { username, password } = body;
  if (typeof username !== 'string' || typeof password !== 'string' || username.length > 32 || !password || password.length > 200) {
    return json({ error: 'Invalid username or password.' }, 401);
  }
  const now = Date.now();
  const user = await env.DB.prepare(`${ACCOUNT_SELECT} WHERE u.username = ?1`).bind(username.trim()).first<UserRow>();
  if (!user || user.disabled_at) {
    await hashPassword(password); // Same cost as a real check, so response time doesn't reveal usernames.
    return json({ error: 'Invalid username or password.' }, 401);
  }
  if (user.locked_until && user.locked_until > now) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);

  const ok = user.password_hash
    ? await verifyPassword(password, user.password_hash)
    : user.role === 'admin' && !!env.API_TOKEN && (await safeEqual(password, env.API_TOKEN));
  if (!ok) {
    const failed = user.failed_logins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await env.DB.prepare('UPDATE users SET failed_logins = ?2, locked_until = ?3 WHERE id = ?1')
      .bind(user.id, lock ? 0 : failed, lock ? now + LOCK_MS : null)
      .run();
    return json({ error: 'Invalid username or password.' }, 401);
  }

  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL, password_hash = COALESCE(password_hash, ?2) WHERE id = ?1').bind(
      user.id,
      user.password_hash ? null : await hashPassword(password),
    ),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)').bind(
      await sha256(token),
      user.id,
      now,
      now + SESSION_TTL_MS,
    ),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now),
  ]);
  return json({ token, user: accountData(user) });
}

export async function logout(req: Request, env: Env): Promise<Response> {
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256(bearer(req))).run();
  return json({ ok: true });
}

export async function changePassword(req: Request, env: Env, user: User): Promise<Response> {
  const body = await readJson<{ current?: unknown; next?: unknown }>(req);
  if (body instanceof Response) return body;
  if (typeof body.current !== 'string' || !isPassword(body.next)) return json({ error: 'New password must be 8-200 characters.' }, 400);
  const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?1').bind(user.id).first<{ password_hash: string | null }>();
  if (!row?.password_hash || !(await verifyPassword(body.current, row.password_hash))) {
    return json({ error: 'Current password is wrong.' }, 403);
  }
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ?2 WHERE id = ?1').bind(user.id, await hashPassword(body.next)),
    // Sign out every other device.
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1 AND token_hash != ?2').bind(user.id, await sha256(bearer(req))),
  ]);
  return json({ ok: true });
}
