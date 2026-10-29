'use client';

import React from 'react';
import { TimeSlot } from '@/types';
import { AlertCircle } from 'lucide-react';
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
        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-muted">Bo&apos;sh vaqtlar hisoblanmoqda…</p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="card p-6 text-center space-y-2">
        <AlertCircle className="w-8 h-8 text-gold mx-auto" />
        <h4 className="text-sm font-bold text-white">Bo&apos;sh vaqt yo&apos;q</h4>
        <p className="text-xs text-muted">
          Bu kunda barber ishlamaydi yoki barcha vaqtlar band. Boshqa kunni tanlang.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
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
            className={`py-3 px-2 rounded-xl text-[13.5px] font-bold transition-all flex flex-col items-center justify-center border ${
              isSelected
                ? 'bg-gradient-to-br from-gold to-gold-600 text-gold-ink border-transparent scale-[1.04]'
                : isAvailable
                ? 'bg-surface text-ok border-ok/25 active:scale-95'
                : 'bg-transparent text-dim border-line/60 cursor-not-allowed'
            }`}
          >
            <span className={!isAvailable ? 'line-through' : ''}>{slot.time}</span>
            {!isAvailable && slot.reason && (
              <span className="text-[9px] font-semibold mt-0.5">
                {slot.reason === 'Lunch break' ? 'Tushlik' : slot.reason === 'Booked' ? 'Band' : "O'tdi"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
