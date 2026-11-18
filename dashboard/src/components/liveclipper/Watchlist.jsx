import React, { useEffect, useState } from 'react';
import { apiJson } from '../../lib/api';

const endpoint = '/api/liveclipper/watchlist';
const emptyChannels = { youtube: '', kick: '', twitch: '' };

export default function Watchlist({ onOpen }) {
  const [rows, setRows] = useState([]);
  const [channels, setChannels] = useState(emptyChannels);
  const [name, setName] = useState('');
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function refresh() {
      try {
        const data = await apiJson(endpoint);
        if (mounted) setRows(data);
      } catch (err) {
        if (mounted) setError(err.message);
      }
    }
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);

  async function change(path, method, payload) {
    setBusy(true);
    try {
      const data = await apiJson(endpoint + path, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      setRows(data);
      setError('');
      if (method === 'POST') {
        setName('');
        setChannels(emptyChannels);
        setPermission(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function add(event) {
    event.preventDefault();
    const filled = Object.fromEntries(Object.entries(channels).filter(([, handle]) => handle.trim()));
    change('', 'POST', { name, channels: filled, permission_ack: permission });
  }

  return <section>
    <header className="lc-heading"><div><h2>Creator watchlist</h2>
      <p>Shortly checks these channels while the backend is running. One stream records at a time.</p>
    </div></header>
    {rows.map(row => <article className="lc-history-row" key={row.id}>
      <div><h3>{row.name}</h3><p>{Object.entries(row.channels).map(([p,h]) => p + ' ' + h).join(' · ')}</p>
        <p>{row.enabled ? row.state || 'Checking…' : 'Paused'}{row.checked && ' · ' + new Date(row.checked).toLocaleTimeString()}</p></div>
      <div className="lc-tools">
        {row.enabled && row.session_id && <button onClick={() => onOpen(row.session_id)}>Open session</button>}
        <button disabled={busy} onClick={() => change('/' + row.id, 'PATCH', { enabled: !row.enabled })}>{row.enabled ? 'Pause watch' : 'Resume watch'}</button>
        <button disabled={busy} onClick={() => change('/' + row.id, 'DELETE')}>Remove watch</button>
      </div></article>)}
    <form onSubmit={add} className="lc-form">
      <div className="lc-heading"><h3>Add creator</h3><button type="button" className="lc-secondary" onClick={() => {
        setName('IShowSpeed'); setChannels({ ...emptyChannels, youtube: '@IShowSpeed' });
      }}>Use IShowSpeed</button></div>
      <div className="lc-options"><label>Creator name<input required value={name} onChange={e => setName(e.target.value)}/></label>
        {Object.keys(channels).map(platform => <label key={platform}>{platform} handle
          <input value={channels[platform]} placeholder="@channel" onChange={e => setChannels({...channels, [platform]: e.target.value})}/></label>)}</div>
      <label className="lc-check"><input type="checkbox" checked={permission} onChange={e => setPermission(e.target.checked)}/>I have permission to clip this creator and will credit them.</label>
      <button className="lc-primary" disabled={busy || !permission || !name.trim() || !Object.values(channels).some(h => h.trim())}>Watch automatically</button>
    </form>
    {error && <p role="alert">{error}</p>}
  </section>;
}
