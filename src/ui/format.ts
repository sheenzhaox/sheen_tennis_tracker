import { SURFACES, type Match, type Surface } from '../model/types';

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { timeStyle: 'short' });
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function matchDate(m: Match): Date | undefined {
  if (m.date) {
    const [y, mo, d] = m.date.split('-').map(Number);
    return new Date(y, mo - 1, d);
  }
  const ts = m.startedAt ?? m.createdAt;
  return ts ? new Date(ts) : undefined;
}

export function formatMatchDay(m: Match): string {
  return matchDate(m)?.toLocaleDateString(undefined, { dateStyle: 'medium' }) ?? '';
}

export const matchSortKey = (m: Match) => m.startedAt ?? m.createdAt ?? m.updatedAt;
export const matchDayKey = (m: Match) => matchDate(m)?.getTime() ?? m.updatedAt;

export const surfaceLabel = (s?: Surface) => SURFACES.find((x) => x.value === s)?.label ?? s ?? '';

/** "Ellie Zhao" -> "E. ZHAO"; single names are just uppercased. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full.trim().toUpperCase();
  return `${parts[0][0].toUpperCase()}. ${parts.at(-1)!.toUpperCase()}`;
}
