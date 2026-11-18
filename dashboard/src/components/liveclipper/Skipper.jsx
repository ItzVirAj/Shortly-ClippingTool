import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../../lib/api';

export default function Skipper() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { setData(await apiJson('/api/publishing/skipper')); } catch { /* local mode only */ }
  }, []);
  useEffect(() => { refresh(); const id = setInterval(refresh, 5000); return () => clearInterval(id); }, [refresh]);
  if (!data) return null;
  const auto = !!data.settings.skipper;
  async function toggle() {
    setBusy(true);
    try {
      await apiJson('/api/publishing/skipper', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !auto }) });
      setError(''); await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="card p-4 space-y-2"><div className="flex justify-between items-center"><strong>Skipper</strong><button className="btn-primary" disabled={busy} onClick={toggle}>{auto ? 'Switch to Manual' : 'Enable Auto'}</button></div>
    <p className="text-sm">{auto ? 'Auto' : 'Manual'} · Auto publicly uploads new highlights to {data.settings.skipper_name || 'your connected YouTube channel'} with 9:16 framing and default captions. Switching to Manual affects future captures.</p>
    {error && <p role="alert">{error}</p>}
    {data.items.filter(i => i.clip_key.startsWith('live:')).slice(0,10).map(i => <p key={i.id} className="text-sm">{i.title} · {i.status === 'attention' ? i.error : i.status}</p>)}
  </section>;
}
