'use client';

import React, { useState } from 'react';
import { BarberProfileType, BookingType } from '@/types';
import { BarberBookingWizard } from './BarberBookingWizard';
import { MyBookings } from './MyBookings';
import { Scissors, Calendar } from 'lucide-react';

interface ClientDashboardProps {
  barber: BarberProfileType;
  clientBookings: BookingType[];
  onBookingComplete: (booking: BookingType) => void;
  onCancelBooking: (bookingId: string) => Promise<void>;
}

export function ClientDashboard({
  barber,
  clientBookings,
  onBookingComplete,
  onCancelBooking,
}: ClientDashboardProps) {
  const [activeTab, setActiveTab] = useState<'BOOK' | 'MY_BOOKINGS'>('BOOK');

  const upcomingCount = clientBookings.filter(
    (b) => b.status === 'CONFIRMED' || b.status === 'PENDING'
  ).length;

  return (
    <div className="space-y-4">
      {/* Top Client Navigation Pills */}
      <div className="grid grid-cols-2 gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800">
        <button
          onClick={() => setActiveTab('BOOK')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'BOOK'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Scissors className="w-4 h-4" /> Book Appointment
        </button>

        <button
          onClick={() => setActiveTab('MY_BOOKINGS')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all relative ${
            activeTab === 'MY_BOOKINGS'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" /> My Appointments
          {upcomingCount > 0 && activeTab !== 'MY_BOOKINGS' && (
            <span className="w-4 h-4 bg-amber-500 text-slate-950 rounded-full text-[10px] font-extrabold flex items-center justify-center">
              {upcomingCount}
            </span>
          )}
        </button>
      </div>

      {/* Views */}
      {activeTab === 'BOOK' ? (
        <BarberBookingWizard
          barber={barber}
          onBookingComplete={(booking) => {
            onBookingComplete(booking);
            setActiveTab('MY_BOOKINGS');
          }}
        />
      ) : (
        <MyBookings bookings={clientBookings} onCancelBooking={onCancelBooking} />
      )}
    </div>
  );
}
