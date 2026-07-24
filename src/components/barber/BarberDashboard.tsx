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
import { Link2, Check } from 'lucide-react';
import { formatTashkentDate, formatUZS, tashkentDateOption } from '@/lib/dateUtils';

export function BarberDashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'BOOKINGS' | 'SERVICES' | 'SCHEDULE' | 'PROFILE'>('BOOKINGS');

  const [profile, setProfile] = useState<BarberProfileType | null>(null);
  const [services, setServices] = useState<ServiceType[]>([]);
  const [bookings, setBookings] = useState<BookingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  // ─── Handlers (unchanged logic) ───────────────────────────────────

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

  const copyReferralLink = async () => {
    const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || 'barberim_uz_bot';
    const link = `https://t.me/${botUsername}?start=barber_${barberId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — show the link via prompt as fallback
      window.prompt('Havolani nusxalang:', link);
    }
  };

  // ─── Loading ──────────────────────────────────────────────────────

  if (loading || !profile) {
    return (
      <div className="py-12 text-center space-y-2">
        <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-muted">{t('loading')}</p>
      </div>
    );
  }

  // Today's stats (Tashkent calendar day)
  const todayISO = tashkentDateOption(0).isoDate;
  const todayBookings = bookings.filter((b) => {
    const d = new Date(new Date(b.startTime).getTime() + 5 * 3600 * 1000);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return iso === todayISO && (b.status === 'CONFIRMED' || b.status === 'COMPLETED');
  });
  const todayRevenue = todayBookings.reduce((sum, b) => sum + b.totalPrice, 0);
  const activeBookingsCount = bookings.filter((b) => b.status === 'CONFIRMED').length;

  const firstName = (user?.fullName || '').split(' ')[0];

  return (
    <div className="px-4 pt-4 pb-24">
      {activeTab === 'BOOKINGS' && (
        <div className="view-fade">
          {/* Greeting */}
          <div className="mb-3.5">
            <div className="cap">{formatTashkentDate(new Date(), true)}</div>
            <div className="text-xl font-extrabold tracking-tight text-white mt-0.5">
              {firstName ? `Xayrli kun, ${firstName}` : t('barberDashboard')}
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-2.5">
            <div className="flex-1 card p-3.5">
              <b className="text-2xl font-extrabold text-white block tracking-tight">{todayBookings.length}</b>
              <span className="text-[11px] text-muted">Bugungi booking</span>
            </div>
            <div className="flex-1 card p-3.5">
              <b className="text-2xl font-extrabold text-gold block tracking-tight">
                {todayRevenue >= 1000000
                  ? `${(todayRevenue / 1000000).toFixed(1)}M`
                  : todayRevenue >= 1000
                  ? `${Math.round(todayRevenue / 1000)}k`
                  : todayRevenue}
              </b>
              <span className="text-[11px] text-muted">Kutilayotgan daromad</span>
            </div>
          </div>

          {/* Referral link card */}
          <div className="card-gold p-4 mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-white flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-gold" /> Booking havolangiz
              </div>
              <div className="text-[11px] text-muted mt-0.5">Instagram bio va Telegram uchun</div>
            </div>
            <button
              onClick={copyReferralLink}
              className="shrink-0 bg-gradient-to-br from-gold to-gold-600 text-gold-ink text-xs font-extrabold px-3.5 py-2.5 rounded-xl active:scale-95 transition-transform flex items-center gap-1"
            >
              {copied ? (<><Check className="w-3.5 h-3.5" /> Nusxalandi</>) : 'Nusxa olish'}
            </button>
          </div>

          {/* Queue */}
          <div className="cap mt-5 mb-1">{t('bookingManagement')}</div>
          <BookingManager bookings={bookings} onUpdateStatus={handleUpdateBookingStatus} />
        </div>
      )}

      {activeTab === 'SERVICES' && (
        <div className="view-fade">
          <ServiceManager
            services={services}
            onAddService={handleAddService}
            onEditService={handleEditService}
            onDeleteService={handleDeleteService}
          />
        </div>
      )}
      {activeTab === 'SCHEDULE' && (
        <div className="view-fade">
          <ScheduleManager workingHours={profile.workingHours} onSaveSchedule={handleUpdateSchedule} />
        </div>
      )}
      {activeTab === 'PROFILE' && (
        <div className="view-fade">
          <ProfileSettings profile={profile} onSave={handleUpdateProfile} />
        </div>
      )}

      {/* Bottom navigation */}
      <nav className="bottom-nav">
        <a className={activeTab === 'BOOKINGS' ? 'on' : ''} onClick={() => setActiveTab('BOOKINGS')}>
          <span className="ic">📅</span>
          {t('tabBookings')}
          {activeBookingsCount > 0 && activeTab !== 'BOOKINGS' && (
            <span className="inline-flex items-center justify-center ml-1 w-4 h-4 bg-gold text-gold-ink rounded-full text-[9px] font-extrabold align-middle">
              {activeBookingsCount}
            </span>
          )}
        </a>
        <a className={activeTab === 'SERVICES' ? 'on' : ''} onClick={() => setActiveTab('SERVICES')}>
          <span className="ic">✂️</span>
          {t('tabServices')}
        </a>
        <a className={activeTab === 'SCHEDULE' ? 'on' : ''} onClick={() => setActiveTab('SCHEDULE')}>
          <span className="ic">🕐</span>
          {t('tabSchedule')}
        </a>
        <a className={activeTab === 'PROFILE' ? 'on' : ''} onClick={() => setActiveTab('PROFILE')}>
          <span className="ic">👤</span>
          {t('tabProfile')}
        </a>
      </nav>
    </div>
  );
}
