import React, { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, Check } from 'lucide-react';

export default function KeyInput({ onKeySet, savedKey }) {
    const [key, setKey] = useState(savedKey || '');
    const [isVisible, setIsVisible] = useState(false);
    const [isSaved, setIsSaved] = useState(!!savedKey);

    useEffect(() => {
        if (savedKey) setKey(savedKey);
    }, [savedKey]);

    const handleSave = () => {
        if (key.trim().length > 0) {
            onKeySet(key);
            setIsSaved(true);
        }
    };

    return (
        <div className="p-6 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-t-white/[0.14] shadow-[0_8px_32px_rgba(0,0,0,0.36)] mb-6 animate-fade">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#e31084]/20 to-white/[0.06] border border-[#e31084]/30 flex items-center justify-center text-[#ff66b2] shadow-sm">
                    <Key size={18} />
                </div>
                <div>
                    <h2 className="text-base font-semibold text-white tracking-tight">Gemini API Key</h2>
                    <p className="text-xs text-white/50">Powers transcription and viral moments detection</p>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative sm:flex-1">
                    <input
                        type={isVisible ? "text" : "password"}
                        value={key}
                        onChange={(e) => {
                            setKey(e.target.value);
                            setIsSaved(false);
                        }}
                        placeholder="AIzaSy..."
                        className="w-full bg-black/35 hover:bg-black/45 focus:bg-black/55 border border-white/[0.1] focus:border-[#e31084]/70 text-white placeholder:text-white/35 rounded-xl px-4 py-2.5 pr-11 font-mono text-xs transition-all outline-none focus:ring-2 focus:ring-[#e31084]/30 shadow-inner"
                    />
                    <button
                        type="button"
                        onClick={() => setIsVisible(!isVisible)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors cursor-pointer"
                    >
                        {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!key || isSaved}
                    className={isSaved 
                        ? 'px-4 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 font-mono text-xs font-semibold flex items-center justify-center gap-1.5 cursor-default'
                        : 'px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#e31084] to-[#f03b9f] hover:brightness-110 active:scale-95 text-white font-medium text-xs shadow-[0_4px_16px_rgba(227,16,132,0.35)] transition-all cursor-pointer'
                    }
                >
                    {isSaved ? <><Check size={13} strokeWidth={2.5} /> Ready</> : 'Set Key'}
                </button>
            </div>
            <p className="mt-3 text-xs text-white/50 leading-relaxed">
                Your key is stored locally in your browser for convenience.
                <br />
                <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#ff7dc2] hover:underline mt-1 inline-block font-medium"
                >
                    Get your free Gemini API Key here →
                </a>
            </p>
        </div>
    );
}
