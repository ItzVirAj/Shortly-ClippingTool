import React, { memo, useMemo } from 'react';
import styles from './captionStyles.json';
import assets from './stickers.json';
import './captionLooks.css';

import { clamp, defaultLook } from './clipCaptionState';
const sample = ['NO', 'WAY', 'BRO'].map((w, i) => ({ w, s: i / 3, e: (i + 1) / 3 }));

function groupWords(words, count) {
    const groups = [];
    for (const word of words) {
        const last = groups.at(-1);
        const prev = last?.at(-1);
        if (!last || last.length >= count || word.s - prev.e > .55 || /[.!?。！？]$/.test(prev.w)) groups.push([]);
        groups.at(-1).push(word);
    }
    return groups;
}

export function CaptionLayer({ look, words, time }) {
    const preset = styles.find(s => s.id === look?.captionStyleId) || styles[0];
    const s = { ...preset, ...look?.captionSettings };
    const groups = useMemo(() => groupWords(words, s.words), [words, s.words]);
    if (!look?.captionsEnabled) return null;
    const line = groups.find(g => g[0].s <= time && time < g.at(-1).e);
    if (!line) return null;
    const active = line.findLastIndex(w => w.s <= time);
    const since = time - line[active].s;
    const fraction = clamp(since / Math.max(.001, line[active].e - line[active].s), 0, 1);
    const pulse = Math.max(0, 1 - since / .11);
    const scale = s.animation === 'pop' ? 1 - .25*pulse : s.animation === 'punch' ? 1 + .15*pulse : 1;
    return <div aria-hidden="true" className="shortly-caption" style={{
        top: { top:'20%', center:'50%', bottom:'75%' }[s.position],
        transform: `translate(-50%,-50%) scale(${scale})`, fontFamily: `"${s.font}",sans-serif`,
        fontWeight:s.weight, fontStyle:s.italic ? 'italic' : 'normal', fontSize:`${s.size / 10.8}cqw`,
        textTransform: { upper:'uppercase', lower:'lowercase' }[s.case],
        WebkitTextStroke: `${s.stroke / 10.8}cqw ${s.outline}`,
        textShadow: s.glow ? `0 0 ${s.glow / 8}cqw ${s.outline}` : `${s.shadow / 10.8}cqw ${s.shadow / 10.8}cqw #777`
    }}>{line.map(({w}, i) => {
        const current = i === active;
        const gradient = s.gradient ? `linear-gradient(90deg,${s.fill},${s.gradient})` :
            current && s.animation === 'sweep' ? `linear-gradient(90deg,${s.highlight} ${fraction*100}%,${s.fill} ${fraction*100}%)` : null;
        const typed = s.animation === 'typewriter';
        return <React.Fragment key={i}><span style={{
            color:gradient ? 'transparent' : current ? s.highlight : s.fill,
            backgroundImage:gradient, backgroundClip:gradient ? 'text' : undefined,
            textDecoration:current && s.underline ? `underline ${s.underline}` : undefined,
            backgroundColor:current ? s.box : undefined, borderRadius:'.2em'
        }}>{typed && i > active ? '' : typed && current ? Array.from(w).slice(0, Math.ceil(fraction * Array.from(w).length)).join('') : w}</span>{' '}</React.Fragment>;
    })}</div>;
}

