import React, { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../lib/api';
import { getApiUrl } from '../config';

const groups = { Review: ['draft'], Queue: ['queued', 'uploading', 'processing', 'scheduled'], Published: ['published', 'uploaded'], 'Needs attention': ['attention'] };
export default function PublishingTab({ onConnect }) {
    const [data, setData] = useState(null);
    const [tab, setTab] = useState('Review');
    const [selected, setSelected] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => { try { setData(await apiJson('/api/publishing')); } catch (e) { setError(String(e.detail || e.message)); } }, []);
    useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, [load]);
    const call = async (path, method, body) => {
        setBusy(true); setError('');
        try { const result = await apiJson(`/api/publishing${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); await load(); return result; }
        catch (e) { setError(typeof e.detail === 'string' ? e.detail : e.message); return null; }
        finally { setBusy(false); }
    };
    if (!data) return <div className="p-8">{error || 'Loading publishing queue…'}</div>;
    const items = data.items.filter((i) => groups[tab].includes(i.status));
    return <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex flex-wrap justify-between gap-4"><div><h1 className="text-3xl font-display">Publishing</h1><p className="text-muted">{data.channel?.title || 'YouTube not connected'} · {data.settings.paused ? 'Paused' : 'Ready for automation'}</p></div>
            <div className="flex gap-2"><button className="btn-ghost" onClick={onConnect}>Connect YouTube</button><button disabled={busy} className="btn-primary" onClick={() => call('/settings', 'PUT', { paused: !data.settings.paused })}>{data.settings.paused ? 'Resume queue' : 'Pause queue'}</button></div></div>
        <p className="text-xs text-muted">Pause stops new transfers. Uploads already running and videos scheduled on YouTube can still complete.</p>
        {error && <p role="alert" className="text-danger">{error}</p>}
        <div className="flex flex-wrap gap-2">{Object.keys(groups).map((name) => <button className={tab === name ? 'btn-primary' : 'btn-ghost'} key={name} onClick={() => setTab(name)}>{name} ({data.items.filter((i) => groups[name].includes(i.status)).length})</button>)}</div>
        <div className="space-y-2">{items.map((item) => <button key={item.id} onClick={() => setSelected({ ...item })} className="w-full text-left card p-4 flex justify-between gap-3"><span>{item.title}<small className="block text-muted">{item.channel_name}</small></span><span>{item.status}{item.actual_privacy && ` · ${item.actual_privacy}`}<small className="block text-muted">{item.publish_at && new Date(item.publish_at).toLocaleString()}</small></span></button>)}{!items.length && <p className="text-muted p-4">No items in {tab.toLowerCase()}.</p>}</div>
        {tab === 'Review' && <section><h2 className="eyebrow mb-3">Generated clips</h2><p className="text-xs text-muted mb-3">Prepare a draft to freeze the current rendered video, including frames and text. Defaults to private visibility.</p>{data.clips.map((clip) => <div key={clip.id} className="border-b border-rule py-3 flex justify-between gap-3"><span>{clip.name}</span><button disabled={busy || !data.channel} className="btn-ghost" onClick={async () => { const item = await call('/items', 'POST', { clip_id: clip.id }); if (item) setSelected(item); }}>Prepare draft</button></div>)}</section>}
        <details className="card p-4"><summary>Local n8n connection</summary><p className="text-sm my-3">{data.n8n_token_configured ? 'Publishing token configured' : 'Set SHORTLY_PUBLISHING_TOKEN in your backend environment for n8n access.'}</p><p className="text-sm">Last queue contact: {data.settings.last_contact ? new Date(data.settings.last_contact * 1000).toLocaleString() : 'None yet'}</p><p className="text-xs text-muted my-3">Import examples/n8n/shortly-local-publishing.json in n8n. Keep Shortly and n8n running. A manual run uses the same queue operation.</p><button disabled={busy} className="btn-ghost" onClick={() => call('/tick', 'POST', {})}>Run queue now</button></details>
        {selected && <div className="fixed inset-0 z-[120] bg-black/70 flex justify-end" onClick={() => setSelected(null)}><div role="dialog" aria-label="Publication details" className="bg-paper w-full max-w-xl p-6 overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}><button className="btn-ghost" onClick={() => setSelected(null)}>Close</button><video controls className="w-full max-h-72" src={getApiUrl(`/api/publishing/items/${selected.id}/preview`)} /><p className="text-muted">{selected.channel_name} · {selected.status}</p>
            <fieldset disabled={busy || selected.status !== 'draft'} className="space-y-4"><label className="block">Title<input className="input-field w-full" maxLength={100} value={selected.title} onChange={(e) => setSelected({ ...selected, title: e.target.value })} /></label><label className="block">Description<textarea className="input-field w-full" maxLength={5000} value={selected.description} onChange={(e) => setSelected({ ...selected, description: e.target.value })} /></label><label className="block">Visibility<select className="input-field w-full" value={selected.privacy} onChange={(e) => setSelected({ ...selected, privacy: e.target.value })}>{['private', 'unlisted', 'public'].map((v) => <option key={v}>{v}</option>)}</select></label><label className="flex gap-2"><input type="checkbox" checked={selected.made_for_kids} onChange={(e) => setSelected({ ...selected, made_for_kids: e.target.checked })} />Made for kids</label><label className="block">Publish at (optional; public visibility)<input type="datetime-local" className="input-field w-full" value={selected.localDate || ''} onChange={(e) => setSelected({ ...selected, localDate: e.target.value, publish_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label></fieldset>
            {selected.error && <p role="alert" className="text-danger">{selected.error}</p>}
            {selected.status === 'draft' && <button disabled={busy} className="btn-primary" onClick={async () => { const saved = await call(`/items/${selected.id}`, 'PATCH', selected); if (!saved) return; setSelected(saved); const approved = await call(`/items/${saved.id}/approve`, 'POST', { revision: saved.revision }); if (approved) { setSelected(approved); setTab('Queue'); } }}>Save & approve upload</button>}
            {['draft', 'queued', 'attention'].includes(selected.status) && <button disabled={busy} className="btn-ghost" onClick={async () => { const result = await call(`/items/${selected.id}/cancel`, 'POST', { revision: selected.revision }); if (result) setSelected(null); }}>Remove from queue</button>}
            {selected.status === 'attention' && !selected.uncertain && <button disabled={busy} className="btn-primary" onClick={async () => { const result = await call(`/items/${selected.id}/retry`, 'POST', { revision: selected.revision }); if (result) setSelected(result); }}>Retry / check upload</button>}
            {selected.video_id && <a className="btn-ghost inline-block" target="_blank" rel="noreferrer" href={`https://www.youtube.com/watch?v=${encodeURIComponent(selected.video_id)}`}>Open on YouTube</a>}
        </div></div>}
    </div>;
}
