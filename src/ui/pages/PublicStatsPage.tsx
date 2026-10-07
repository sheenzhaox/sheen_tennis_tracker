import { useEffect, useState } from 'react';
import type { PublicStats } from '../../model/types';
import Header from '../components/Header';
import { StatsView } from './StatsPage';

export default function PublicStatsPage({ token }: { token: string }) {
  const [data, setData] = useState<PublicStats | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    async function load() {
      try {
        if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Stats link not found or revoked.');
        const response = await fetch(`/api/public/stats/${token}`, { signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error(response.status === 404 ? 'Stats link not found or revoked.' : 'Unable to load shared stats. Please try again.');
        const stats = await response.json() as PublicStats;
        if (!controller.signal.aborted) setData(stats);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    return () => controller.abort();
  }, [token, attempt]);

  if (data) return <StatsView {...data} />;
  return (
    <>
      <Header title="Stats" back="/" />
      <main className="page">
        {error ? <>
          <p className="error" role="alert">{error}</p>
          <button className="btn" type="button" onClick={() => setAttempt(attempt + 1)}>Try again</button>
        </> : <p role="status">Loading stats...</p>}
      </main>
    </>
  );
}