export const LookPicker = memo(function LookPicker({ look, onChange, frame }) {
    const selected = styles.find(s => s.id === look?.captionStyleId);
    const value = look || defaultLook;
    const change = patch => onChange({ ...value, ...patch });
    const override = (key, v) => change({ captionSettings: { ...value.captionSettings, [key]: v } });
    return <div className="space-y-3">
        <label className="flex justify-between text-sm">Captions on<input type="checkbox" checked={value.captionsEnabled} onChange={e=>change({captionsEnabled:e.target.checked})}/></label>
        {value.captionsEnabled && <>
            <div aria-label="Caption looks" className="grid grid-cols-3 gap-2">{styles.map(s =>
                <button type="button" key={s.id} aria-pressed={selected?.id === s.id} className={'rounded-card border p-1 text-xs ' + (selected?.id === s.id ? 'border-brass text-brass' : 'border-rule')}
                    onClick={()=>change({captionStyleId:s.id, captionSettings:{}})}>
                    <span className="look-swatch" style={{backgroundImage:frame ? `url("${frame}")` : undefined}}>
                        <CaptionLayer look={{captionStyleId:s.id,captionsEnabled:true}} words={sample} time={.5}/>
                    </span>{s.name}
                </button>)}</div>
            {selected && <details className="text-xs"><summary>Adjust look</summary><div className="grid grid-cols-2 gap-2 py-2">
                <label>Size<input type="range" min="30" max="120" value={value.captionSettings?.size ?? selected.size} onChange={e=>override('size',+e.target.value)}/></label>
                <label>Highlight <input type="color" value={value.captionSettings?.highlight ?? selected.highlight} onChange={e=>override('highlight',e.target.value)}/></label>
                <label>Position <select value={value.captionSettings?.position ?? selected.position} onChange={e=>override('position',e.target.value)}>{['top','center','bottom'].map(p=><option key={p}>{p}</option>)}</select></label>
                <label>Words per group <input type="number" min="1" max="18" value={value.captionSettings?.words ?? selected.words} onChange={e=>override('words',clamp(+e.target.value,1,18))}/></label>
            </div></details>}
        </>}
    </div>;
});

export function StickerLayer({ stickers, time, change, select }) {
    return stickers.filter(s => time >= s.start && time < s.end).map(s =>
        <img key={s.id} src={'/captions/'+s.asset+'.png'} alt={s.asset} draggable={false}
            className="absolute z-10 touch-none cursor-grab" style={{left:s.x*100+'%',top:s.y*100+'%',width:s.scale*100+'%',transform:`translate(-50%,-50%) scale(${Math.min(1,.7+2.5*(time-s.start))})`}}
            onPointerDown={e=>{select(s.id); e.currentTarget.setPointerCapture(e.pointerId);}}
            onPointerMove={e=>{
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const r=e.currentTarget.parentElement.getBoundingClientRect();
                change(s.id,{x:clamp((e.clientX-r.left)/r.width,0,1), y:clamp((e.clientY-r.top)/r.height,0,1)});
            }}/>);
}

export function StickerPanel({ stickers, setStickers, time, duration, selected, select, change }) {
    const item = stickers.find(s=>s.id===selected);
    const add = asset => {
        const start = clamp(time,0,Math.max(0,duration-.1));
        const sticker = {id:crypto.randomUUID(),asset,x:.5,y:.4,scale:.2,start,end:Math.min(start+2,duration)};
        setStickers([...stickers,sticker]); select(sticker.id);
    };
    return <div className="space-y-2"><div className="grid grid-cols-6 gap-2">{assets.map(a=><button type="button" key={a} disabled={stickers.length>=24 || duration<=0} onClick={()=>add(a)} aria-label={'Add '+a}><img loading="lazy" alt="" src={'/captions/'+a+'.png'}/></button>)}</div>
        {stickers.map(s=><button type="button" key={s.id} onClick={()=>select(s.id)} className="relative block w-full bg-paper3 text-xs text-left">
            <span className="absolute h-full bg-brass/25" style={{left:100*s.start/duration+'%',width:100*(s.end-s.start)/duration+'%'}}/><span className="relative">{s.asset} · {s.start.toFixed(1)}–{s.end.toFixed(1)}s</span></button>)}
        {item && <div className="grid grid-cols-2 gap-2 text-xs">
            {['start','end'].map(k=><label key={k}>{k} (s)<input type="number" step=".05" min="0" max={duration} value={item[k]} onChange={e=>change(item.id,{[k]: k==='start' ? clamp(+e.target.value,0,item.end-.01) : clamp(+e.target.value,item.start+.01,duration)})}/></label>)}
            <label>Size<input type="range" min=".05" max=".6" step=".01" value={item.scale} onChange={e=>change(item.id,{scale:+e.target.value})}/></label>
            <button type="button" onClick={()=>setStickers(stickers.filter(s=>s.id!==item.id))}>Delete sticker</button>
        </div>}
    </div>;
}
