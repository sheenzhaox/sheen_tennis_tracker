import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../storage/db';
import { usePendingCount, useSyncState } from '../hooks';
import { describeSync } from './SettingsPage';
import { canEditMatch, useUser } from '../user';

export default function HomePage() {
  const user = useUser();
  const sync = useSyncState();
  const pending = usePendingCount();
  const inProgress =
    useLiveQuery(
      () =>
        db.matches
          .where('status')
          .equals('in_progress')
          .filter((m) => !m.deletedAt && canEditMatch(user, m))
          .count(),
      [user],
    ) ?? 0;

  return (
    <main className="home">
      <div className="home-title">
        <img src="/logo.svg" alt="" width={72} height={72} />
        <h1>Sheen Tennis Tracker</h1>
      </div>
      <nav className="home-menu">
        <a className="btn btn-primary btn-big" href="#/match">
          {inProgress > 0 ? `Start / Resume a match (${inProgress} in progress)` : 'Start / Resume a match'}
        </a>
        <a className="btn btn-big" href="#/players">
          Players
        </a>
        <a className="btn btn-big" href="#/stats">
          Stats &amp; Analysis
        </a>
        <a className="btn btn-big" href="#/rules">
          Rules
        </a>
      </nav>
      <a className="home-sync muted" href="#/settings">
        {user.username} · {describeSync(sync, pending)} · Settings
      </a>
      <a className="home-sync" href="#/help">
        Help
      </a>
    </main>
  );
}
