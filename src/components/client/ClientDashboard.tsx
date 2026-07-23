'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BookingType } from '@/types';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { BarberDiscovery } from './BarberDiscovery';
import { MyBookings } from './MyBookings';
import { Search, Calendar } from 'lucide-react';

export function ClientDashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'DISCOVERY' | 'MY_BOOKINGS'>('DISCOVERY');
  const [clientBookings, setClientBookings] = useState<BookingType[]>([]);

  const loadClientBookings = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/client/bookings?clientId=${user.id}`);
      const data = await res.json();
      if (data.success) {
        setClientBookings(data.bookings || []);
      }
    } catch (err) {
      console.error('Failed to load client bookings:', err);
    }
  }, [user?.id]);

  useEffect(() => {
    loadClientBookings();
  }, [loadClientBookings]);

  const handleBookingComplete = (booking: BookingType) => {
    setClientBookings([booking, ...clientBookings]);
  };

  const handleCancelBooking = async (bookingId: string) => {
    const res = await fetch(`/api/client/bookings/${bookingId}/cancel`, {
      method: 'PATCH',
    });
    const result = await res.json();
    if (result.success) {
      setClientBookings(
        clientBookings.map((b) =>
          b.id === bookingId ? { ...b, status: 'CANCELLED' } : b
        )
      );
    }
  };

  const upcomingCount = clientBookings.filter(
    (b) => b.status === 'CONFIRMED' || b.status === 'PENDING'
  ).length;

  return (
    <div className="space-y-4">
      {/* Top Navigation Pills */}
      <div className="grid grid-cols-2 gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800">
        <button
          onClick={() => setActiveTab('DISCOVERY')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'DISCOVERY'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Search className="w-4 h-4" /> {t('searchBarbers')}
        </button>

        <button
          onClick={() => {
            setActiveTab('MY_BOOKINGS');
            loadClientBookings(); // Refresh when switching
          }}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all relative ${
            activeTab === 'MY_BOOKINGS'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" /> {t('myBookings')}
          {upcomingCount > 0 && activeTab !== 'MY_BOOKINGS' && (
            <span className="w-4 h-4 bg-amber-500 text-slate-950 rounded-full text-[10px] font-extrabold flex items-center justify-center">
              {upcomingCount}
            </span>
          )}
        </button>
      </div>

      {/* View Tabs */}
      {activeTab === 'DISCOVERY' ? (
        <BarberDiscovery
          onBookingComplete={(booking) => {
            handleBookingComplete(booking);
            setActiveTab('MY_BOOKINGS');
          }}
        />
      ) : (
        <MyBookings bookings={clientBookings} onCancelBooking={handleCancelBooking} />
      )}
    </div>
  );
}
