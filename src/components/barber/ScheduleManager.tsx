'use client';

import React, { useState } from 'react';
import { WorkingHours } from '@/types';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { Calendar, Clock, Coffee, Save, Check } from 'lucide-react';
import { Button } from '../ui/Button';

interface ScheduleManagerProps {
  workingHours: WorkingHours;
  onSaveSchedule: (updated: WorkingHours) => Promise<void>;
}

const DAYS_MAP = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 0, label: 'Sun' },
];

export function ScheduleManager({ workingHours, onSaveSchedule }: ScheduleManagerProps) {
  const { t } = useLanguage();
  const [workDays, setWorkDays] = useState<number[]>(workingHours.workDays || [1, 2, 3, 4, 5, 6]);
  const [startTime, setStartTime] = useState(workingHours.startTime || '09:00');
  const [endTime, setEndTime] = useState(workingHours.endTime || '20:00');
  const [breakStart, setBreakStart] = useState(workingHours.breakStart || '13:00');
  const [breakEnd, setBreakEnd] = useState(workingHours.breakEnd || '14:00');
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const toggleDay = (dayId: number) => {
    if (workDays.includes(dayId)) {
      setWorkDays(workDays.filter((d) => d !== dayId));
    } else {
      setWorkDays([...workDays, dayId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSaveSchedule({
        workDays,
        startTime,
        endTime,
        breakStart,
        breakEnd,
        slotDurationMinutes: workingHours.slotDurationMinutes || 30,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gold" /> {t('workingSchedule')}
          </h3>
          <p className="text-xs text-muted">{t('scheduleDesc')}</p>
        </div>
        {savedSuccess && (
          <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
            <Check className="w-3.5 h-3.5" /> {t('saved')}
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-muted mb-2">{t('workingDays')}</label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {DAYS_MAP.map((day) => {
              const active = workDays.includes(day.id);
              return (
                <button
                  type="button"
                  key={day.id}
                  onClick={() => toggleDay(day.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    active
                      ? 'bg-gold text-gold-ink border-gold shadow-md '
                      : 'bg-surface text-muted border-line hover:border-line'
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-gold" /> {t('salonHours')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-[10px] text-muted mb-1">{t('startTime')}</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-gold"
                required
              />
            </div>
            <div>
              <span className="block text-[10px] text-muted mb-1">{t('endTime')}</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-gold"
                required
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted mb-2 flex items-center gap-1.5">
            <Coffee className="w-3.5 h-3.5 text-gold" /> {t('breakHours')}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-[10px] text-muted mb-1">{t('breakStarts')}</span>
              <input
                type="time"
                value={breakStart}
                onChange={(e) => setBreakStart(e.target.value)}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <span className="block text-[10px] text-muted mb-1">{t('breakEnds')}</span>
              <input
                type="time"
                value={breakEnd}
                onChange={(e) => setBreakEnd(e.target.value)}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-gold"
              />
            </div>
          </div>
        </div>

        <Button type="submit" variant="primary" size="md" fullWidth disabled={loading}>
          {loading ? t('saving') : (
            <span className="flex items-center justify-center gap-1.5">
              <Save className="w-4 h-4" /> {t('saveSchedule')}
            </span>
          )}
        </Button>
      </form>
    </div>
  );
}
