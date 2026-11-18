import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../../lib/api';

import { getApiUrl } from '../../config';
import { LookPicker } from '../../captions/CaptionPanel';
import { defaultLook, useClipFrame } from '../../captions/clipCaptionState';

export default function Skipper({ captureId }) {
  const [setup, setSetup] = useState(false);
  const [look, setLook] = useState(defaultLook);
  const frame = useClipFrame(setup && captureId ? getApiUrl('/api/liveclipper/queue/'+encodeURIComponent(captureId)+'/preview') : null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { setData(await apiJson('/api/publishing/skipper')); } catch { /* local mode only */ }
  }, []);
  useEffect(() => { refresh(); const id = setInterval(refresh, 5000); return () => clearInterval(id); }, [refresh]);
  if (!data) return null;
  const auto = !!data.settings.skipper;
  async function toggle(enabled) {
    setBusy(true);
    try {
      await apiJson('/api/publishing/skipper', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, ...(enabled ? { look } : {}) }) });
      setError(''); setSetup(false); await refresh();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="card p-4 space-y-2"><div className="flex justify-between items-center"><strong>Skipper</strong><button className="btn-primary" disabled={busy} onClick={()=>{if(auto) toggle(false); else {setLook(data.settings.skipper_look || defaultLook); setSetup(true);}}}>{auto ? 'Switch to Manual' : 'Enable Auto'}</button></div>
    <p className="text-sm">{auto ? 'Auto' : 'Manual'} · Auto publicly uploads new highlights to {data.settings.skipper_name || 'your connected YouTube channel'} in 9:16. Switching to Manual affects future captures.</p>
    {setup && !auto && <fieldset disabled={busy} className="max-w-lg space-y-3 border-t border-rule pt-3">
      <legend className="font-semibold">Set up Auto</legend>
      <p className="text-sm">Public Shorts · {data.channel?.title || data.settings.skipper_name || 'Connect YouTube in Publishing'} · 9:16</p>
      {!frame && <p className="text-xs text-muted">Sample preview · waiting for a captured frame</p>}
      <LookPicker look={look} onChange={setLook} frame={frame}/>
      <div className="flex gap-2"><button className="btn-primary" onClick={()=>toggle(true)}>Start Auto</button>
      <button className="btn-ghost" onClick={()=>{setSetup(false);setError('');}}>Cancel</button></div>
    </fieldset>}
    {error && <p role="alert">{error}</p>}
    {data.items.filter(i => i.clip_key.startsWith('live:')).slice(0,10).map(i => <p key={i.id} className="text-sm">{i.title} · {i.status === 'attention' ? i.error : i.status}</p>)}
  </section>;
}
