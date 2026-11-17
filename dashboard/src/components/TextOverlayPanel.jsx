import React from 'react';
import { Plus, Trash2, Type } from 'lucide-react';

export default function TextOverlayPanel({ overlays, selectedId, fonts, disabled, onSelect, onUpdate, onDelete, onAdd }) {
    const selected = overlays.find((item) => item.id === selectedId);
    return (
        <fieldset disabled={disabled} className="space-y-3 border-t border-rule pt-3 disabled:opacity-60">
            <div className="flex items-center justify-between">
                <p className="eyebrow flex items-center gap-2"><Type size={14} /> Text</p>
                <button type="button" className="btn-quiet text-xs flex items-center gap-1" onClick={onAdd} disabled={disabled || overlays.length >= 20}><Plus size={14} /> Add text</button>
            </div>
            <p className="text-xs text-muted">Drag text in the preview. Render to include it in your download. Use Enter for a new line.</p>
            {overlays.map((item, index) => (
                <div key={item.id} className="flex items-center gap-2">
                    <button type="button" aria-pressed={item.id === selectedId} onClick={() => onSelect(item.id)} className={`flex-1 text-left truncate text-xs p-2 rounded-input border ${item.id === selectedId ? 'border-brass' : 'border-rule'}`}>{item.text || `Text ${index + 1}`}</button>
                    <button type="button" aria-label={`Delete text ${index + 1}`} onClick={() => onDelete(item.id)}><Trash2 size={14} /></button>
                </div>
            ))}
            {selected && <div className="space-y-3">
                <label className="block text-xs">Text
                    <textarea aria-label="Text content" maxLength={2000} rows={3} value={selected.text} onChange={(e) => onUpdate(selected.id, { text: e.target.value })} className="w-full mt-1 bg-paper border border-rule rounded-input p-2" />
                </label>
                <label className="block text-xs">Font
                    <select aria-label="Font" value={selected.font_id} onChange={(e) => onUpdate(selected.id, { font_id: e.target.value, bold: false, italic: false })} className="w-full mt-1 bg-paper border border-rule rounded-input p-2">
                        {!fonts.some((font) => font.id === selected.font_id) && <option value={selected.font_id}>Legacy font ({selected.font_id})</option>}
                        {fonts.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
                    </select>
                </label>
                <label className="block text-xs">Size: {selected.font_size}px
                    <input aria-label="Text size" type="range" min="12" max="240" value={selected.font_size} onChange={(e) => onUpdate(selected.id, { font_size: Number(e.target.value) })} className="w-full accent-brass" />
                </label>
                <div className="flex gap-4">
                    <label className="text-xs">Text color <input aria-label="Text color" type="color" value={selected.color} onChange={(e) => onUpdate(selected.id, { color: e.target.value })} /></label>
                    <label className="text-xs">Background <input aria-label="Text background" type="color" value={selected.bg_color} onChange={(e) => onUpdate(selected.id, { bg_color: e.target.value })} /></label>
                </div>
                <label className="block text-xs">Background opacity: {Math.round(selected.bg_opacity * 100)}%
                    <input aria-label="Background opacity" type="range" min="0" max="100" value={selected.bg_opacity * 100} onChange={(e) => onUpdate(selected.id, { bg_opacity: Number(e.target.value) / 100 })} className="w-full accent-brass" />
                </label>
                {['x', 'y'].map((axis) => <label key={axis} className="block text-xs">{axis === 'x' ? 'Horizontal' : 'Vertical'} position: {Math.round(selected[`${axis}_pct`] * 100)}%
                    <input aria-label={`${axis === 'x' ? 'Horizontal' : 'Vertical'} text position`} type="range" min="2" max="98" value={selected[`${axis}_pct`] * 100} onChange={(e) => onUpdate(selected.id, { [`${axis}_pct`]: Number(e.target.value) / 100 })} className="w-full accent-brass" />
                </label>)}
            </div>}
        </fieldset>
    );
}
