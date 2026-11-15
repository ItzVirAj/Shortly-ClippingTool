import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

export default function UnsavedChangesModal({
  isOpen,
  projectName = 'Untitled project',
  onSaveAndProceed,
  onAbandon,
  onCancel,
  targetActionName = 'continue',
}) {
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveAndProceed?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100 select-none">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-2xl max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-800/60 text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Unsaved Changes</h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              You have unsaved changes in <strong className="text-zinc-200">"{projectName}"</strong>.
              Would you like to save your work before you {targetActionName}, or abandon your changes?
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={onAbandon}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-red-900/50 transition-colors"
          >
            Abandon Changes
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="btn-brand-accent flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white shadow-md shadow-[#e31084]/20 transition-all disabled:opacity-50 cursor-pointer"
            style={{ backgroundColor: '#e31084' }}
          >
            {saving ? <Loader2 size={13} className="animate-spin text-white" /> : null}
            <span>{saving ? 'Saving...' : 'Save & Continue'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

