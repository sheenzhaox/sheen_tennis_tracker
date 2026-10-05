import { createContext, useContext } from 'react';
import type { SessionUser } from '../storage/session';
import type { Match } from '../model/types';

export const UserContext = createContext<SessionUser | null>(null);

/** The signed-in user; only valid inside the logged-in app. */
export function useUser(): SessionUser {
  const user = useContext(UserContext);
  if (!user) throw new Error('useUser outside logged-in app');
  return user;
}

export const isAdmin = (u: SessionUser) => u.role === 'admin';

/** Own matches (or not yet synced) are editable; shared ones are view-only. Admin can edit all. */
export const canEditMatch = (u: SessionUser, m: Match) => isAdmin(u) || !m.ownerId || m.ownerId === u.id;
