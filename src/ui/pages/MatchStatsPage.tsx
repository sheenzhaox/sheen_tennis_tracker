import { useLiveQuery } from 'dexie-react-hooks';
import Header from '../components/Header';
import { db } from '../../storage/db';
import type { Match } from '../../model/types';
import type { SessionUser } from '../../storage/session';
import { usePlayerNames } from '../hooks';
import { formatMatchDay, matchSortKey, surfaceLabel } from '../format';
import { isOwnMatch, useUser } from '../user';

export function statsMatchGroups(matches: Match[], user: SessionUser) {
  const sorted = matches.filter((match) => !match.deletedAt)
    .sort((a, b) => matchSortKey(b) - matchSortKey(a) || a.id.localeCompare(b.id));
  return {
    own: sorted.filter((match) => isOwnMatch(user, match)),
    shared: sorted.filter((match) => !isOwnMatch(user, match)),
  };
}

export default function MatchStatsPage() {
  const user = useUser();
  const all = useLiveQuery(() => db.matches.filter((match) => !match.deletedAt).toArray(), []);
  const names = usePlayerNames();
  const groups = all === undefined ? undefined : statsMatchGroups(all, user);
  const sharedTitle = user.role === 'admin' ? "Other users' matches" : user.role === 'coach' ? 'Shared / club matches' : 'Shared with me';
  const item = (match: Match) => <li key={match.id}>
    <a href={`#/match/${encodeURIComponent(match.id)}/stats?return=%2Fstats%2Fmatches`}>
      <strong>{names.get(match.playerAId) ?? 'Unknown'} vs {names.get(match.playerBId) ?? 'Unknown'}</strong>
      <span className="muted">{[
        formatMatchDay(match), match.status.replace('_', ' '), surfaceLabel(match.surface),
        match.event, !isOwnMatch(user, match) && `by ${match.ownerName ?? 'unknown'}`,
      ].filter(Boolean).join(' · ')}</span>
    </a>
  </li>;

  return <>
    <Header title="Match stats" back="/stats" />
    <main className="page">
      {groups === undefined ? <p role="status">Loading matches...</p> : <>
        <h2>My matches</h2>
        {groups.own.length ? <ul className="list user-directory">{groups.own.map(item)}</ul> : <p className="muted">No matches created by you yet.</p>}
        <h2>{sharedTitle}</h2>
        {groups.shared.length ? <ul className="list user-directory">{groups.shared.map(item)}</ul> : <p className="muted">No other accessible matches.</p>}
      </>}
    </main>
  </>;
}
