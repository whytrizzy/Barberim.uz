'use client';

import React from 'react';
import { TimeSlot } from '@/types';
import { Clock, AlertCircle } from 'lucide-react';
import { triggerHapticFeedback } from '@/lib/telegramWebApp';

interface TimeSlotPickerProps {
  slots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  onSelectSlot: (slot: TimeSlot) => void;
  loading?: boolean;
}

export function TimeSlotPicker({
  slots,
  selectedSlot,
  onSelectSlot,
  loading = false,
}: TimeSlotPickerProps) {
  if (loading) {
    return (
      <div className="py-8 text-center space-y-2">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-slate-400">Calculating available time slots...</p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
        <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
        <h4 className="text-sm font-bold text-white">No Available Slots</h4>
        <p className="text-xs text-slate-400">
          The barber is not working or has no free time slots on this date. Please pick another date.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
        <span className="flex items-center gap-1.5 font-medium text-slate-300">
          <Clock className="w-3.5 h-3.5 text-amber-400" /> Select Start Time
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Available
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-700"></span> Booked / Break
          </span>
        </div>
      </div>

      {/* Slots Grid */}
      <div className="grid grid-cols-4 gap-2">
        {slots.map((slot, index) => {
          const isSelected = selectedSlot?.time === slot.time;
          const isAvailable = slot.available;

          return (
            <button
              key={`${slot.time}-${index}`}
              disabled={!isAvailable}
              onClick={() => {
                if (isAvailable) {
                  triggerHapticFeedback('medium');
                  onSelectSlot(slot);
                }
              }}
              className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center border ${
                isSelected
                  ? 'bg-amber-500 text-slate-950 border-amber-400 ring-2 ring-amber-400/40 shadow-lg shadow-amber-500/25 scale-[1.03]'
                  : isAvailable
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 active:scale-95'
                  : 'bg-slate-900/60 text-slate-600 border-slate-800/80 cursor-not-allowed opacity-50'
              }`}
            >
              <span>{slot.time}</span>
              {!isAvailable && slot.reason && (
                <span className="text-[9px] font-normal text-slate-500 truncate max-w-full">
                  {slot.reason === 'Lunch break' ? 'Lunch' : slot.reason === 'Booked' ? 'Booked' : 'Passed'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
