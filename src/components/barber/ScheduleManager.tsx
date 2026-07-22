'use client';

import React, { useState } from 'react';
import { WorkingHours } from '@/types';
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
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" /> Working Schedule
          </h3>
          <p className="text-xs text-slate-400">Set work days, hours & lunch breaks</p>
        </div>
        {savedSuccess && (
          <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
            <Check className="w-3.5 h-3.5" /> Updated!
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Working Days Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2">Working Days</label>
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
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Start / End Hours */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" /> Salon Hours
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-[10px] text-slate-400 mb-1">Start Time</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 mb-1">Closing Time</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                required
              />
            </div>
          </div>
        </div>

        {/* Lunch Break Times */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
            <Coffee className="w-3.5 h-3.5 text-amber-400" /> Lunch / Break Hours
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-[10px] text-slate-400 mb-1">Break Starts</span>
              <input
                type="time"
                value={breakStart}
                onChange={(e) => setBreakStart(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 mb-1">Break Ends</span>
              <input
                type="time"
                value={breakEnd}
                onChange={(e) => setBreakEnd(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        <Button type="submit" variant="primary" size="md" fullWidth disabled={loading}>
          {loading ? 'Saving Schedule...' : (
            <span className="flex items-center justify-center gap-1.5">
              <Save className="w-4 h-4" /> Save Schedule Changes
            </span>
          )}
        </Button>
      </form>
    </div>
  );
}
