'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BarberProfileType, ServiceType, BookingType, WorkingHours, BookingStatus } from '@/types';
import { useAuth } from '@/lib/AuthContext';
import { apiFetch } from '@/lib/apiClient';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { ProfileSettings } from './ProfileSettings';
import { ServiceManager } from './ServiceManager';
import { ScheduleManager } from './ScheduleManager';
import { BookingManager } from './BookingManager';
import { Calendar, Scissors, Settings, Clock } from 'lucide-react';

export function BarberDashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'BOOKINGS' | 'SERVICES' | 'SCHEDULE' | 'PROFILE'>('BOOKINGS');

  const [profile, setProfile] = useState<BarberProfileType | null>(null);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [bookings, setBookings] = useState<BookingType[]>([]);
  const [loading, setLoading] = useState(true);

  const barberId = user?.barberProfileId;
  const userId = user?.id;

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const profRes = await apiFetch('/api/barber/profile');
      const profData = await profRes.json();
      if (profData.success && profData.profile) {
        setProfile(profData.profile);
        const bId = profData.profile.id;

        const [servRes, bookRes] = await Promise.all([
          apiFetch(`/api/barber/services?barberId=${bId}`),
          apiFetch(`/api/barber/bookings?barberId=${bId}`),
        ]);

        const servData = await servRes.json();
        if (servData.success) setServices(servData.services || []);

        const bookData = await bookRes.json();
        if (bookData.success) setBookings(bookData.bookings || []);
      }
    } catch (err) {
      console.error('Failed to load barber data:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Handler Actions ─────────────────────────────────────────────

  const handleUpdateProfile = async (data: {
    shopName?: string;
    bio?: string;
    address?: string;
    fullName?: string;
    phone?: string;
  }) => {
    const res = await apiFetch('/api/barber/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...data }),
    });
    const result = await res.json();
    if (result.success) {
      setProfile(result.profile);
    }
  };

  const handleAddService = async (newService: { name: string; durationMinutes: number; price: number }) => {
    const res = await apiFetch('/api/barber/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newService, barberId }),
    });
    const result = await res.json();
    if (result.success) {
      setServices([...services, result.service]);
    }
  };

  const handleEditService = async (serviceId: string, data: { name: string; durationMinutes: number; price: number }) => {
    const res = await apiFetch(`/api/barber/services/${serviceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success) {
      setServices(services.map((s) => (s.id === serviceId ? result.service : s)));
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    const res = await apiFetch(`/api/barber/services/${serviceId}`, {
      method: 'DELETE',
    });
    const result = await res.json();
    if (result.success) {
      setServices(services.filter((s) => s.id !== serviceId));
    }
  };

  const handleUpdateSchedule = async (schedule: WorkingHours) => {
    const res = await apiFetch('/api/barber/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, workingHours: schedule }),
    });
    const result = await res.json();
    if (result.success) {
      setProfile(result.profile);
    }
  };

  const handleUpdateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    const res = await apiFetch(`/api/barber/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const result = await res.json();
    if (result.success) {
      setBookings(bookings.map((b) => (b.id === bookingId ? { ...b, status } : b)));
    }
  };

  // ─── Loading State ────────────────────────────────────────────────

  if (loading || !profile) {
    return (
      <div className="py-12 text-center space-y-2">
        <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-slate-400">{t('loading')}</p>
      </div>
    );
  }

  const activeBookingsCount = bookings.filter((b) => b.status === 'CONFIRMED').length;

  return (
    <div className="space-y-4">
      {/* Navigation Tabs */}
      <div className="grid grid-cols-4 gap-1 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800">
        <button
          onClick={() => setActiveTab('BOOKINGS')}
          className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all relative ${
            activeTab === 'BOOKINGS'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4 mb-1" />
          <span>{t('tabBookings')}</span>
          {activeBookingsCount > 0 && activeTab !== 'BOOKINGS' && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 rounded-full text-[10px] font-bold flex items-center justify-center border border-slate-900">
              {activeBookingsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('SERVICES')}
          className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'SERVICES'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Scissors className="w-4 h-4 mb-1" />
          <span>{t('tabServices')}</span>
        </button>

        <button
          onClick={() => setActiveTab('SCHEDULE')}
          className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'SCHEDULE'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4 mb-1" />
          <span>{t('tabSchedule')}</span>
        </button>

        <button
          onClick={() => setActiveTab('PROFILE')}
          className={`flex flex-col items-center justify-center py-2.5 rounded-xl text-xs font-semibold transition-all ${
            activeTab === 'PROFILE'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings className="w-4 h-4 mb-1" />
          <span>{t('tabProfile')}</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'BOOKINGS' && (
        <BookingManager bookings={bookings} onUpdateStatus={handleUpdateBookingStatus} />
      )}
      {activeTab === 'SERVICES' && (
        <ServiceManager
          services={services}
          onAddService={handleAddService}
          onEditService={handleEditService}
          onDeleteService={handleDeleteService}
        />
      )}
      {activeTab === 'SCHEDULE' && (
        <ScheduleManager workingHours={profile.workingHours} onSaveSchedule={handleUpdateSchedule} />
      )}
      {activeTab === 'PROFILE' && (
        <ProfileSettings profile={profile} onSave={handleUpdateProfile} />
      )}
    </div>
  );
}
