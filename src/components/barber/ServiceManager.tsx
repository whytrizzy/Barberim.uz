'use client';

import React, { useState } from 'react';
import { ServiceType } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Plus, Trash2, Clock, Banknote, Scissors, Pencil, X, Check } from 'lucide-react';
import { Button } from '../ui/Button';

interface ServiceManagerProps {
  services: ServiceType[];
  onAddService: (newService: { name: string; durationMinutes: number; price: number }) => Promise<void>;
  onEditService: (serviceId: string, data: { name: string; durationMinutes: number; price: number }) => Promise<void>;
  onDeleteService: (serviceId: string) => Promise<void>;
}

export function ServiceManager({
  services,
  onAddService,
  onEditService,
  onDeleteService,
}: ServiceManagerProps) {
  const { t } = useLanguage();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [price, setPrice] = useState(100000);
  const [loading, setLoading] = useState(false);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editDuration, setEditDuration] = useState(30);
  const [editPrice, setEditPrice] = useState(100000);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || durationMinutes <= 0 || price <= 0) return;

    setLoading(true);
    try {
      await onAddService({ name, durationMinutes, price });
      setName('');
      setDurationMinutes(30);
      setPrice(100000);
      setIsAdding(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (service: ServiceType) => {
    setEditingId(service.id);
    setEditName(service.name);
    setEditDuration(service.durationMinutes);
    setEditPrice(service.price);
  };

  const handleEditSubmit = async (serviceId: string) => {
    if (!editName || editDuration <= 0 || editPrice <= 0) return;
    setLoading(true);
    try {
      await onEditService(serviceId, {
        name: editName,
        durationMinutes: editDuration,
        price: editPrice,
      });
      setEditingId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('uz-UZ').format(val) + ' UZS';
  };

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Scissors className="w-4 h-4 text-amber-400" /> {t('serviceManagement')}
          </h3>
          <p className="text-xs text-slate-400">{t('serviceDesc')}</p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold border border-amber-500/30 transition-all"
        >
          <Plus className="w-4 h-4" /> {isAdding ? t('cancel') : t('addService')}
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wide">{t('newServiceDetails')}</h4>
          
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">{t('serviceName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              placeholder="e.g. Fade Cut & Beard Styling"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">{t('durationMins')}</label>
              <div className="relative">
                <Clock className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="number"
                  step={5}
                  min={10}
                  max={240}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">{t('priceUzs')}</label>
              <div className="relative">
                <Banknote className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                <input
                  type="number"
                  step={5000}
                  min={10000}
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>
            </div>
          </div>

          <Button type="submit" variant="primary" size="sm" fullWidth disabled={loading}>
            {loading ? t('saving') : t('saveService')}
          </Button>
        </form>
      )}

      <div className="space-y-2.5">
        {services.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">{t('noServices')}</p>
        ) : (
          services.map((service) => {
            const isEditing = editingId === service.id;

            if (isEditing) {
              return (
                <div
                  key={service.id}
                  className="bg-slate-900/80 border border-amber-500/40 p-3.5 rounded-xl space-y-2.5"
                >
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <Clock className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                      <input
                        type="number"
                        step={5}
                        min={10}
                        value={editDuration}
                        onChange={(e) => setEditDuration(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="relative">
                      <Banknote className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
                      <input
                        type="number"
                        step={5000}
                        min={10000}
                        value={editPrice}
                        onChange={(e) => setEditPrice(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="flex-1"
                      disabled={loading}
                      onClick={() => handleEditSubmit(service.id)}
                    >
                      <Check className="w-3.5 h-3.5 mr-1" /> {t('save')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={service.id}
                className="flex items-center justify-between bg-slate-900/60 border border-slate-800 hover:border-slate-700 p-3.5 rounded-xl transition-all"
              >
                <div>
                  <h4 className="text-sm font-semibold text-white">{service.name}</h4>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                    <span className="flex items-center gap-1 text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-amber-400" /> {service.durationMinutes} mins
                    </span>
                    <span className="flex items-center gap-1 font-bold text-amber-300">
                      <Banknote className="w-3.5 h-3.5 text-emerald-400" /> {formatPrice(service.price)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEditing(service)}
                    className="text-slate-500 hover:text-amber-400 p-2 rounded-lg hover:bg-amber-500/10 transition-all"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDeleteService(service.id)}
                    className="text-slate-500 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
