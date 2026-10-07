import { authenticate, changePassword, login, logout } from './auth';
import { createUser, getMatchAccess, listUsers, setMatchAccess, updateUser } from './admin';
import { isId, json, type Env } from './http';
import { sync } from './sync';
import { getPublicStats, manageStatsLink } from './publicStats';

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (path === '/api/login' && req.method === 'POST') return login(req, env);
    const publicStats = path.match(/^\/api\/public\/stats\/([^/]+)$/);
    if (publicStats && req.method === 'GET') return getPublicStats(env, publicStats[1]);

    const user = await authenticate(req, env);
    if (!user) return json({ error: 'unauthorized' }, 401);

    if (path === '/api/sync' && req.method === 'POST') return sync(req, env.DB, user);
    if (path === '/api/me' && req.method === 'GET') return json({ user, environment: env.ENVIRONMENT });
    if (path === '/api/logout' && req.method === 'POST') return logout(req, env);
    if (path === '/api/password' && req.method === 'POST') return changePassword(req, env, user);
    const statsLink = path.match(/^\/api\/matches\/([^/]+)\/stats-link$/);
    if (statsLink && isId(statsLink[1]) && ['GET', 'POST', 'DELETE'].includes(req.method)) {
      return manageStatsLink(req, env, user, statsLink[1]);
    }

    if (user.role !== 'admin') return json({ error: 'forbidden' }, 403);
    if (path === '/api/users' && req.method === 'GET') return listUsers(env);
    if (path === '/api/users' && req.method === 'POST') return createUser(req, env);
    const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && isId(userMatch[1]) && req.method === 'PATCH') return updateUser(req, env, user, userMatch[1]);
    const accessMatch = path.match(/^\/api\/matches\/([^/]+)\/access$/);
    if (accessMatch && isId(accessMatch[1])) {
      if (req.method === 'GET') return getMatchAccess(env, accessMatch[1]);
      if (req.method === 'PUT') return setMatchAccess(req, env, accessMatch[1]);
    }
    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
