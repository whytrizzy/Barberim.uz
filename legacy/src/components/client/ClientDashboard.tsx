'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BookingType } from '@/types';
import { useAuth } from '@/lib/AuthContext';
import { apiFetch } from '@/lib/apiClient';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { BarberDiscovery } from './BarberDiscovery';
import { MyBookings } from './MyBookings';

export function ClientDashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'DISCOVERY' | 'MY_BOOKINGS'>('DISCOVERY');
  const [clientBookings, setClientBookings] = useState<BookingType[]>([]);

  const loadClientBookings = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await apiFetch(`/api/client/bookings?clientId=${user.id}`);
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
    const res = await apiFetch(`/api/client/bookings/${bookingId}/cancel`, {
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
    <div className="pb-20">
      {activeTab === 'DISCOVERY' ? (
        <div className="view-fade">
          <BarberDiscovery
            onBookingComplete={(booking) => {
              handleBookingComplete(booking);
              setActiveTab('MY_BOOKINGS');
            }}
          />
        </div>
      ) : (
        <div className="view-fade">
          <MyBookings bookings={clientBookings} onCancelBooking={handleCancelBooking} />
        </div>
      )}

      {/* Bottom navigation */}
      <nav className="bottom-nav">
        <a
          className={activeTab === 'DISCOVERY' ? 'on' : ''}
          onClick={() => setActiveTab('DISCOVERY')}
        >
          <span className="ic">🏠</span>
          {t('searchBarbers')}
        </a>
        <a
          className={activeTab === 'MY_BOOKINGS' ? 'on' : ''}
          onClick={() => {
            setActiveTab('MY_BOOKINGS');
            loadClientBookings();
          }}
        >
          <span className="ic">📅</span>
          {t('myBookings')}
          {upcomingCount > 0 && (
            <span className="inline-flex items-center justify-center ml-1 w-4 h-4 bg-gold text-gold-ink rounded-full text-[9px] font-extrabold align-middle">
              {upcomingCount}
            </span>
          )}
        </a>
      </nav>
    </div>
  );
}
