import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../storage/db';
import { usePendingCount, useSyncState } from '../hooks';
import { describeSync } from './SettingsPage';

export default function HomePage() {
  const sync = useSyncState();
  const pending = usePendingCount();
  const inProgress =
    useLiveQuery(
      () =>
        db.matches
          .where('status')
          .equals('in_progress')
          .filter((m) => !m.deletedAt)
          .count(),
      [],
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
        <a className="btn btn-big" href="#/rules">
          Rules
        </a>
      </nav>
      <a className="home-sync muted" href="#/settings">
        {describeSync(sync, pending)} · Settings
      </a>
    </main>
  );
}
