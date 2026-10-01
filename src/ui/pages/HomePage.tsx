import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../storage/db';

export default function HomePage() {
  const inProgress = useLiveQuery(() => db.matches.where('status').equals('in_progress').count(), []) ?? 0;

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
    </main>
  );
}
