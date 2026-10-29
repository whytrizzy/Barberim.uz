'use client';

import React, { useState } from 'react';
import { MasterType } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Plus, Trash2, Check, X, Users } from 'lucide-react';
import { Button } from '../ui/Button';

interface MasterManagerProps {
  masters: MasterType[];
  onAddMaster: (data: { name: string; specialty?: string }) => Promise<void>;
  onEditMaster: (id: string, data: { name: string; specialty?: string }) => Promise<void>;
  onDeleteMaster: (id: string) => Promise<void>;
}

export function MasterManager({
  masters,
  onAddMaster,
  onEditMaster,
  onDeleteMaster,
}: MasterManagerProps) {
  const { t } = useLanguage();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName('');
    setSpecialty('');
    setAdding(false);
    setEditingId(null);
  };

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (editingId) {
        await onEditMaster(editingId, { name: name.trim(), specialty: specialty.trim() || undefined });
      } else {
        await onAddMaster({ name: name.trim(), specialty: specialty.trim() || undefined });
      }
      reset();
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (m: MasterType) => {
    setEditingId(m.id);
    setAdding(false);
    setName(m.name);
    setSpecialty(m.specialty || '');
  };

  const activeMasters = masters.filter((m) => m.isActive !== false);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="text-xl font-extrabold tracking-tight text-white">Ustalar</div>
          <p className="text-xs text-muted mt-0.5">
            Har bir ustaning alohida jadvali bo&apos;ladi
          </p>
        </div>
        {!adding && !editingId && (
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Qo&apos;shish
          </Button>
        )}
      </div>

      {/* Add / edit form */}
      {(adding || editingId) && (
        <div className="card p-4 mt-3 space-y-2.5">
          <div className="cap">{editingId ? 'Ustani tahrirlash' : 'Yangi usta'}</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ism (masalan: Jasur)"
            className="w-full bg-surface-2 border border-line rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-dim outline-none focus:border-gold"
          />
          <input
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="Ixtisos (ixtiyoriy: fade, soqol…)"
            className="w-full bg-surface-2 border border-line rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-dim outline-none focus:border-gold"
          />
          <div className="flex gap-2 pt-1">
            <Button variant="primary" size="sm" fullWidth disabled={busy || !name.trim()} onClick={submit}>
              <Check className="w-3.5 h-3.5 mr-1" /> {busy ? t('saving') : t('save')}
            </Button>
            <Button variant="secondary" size="sm" fullWidth onClick={reset}>
              <X className="w-3.5 h-3.5 mr-1" /> {t('cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {activeMasters.length === 0 && !adding ? (
        <div className="card text-center py-8 mt-3">
          <Users className="w-8 h-8 text-dim mx-auto mb-2" />
          <p className="text-xs text-muted">Hali usta qo&apos;shilmagan</p>
        </div>
      ) : (
        activeMasters.map((m) => (
          <div key={m.id} className="card p-3.5 mt-2.5 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-gold to-gold-600 flex items-center justify-center text-lg font-black text-gold-ink shrink-0">
              {m.name.trim().charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0" onClick={() => startEdit(m)}>
              <div className="text-sm font-bold text-white truncate">{m.name}</div>
              {m.specialty && <div className="text-[11px] text-muted truncate">{m.specialty}</div>}
            </div>
            <button
              onClick={() => onDeleteMaster(m.id)}
              className="shrink-0 text-danger/80 hover:text-danger p-2"
              aria-label="O'chirish"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
