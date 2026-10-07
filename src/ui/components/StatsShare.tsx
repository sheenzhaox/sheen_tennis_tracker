import { useEffect, useState } from 'react';
import { Copy, Link, Unlink } from 'lucide-react';
import { api } from '../../storage/session';
import { syncNow } from '../../storage/sync';

export default function StatsShare({ matchId }: { matchId: string }) {
  const [active, setActive] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api<{ active: boolean }>(`/api/matches/${matchId}/stats-link`)
      .then((data) => { if (!cancelled) setActive(data.active); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [matchId]);

  async function create() {
    if (active && !confirm('Create a new stats link? The previous link will stop working.')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await syncNow();
      const data = await api<{ token: string }>(`/api/matches/${matchId}/stats-link`, 'POST');
      setUrl(`${window.location.origin}/#/shared-stats/${data.token}`);
      setActive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm('Revoke the public stats link? Anyone using it will lose access.')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/api/matches/${matchId}/stats-link`, 'DELETE');
      setActive(false);
      setUrl('');
      setMessage('Link revoked.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    setError('');
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link copied.');
    } catch {
      setError('Copy the link from the field below.');
    }
  }

  return (
    <section className="stats-share" aria-label="Share stats">
      <h2>Share stats</h2>
      <p className="muted">Anyone with this link can view the stats without an account. Match changes appear after cloud sync.</p>
      {active && !url && <p className="muted">A public link is active. Creating a new link replaces it.</p>}
      <div className="share-actions">
        <button className="btn" type="button" onClick={() => void create()} disabled={busy}>
          <Link size={18} aria-hidden="true" /> {active ? 'Create new link' : 'Create link'}
        </button>
        {active && <button className="btn btn-danger" type="button" onClick={() => void revoke()} disabled={busy}>
          <Unlink size={18} aria-hidden="true" /> Revoke link
        </button>}
      </div>
      {url && <div className="form">
        <label>Public stats link<input type="url" value={url} readOnly onFocus={(event) => event.currentTarget.select()} /></label>
        <button className="btn" type="button" onClick={() => void copy()} disabled={busy}>
          <Copy size={18} aria-hidden="true" /> Copy link
        </button>
      </div>}
      {message && <p className="muted" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}