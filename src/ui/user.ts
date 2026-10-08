import { createContext, useContext } from 'react';
import type { SessionUser } from '../storage/session';
import type { Match, Player } from '../model/types';

export const UserContext = createContext<SessionUser | null>(null);

/** The signed-in user; only valid inside the logged-in app. */
export function useUser(): SessionUser {
  const user = useContext(UserContext);
  if (!user) throw new Error('useUser outside logged-in app');
  return user;
}

export const isAdmin = (u: SessionUser) => u.role === 'admin';
export const isCoach = (u: SessionUser) => u.role === 'coach';

/** Own matches (or not yet synced) are editable; shared ones are view-only. Admin can edit all. */
export const canEditMatch = (u: SessionUser, m: Match) => isAdmin(u) || !m.ownerId || m.ownerId === u.id;

/** Admins manage all profiles; users edit private or linked system profiles. */
export const canEditPlayer = (u: SessionUser, p: Player) => isAdmin(u) || p.ownerId === u.id || (!p.ownerId && p.linkedUserId === u.id);
export const canDeletePlayer = (u: SessionUser, p: Player) => !p.linkedUserId && (isAdmin(u) || p.ownerId === u.id);

/** Include personal profiles/notes and a coach's club players. */
export const isListedPlayer = (u: SessionUser, p: Player) => canEditPlayer(u, p) || p.createdById === u.id || isClubPlayer(u, p);

export const isClubPlayer = (u: SessionUser, p: Player) =>
  isCoach(u) && !p.ownerId && (p.clubIds ?? []).some((id) => u.clubIds?.includes(id));

export const canShareStats = (u: SessionUser, m: Match, players: Player[]) =>
  canEditMatch(u, m) || players.some((p) => (p.id === m.playerAId || p.id === m.playerBId) && isClubPlayer(u, p));

/** Match setup can also select shared players added by admins. */
export const canSelectPlayer = (u: SessionUser, p: Player) => isAdmin(u) || !p.ownerId || p.ownerId === u.id;
