import { useEffect, useState } from 'react';
import { Copy, Link, Unlink } from 'lucide-react';
import { api } from '../../storage/session';
import { syncNow } from '../../storage/sync';

export default function StatsShare({ matchId }: { matchId: string }) {
  const [active, setActive] = useState(false);
  const [url, setUrl] = useState('');
  const [existingUrl, setExistingUrl] = useState('');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setActive(false);
    setUrl('');
    setExistingUrl('');
    setError('');
    setMessage('');
    api<{ active: boolean; token?: string }>(`/api/matches/${matchId}/stats-link`)
      .then((data) => {
        if (!cancelled) {
          setActive(data.active);
          setUrl(data.active && data.token ? `${window.location.origin}/#/shared-stats/${data.token}` : '');
        }
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [matchId]);

  async function restore() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const link = new URL(existingUrl.trim());
      const token = link.hash.match(/^#\/shared-stats\/([a-f0-9]{64})$/)?.[1];
      if (!token || link.origin !== window.location.origin) throw new Error('Paste the original public stats link for this site.');
      const data = await api<{ token: string }>(`/api/matches/${matchId}/stats-link`, 'PUT', { token });
      setUrl(`${window.location.origin}/#/shared-stats/${data.token}`);
      setExistingUrl('');
      setMessage('Existing link restored. It has not been replaced.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

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
      {active && !url && <div className="form">
        <p className="muted">An older public link is active. Paste its original URL to keep it available here without replacing it.</p>
        <label>Existing public stats link
          <input type="url" value={existingUrl} disabled={busy} onChange={(event) => setExistingUrl(event.target.value)} />
        </label>
        <button className="btn" type="button" onClick={() => void restore()} disabled={busy || !existingUrl.trim()}>
          Restore existing link
        </button>
      </div>}
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